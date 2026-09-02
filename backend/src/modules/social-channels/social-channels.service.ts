import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SocialChannel, SocialChannelProvider } from '@prisma/client';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeSocialChannel, SerializedSocialChannel } from './serializers/social-channel.serializer';

/** API Graph de Meta — una sola versión fija en vez de "latest" (spec plan
 *  §4): un bump de versión de Meta no debe cambiar de golpe el shape de
 *  respuesta que este servicio parsea. */
export const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_TIMEOUT_MS = 8000;

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number; // Segundos — ausente cuando el token es de larga duración "indefinida".
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

interface MetaPagesResponse {
  data: MetaPage[];
}

interface InstagramAccountDetails {
  id: string;
  username?: string;
  profile_picture_url?: string;
}

interface WhatsAppPhoneNumberDetails {
  display_phone_number: string;
  verified_name?: string;
}

/**
 * Feature 10 — Integraciones No-Code (Fase 2). Encapsula todo el trato
 * directo con la Graph API de Meta: nadie más en el backend construye una URL
 * de `graph.facebook.com` — siempre pasa por aquí, que a su vez delega el
 * cifrado de tokens a `EncryptionService` (mismo patrón que
 * GoogleCalendarService con `googleapis`).
 */
@Injectable()
export class SocialChannelsService {
  private readonly logger = new Logger(SocialChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /** GET /marketing/channels — nunca incluye accessToken/refreshToken (ver
   *  serializeSocialChannel), así que a diferencia de connectMeta() no hace
   *  falta desencriptar nada acá: el serializer los descarta directo del
   *  registro tal como vino de Prisma. */
  async listChannels(tenantId: string): Promise<SerializedSocialChannel[]> {
    const channels = await this.prisma.socialChannel.findMany({
      where: { tenantId },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    });
    return channels.map(serializeSocialChannel);
  }

  // -------------------------------------------------------------------------
  // Conexión Meta (Facebook Page + Instagram Business, spec RF-1)
  // -------------------------------------------------------------------------

  /**
   * POST /marketing/channels/meta/connect. `shortLivedUserToken` es el token
   * que el SDK de Facebook Login entrega en el navegador tras el login — de
   * corta duración (~1-2h) y de USUARIO, nunca se guarda tal cual:
   *
   * 1. Se cambia por un token de usuario de LARGA duración (~60 días).
   * 2. Se listan las Páginas administradas por ese usuario — cada una trae su
   *    propio `access_token` de Página, que hereda la duración larga del
   *    token de usuario que lo generó (no expira en 60 días como el de
   *    usuario, es de duración indefinida mientras el usuario mantenga el
   *    permiso).
   * 3. Cada Página se guarda como un SocialChannel META_FACEBOOK; si tiene
   *    una cuenta de Instagram Business vinculada, esa se guarda además como
   *    un SocialChannel META_INSTAGRAM aparte, reusando el mismo token de
   *    Página (la Graph API de Instagram se autentica con el token de la
   *    Página vinculada, no con uno propio).
   *
   * Upsert por `[tenantId, provider, externalId]`: reconectar (ej. tras
   * revocar y volver a autorizar) actualiza el token en vez de duplicar la
   * fila.
   */
  async connectMeta(tenantId: string, shortLivedUserToken: string): Promise<SerializedSocialChannel[]> {
    const longLivedUserToken = await this.exchangeForLongLivedToken(shortLivedUserToken);
    const pages = await this.listManagedPages(longLivedUserToken);

    if (pages.length === 0) {
      throw new BadRequestException(
        'No encontramos ninguna Página de Facebook administrada por esta cuenta. Verifica que hayas concedido acceso a al menos una Página durante el login.',
      );
    }

    const connected: SocialChannel[] = [];
    for (const page of pages) {
      const facebookChannel = await this.upsertChannel(tenantId, {
        provider: SocialChannelProvider.META_FACEBOOK,
        externalId: page.id,
        name: page.name,
        accessToken: page.access_token,
        metadata: null,
      });
      connected.push(facebookChannel);

      if (page.instagram_business_account) {
        const instagram = await this.fetchInstagramAccount(
          page.instagram_business_account.id,
          page.access_token,
        );
        const instagramChannel = await this.upsertChannel(tenantId, {
          provider: SocialChannelProvider.META_INSTAGRAM,
          externalId: instagram.id,
          name: instagram.username ? `@${instagram.username}` : page.name,
          // La Graph API de IG se autentica con el token de la Página vinculada
          // — no hay un token propio de Instagram que guardar aparte.
          accessToken: page.access_token,
          metadata: instagram.profile_picture_url
            ? { profilePictureUrl: instagram.profile_picture_url }
            : null,
        });
        connected.push(instagramChannel);
      }
    }

    this.logger.log(`${connected.length} canal(es) de Meta conectados para el centro ${tenantId}.`);
    return connected.map(serializeSocialChannel);
  }

  // -------------------------------------------------------------------------
  // Conexión WhatsApp Business (Meta Embedded Signup, spec RF-1)
  // -------------------------------------------------------------------------

  /**
   * POST /marketing/channels/whatsapp/connect. A diferencia de connectMeta,
   * acá el navegador no entrega un token — entrega un `code` (intercambiable
   * por un token de negocio) más el `wabaId`/`phoneNumberId` que el propio
   * flujo de Embedded Signup expone vía `postMessage` al completarse (ver
   * doc comment de ConnectWhatsAppDto). Con eso:
   *
   * 1. Se cambia `code` por un token de negocio.
   * 2. Se suscribe la app a los webhooks de esa WABA (`subscribed_apps`) —
   *    sin esto Meta nunca envía `whatsapp_business_messaging` a nuestro
   *    endpoint de Webhooks (Task 2.6), aunque la conexión "parezca" exitosa.
   * 3. Se consulta el número verificado para mostrarlo en ChannelCard sin
   *    que el usuario tenga que recordarlo/tipearlo.
   */
  async connectWhatsApp(
    tenantId: string,
    dto: { code: string; wabaId: string; phoneNumberId: string },
  ): Promise<SerializedSocialChannel> {
    const businessToken = await this.exchangeCodeForBusinessToken(dto.code);
    await this.subscribeAppToWaba(dto.wabaId, businessToken);
    const phone = await this.fetchWhatsAppPhoneNumber(dto.phoneNumberId, businessToken);

    const channel = await this.upsertChannel(tenantId, {
      provider: SocialChannelProvider.WHATSAPP_OFFICIAL,
      externalId: dto.wabaId,
      name: phone.display_phone_number,
      accessToken: businessToken,
      metadata: { phoneNumberId: dto.phoneNumberId, verifiedName: phone.verified_name ?? null },
    });

    this.logger.log(`WhatsApp Business (WABA ${dto.wabaId}) conectado para el centro ${tenantId}.`);
    return serializeSocialChannel(channel);
  }

  // -------------------------------------------------------------------------
  // Desconexión (todos los proveedores)
  // -------------------------------------------------------------------------

  /**
   * DELETE /marketing/channels/:id. Borrado físico (no un estado
   * DISCONNECTED) — ese status queda reservado para cuando el monitoreo
   * pasivo de RF-2 detecte que Meta/TikTok revocó el token por su cuenta,
   * algo que todavía no existe en este backend; una desconexión que el propio
   * usuario pidió no necesita dejar una fila fantasma.
   *
   * El intento de desuscribir la app de los webhooks del recurso (spec plan
   * §2: "Elimina la conexión y desconecta los webhooks asociados") es
   * best-effort, igual que GoogleCalendarService.disconnect() revocando el
   * refresh token: si el token ya no es válido (usuario revocó el acceso
   * desde Meta primero), igual hay que borrar la fila.
   */
  async disconnectChannel(tenantId: string, channelId: string): Promise<{ id: string }> {
    const channel = await this.prisma.socialChannel.findFirst({
      where: { id: channelId, tenantId },
    });
    if (!channel) {
      throw new NotFoundException('El canal no existe o no pertenece a tu centro estético.');
    }

    try {
      const token = this.encryption.decrypt(channel.accessToken);
      const response = await this.graphFetch(
        `/${channel.externalId}/subscribed_apps`,
        { access_token: token },
        'DELETE',
      );
      if (!response.ok) {
        this.logger.warn(
          `Meta respondió ${response.status} al desuscribir el canal ${channelId} de sus webhooks.`,
        );
      }
    } catch (error) {
      this.logger.warn(`No se pudo desuscribir los webhooks del canal ${channelId}: ${String(error)}`);
    }

    await this.prisma.socialChannel.delete({ where: { id: channelId } });
    this.logger.log(`Canal ${channelId} (${channel.provider}) desconectado del centro ${tenantId}.`);
    return { id: channelId };
  }

  private async upsertChannel(
    tenantId: string,
    input: {
      provider: SocialChannelProvider;
      externalId: string;
      name: string;
      accessToken: string;
      metadata: Record<string, unknown> | null;
    },
  ): Promise<SocialChannel> {
    const encryptedToken = this.encryption.encrypt(input.accessToken);
    return this.prisma.socialChannel.upsert({
      where: {
        tenantId_provider_externalId: {
          tenantId,
          provider: input.provider,
          externalId: input.externalId,
        },
      },
      create: {
        tenantId,
        provider: input.provider,
        externalId: input.externalId,
        name: input.name,
        accessToken: encryptedToken,
        metadata: (input.metadata as Prisma.InputJsonValue | null) ?? undefined,
      },
      update: {
        name: input.name,
        accessToken: encryptedToken,
        status: 'ACTIVE',
        metadata: (input.metadata as Prisma.InputJsonValue | null) ?? undefined,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Graph API — llamadas de bajo nivel
  // -------------------------------------------------------------------------

  private async exchangeForLongLivedToken(shortLivedUserToken: string): Promise<string> {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'La integración con Meta no está configurada en este servidor (META_APP_ID/META_APP_SECRET). Contacta al equipo técnico.',
      );
    }

    const response = await this.graphFetch('/oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedUserToken,
    });
    const body = (await this.parseGraphResponse(response)) as LongLivedTokenResponse;
    return body.access_token;
  }

  private async listManagedPages(longLivedUserToken: string): Promise<MetaPage[]> {
    const response = await this.graphFetch('/me/accounts', {
      fields: 'id,name,access_token,instagram_business_account',
      access_token: longLivedUserToken,
    });
    const body = (await this.parseGraphResponse(response)) as MetaPagesResponse;
    return body.data ?? [];
  }

  private async fetchInstagramAccount(
    instagramAccountId: string,
    pageAccessToken: string,
  ): Promise<InstagramAccountDetails> {
    const response = await this.graphFetch(`/${instagramAccountId}`, {
      fields: 'id,username,profile_picture_url',
      access_token: pageAccessToken,
    });
    return (await this.parseGraphResponse(response)) as InstagramAccountDetails;
  }

  /** Cambia el `code` de Embedded Signup por un token de negocio — mismo
   *  endpoint `/oauth/access_token` que `exchangeForLongLivedToken`, pero sin
   *  `grant_type=fb_exchange_token`: acá es un intercambio de código de
   *  autorización, no un canje de un token existente por otro más largo. */
  private async exchangeCodeForBusinessToken(code: string): Promise<string> {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'La integración con Meta no está configurada en este servidor (META_APP_ID/META_APP_SECRET). Contacta al equipo técnico.',
      );
    }

    const response = await this.graphFetch('/oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      code,
    });
    const body = (await this.parseGraphResponse(response)) as LongLivedTokenResponse;
    return body.access_token;
  }

  /** Sin esto, Meta jamás manda `whatsapp_business_messaging` al webhook
   *  (Task 2.6) aunque la WABA esté "conectada" en nuestra base. */
  private async subscribeAppToWaba(wabaId: string, businessToken: string): Promise<void> {
    const response = await this.graphFetch(`/${wabaId}/subscribed_apps`, { access_token: businessToken }, 'POST');
    await this.parseGraphResponse(response);
  }

  private async fetchWhatsAppPhoneNumber(
    phoneNumberId: string,
    businessToken: string,
  ): Promise<WhatsAppPhoneNumberDetails> {
    const response = await this.graphFetch(`/${phoneNumberId}`, {
      fields: 'display_phone_number,verified_name',
      access_token: businessToken,
    });
    return (await this.parseGraphResponse(response)) as WhatsAppPhoneNumberDetails;
  }

  private async graphFetch(
    path: string,
    params: Record<string, string>,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
  ): Promise<Response> {
    const url = new URL(`${GRAPH_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return fetch(url, { method, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
  }

  private async parseGraphResponse(response: Response): Promise<unknown> {
    const body = (await response.json()) as GraphErrorBody & Record<string, unknown>;
    if (!response.ok || body.error) {
      this.logger.warn(`Graph API respondió con error: ${JSON.stringify(body.error)}`);
      throw new BadRequestException(
        body.error?.message ??
          'Meta rechazó la solicitud de conexión. Vuelve a intentar el proceso desde el botón "Conectar con Meta".',
      );
    }
    return body;
  }
}
