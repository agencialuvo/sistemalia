import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Auth, calendar_v3, google } from 'googleapis';
import { EncryptionService } from '../../common/services/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { CalendarEventPayload } from './types/calendar-event-payload';

/** Único scope que este módulo pide — escritura de eventos. La conexión
 *  "Continuar con Google" (auth/strategies/google.strategy.ts) es un flujo
 *  completamente aparte, con scope `email profile` y su propio callback. */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
}

export interface GoogleIntegrationStatus {
  connected: boolean;
  syncEnabled: boolean;
  parentCalendarId: string | null;
}

/**
 * Feature 09 — Google Calendar Jerárquico (Fase 2). Encapsula todo el trato
 * directo con la librería `googleapis`: nadie más en el backend construye un
 * `OAuth2Client` ni toca `Tenant.googleAccessToken`/`googleRefreshToken` en
 * crudo — siempre pasan por aquí, que a su vez delega el cifrado a
 * `EncryptionService`.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // OAuth2
  // -------------------------------------------------------------------------

  private createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      this.config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      this.config.get<string>('GOOGLE_REDIRECT_URI') ||
        'http://localhost:4000/integrations/google/callback',
    );
  }

  /** GET /integrations/google/connect. */
  async getAuthUrl(tenantId: string): Promise<string> {
    const state = randomUUID();
    await this.redis.setGoogleOAuthState(state, tenantId);

    return this.createOAuthClient().generateAuthUrl({
      // offline -> Google incluye refresh_token en el intercambio; sin esto
      // solo llega un access_token que expira en ~1h y no hay forma de
      // renovarlo sin que el usuario vuelva a autorizar.
      access_type: 'offline',
      // Fuerza la pantalla de consentimiento en cada conexión: Google solo
      // entrega refresh_token la PRIMERA vez que una cuenta autoriza a esta
      // app salvo que se fuerce prompt=consent — sin esto, reconectar tras
      // una desconexión podría no traer refresh_token de vuelta.
      prompt: 'consent',
      scope: [CALENDAR_SCOPE],
      state,
    });
  }

  /** GET /integrations/google/callback — ver redis.constants.ts para por qué
   *  el tenant viaja en `state` en vez de venir de @TenantId(). */
  async handleCallback(code: string, state: string): Promise<{ tenantId: string }> {
    const tenantId = await this.redis.getGoogleOAuthState(state);
    if (!tenantId) {
      throw new BadRequestException(
        'El enlace de autorización expiró o no es válido. Intenta conectar de nuevo.',
      );
    }
    await this.redis.deleteGoogleOAuthState(state);

    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException(
        'Google no otorgó los permisos necesarios. Vuelve a intentar la conexión y acepta todos los permisos solicitados.',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        googleAccessToken: this.encryption.encrypt(tokens.access_token),
        googleRefreshToken: this.encryption.encrypt(tokens.refresh_token),
      },
    });

    this.logger.log(`Cuenta de Google conectada para el centro ${tenantId}.`);
    return { tenantId };
  }

  /** GET /integrations/google/status — le da a la UI (Fase 3) lo mínimo para
   *  decidir qué mostrar sin tener que inferirlo de si /calendars falla. */
  async getStatus(tenantId: string): Promise<GoogleIntegrationStatus> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleRefreshToken: true, googleSyncEnabled: true, googleCalendarParentId: true },
    });
    if (!tenant) {
      throw new NotFoundException('El centro estético no existe.');
    }
    return {
      connected: Boolean(tenant.googleRefreshToken),
      syncEnabled: tenant.googleSyncEnabled,
      parentCalendarId: tenant.googleCalendarParentId,
    };
  }

  /** GET /integrations/google/calendars. */
  async listCalendars(tenantId: string): Promise<GoogleCalendarListItem[]> {
    const client = await this.getAuthorizedClient(tenantId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.calendarList.list({ maxResults: 250 });

    return (data.items ?? [])
      .filter((item): item is calendar_v3.Schema$CalendarListEntry & { id: string; summary: string } =>
        Boolean(item.id && item.summary),
      )
      .map((item) => ({
        id: item.id,
        summary: item.summary,
        primary: item.primary ?? false,
        accessRole: item.accessRole ?? null,
      }));
  }

  /** POST /integrations/google/select-parent — elegir el calendario padre
   *  activa la sincronización (spec §3.2: interruptor maestro). */
  async selectParentCalendar(tenantId: string, calendarId: string): Promise<void> {
    // Confirma que el tenant sigue conectado antes de "activar" nada — evita
    // guardar un googleCalendarParentId huérfano si los tokens se perdieron
    // entre que el frontend cargó la lista y el usuario eligió una fila.
    await this.getAuthorizedClient(tenantId);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { googleCalendarParentId: calendarId, googleSyncEnabled: true },
    });
  }

  /** DELETE /integrations/google/disconnect. */
  async disconnect(tenantId: string): Promise<void> {
    const tenant = await this.mustFindTenant(tenantId);

    if (tenant.googleRefreshToken) {
      try {
        await this.createOAuthClient().revokeToken(this.encryption.decrypt(tenant.googleRefreshToken));
      } catch (error) {
        // Revocar es un esfuerzo de buena vecindad con Google, no una
        // condición para desconectar acá — si el token ya era inválido (el
        // usuario lo revocó desde su cuenta de Google, por ejemplo), igual
        // hay que limpiar nuestros campos.
        this.logger.warn(`No se pudo revocar el token de Google del centro ${tenantId}: ${String(error)}`);
      }
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleCalendarParentId: null,
        googleSyncEnabled: false,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Eventos (consumidos por AppointmentsService en Fase 3)
  // -------------------------------------------------------------------------

  async createCalendarEvent(
    tenantId: string,
    calendarId: string,
    payload: CalendarEventPayload,
  ): Promise<string> {
    const client = await this.getAuthorizedClient(tenantId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: this.toGoogleEvent(payload),
    });

    if (!data.id) {
      throw new BadRequestException('Google no devolvió un identificador para el evento creado.');
    }
    return data.id;
  }

  async updateCalendarEvent(
    tenantId: string,
    calendarId: string,
    eventId: string,
    payload: CalendarEventPayload,
  ): Promise<void> {
    const client = await this.getAuthorizedClient(tenantId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: this.toGoogleEvent(payload),
    });
  }

  async deleteCalendarEvent(tenantId: string, calendarId: string, eventId: string): Promise<void> {
    const client = await this.getAuthorizedClient(tenantId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch (error) {
      // 404/410: el evento ya no existe en Google (borrado a mano desde ahí,
      // o ya lo habíamos borrado antes) — idempotente, no es un error para
      // quien nos llama.
      if (this.isGoneOrNotFound(error)) return;
      throw error;
    }
  }

  private toGoogleEvent(payload: CalendarEventPayload): calendar_v3.Schema$Event {
    return {
      summary: payload.summary,
      description: payload.description,
      location: payload.location,
      start: { dateTime: payload.startAt },
      end: { dateTime: payload.endAt },
      attendees: payload.attendees?.map((email) => ({ email })),
    };
  }

  private isGoneOrNotFound(error: unknown): boolean {
    const status = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;
    return status === 404 || status === 410;
  }

  // -------------------------------------------------------------------------
  // Refresco de tokens
  // -------------------------------------------------------------------------

  /**
   * Devuelve un `OAuth2Client` con las credenciales del tenant cargadas.
   * `googleapis` renueva el access_token internamente cuando expira,
   * siempre que `refresh_token` esté seteado — el listener `tokens` abajo
   * persiste ese access_token renovado de vuelta en `Tenant`, encriptado,
   * para que la próxima llamada no tenga que rehacer el round-trip a Google.
   */
  private async getAuthorizedClient(tenantId: string): Promise<Auth.OAuth2Client> {
    const tenant = await this.mustFindTenant(tenantId);
    if (!tenant.googleRefreshToken) {
      throw new BadRequestException('Este centro no tiene una cuenta de Google conectada.');
    }

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: tenant.googleAccessToken ? this.encryption.decrypt(tenant.googleAccessToken) : undefined,
      refresh_token: this.encryption.decrypt(tenant.googleRefreshToken),
    });

    client.on('tokens', (tokens) => {
      if (!tokens.access_token) return;
      this.prisma.tenant
        .update({
          where: { id: tenantId },
          data: { googleAccessToken: this.encryption.encrypt(tokens.access_token) },
        })
        .catch((error: unknown) => {
          this.logger.error(`No se pudo persistir el access_token renovado del centro ${tenantId}: ${String(error)}`);
        });
    });

    return client;
  }

  private async mustFindTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleAccessToken: true, googleRefreshToken: true },
    });
    if (!tenant) {
      throw new NotFoundException('El centro estético no existe.');
    }
    return tenant;
  }
}
