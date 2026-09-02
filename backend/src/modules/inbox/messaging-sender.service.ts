import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SocialChannel } from '@prisma/client';
import { EncryptionService } from '../../common/services/encryption.service';
import { GRAPH_API_VERSION } from '../social-channels/social-channels.service';

const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_TIMEOUT_MS = 8000;

interface GraphErrorBody {
  error?: { message?: string };
}

/**
 * Módulo 12 — Inbox Unificado, Fase 2 (Task 2.1). Determina la API destino
 * según el `provider` del SocialChannel (spec plan §3: Messenger/Instagram
 * vía `/me/messages`, WhatsApp vía `/{phone_number_id}/messages`) y envía el
 * mensaje. Mismo patrón de fetch+manejo de error que SocialChannelsService/
 * MetaLeadProcessorService, sin compartir código directamente — cada uno
 * vive en su propio módulo, igual que el resto de este backend con la Graph
 * API (ver GRAPH_API_VERSION en social-channels.service.ts).
 */
@Injectable()
export class MessagingSenderService {
  private readonly logger = new Logger(MessagingSenderService.name);

  constructor(private readonly encryption: EncryptionService) {}

  /** Devuelve el ID de mensaje que asigna la red social (o null si la
   *  respuesta no trajo uno) — se guarda en Message.externalId. */
  async sendTextMessage(channel: SocialChannel, recipientExternalId: string, body: string): Promise<string | null> {
    const accessToken = this.encryption.decrypt(channel.accessToken);
    switch (channel.provider) {
      case 'META_FACEBOOK':
      case 'META_INSTAGRAM':
        return this.sendMetaMessage(recipientExternalId, body, accessToken);
      case 'WHATSAPP_OFFICIAL':
        return this.sendWhatsAppMessage(channel, recipientExternalId, body, accessToken);
      default:
        throw new BadRequestException(`El canal ${channel.provider} no soporta el envío de mensajes desde el Inbox.`);
    }
  }

  private async sendMetaMessage(recipientId: string, body: string, accessToken: string): Promise<string | null> {
    const url = new URL(`${GRAPH_BASE_URL}/me/messages`);
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: body },
        messaging_type: 'RESPONSE',
      }),
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    const json = await this.parseResponse(response);
    return (json as { message_id?: string }).message_id ?? null;
  }

  /** `channel.metadata.phoneNumberId` lo guarda SocialChannelsService.connectWhatsApp
   *  (Feature 10) — sin eso no hay a qué número de la WABA mandarle el mensaje. */
  private async sendWhatsAppMessage(
    channel: SocialChannel,
    to: string,
    body: string,
    accessToken: string,
  ): Promise<string | null> {
    const metadata = channel.metadata as { phoneNumberId?: string } | null;
    const phoneNumberId = metadata?.phoneNumberId;
    if (!phoneNumberId) {
      throw new BadRequestException('Este canal de WhatsApp no tiene un número (phoneNumberId) configurado.');
    }

    const url = new URL(`${GRAPH_BASE_URL}/${phoneNumberId}/messages`);
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    const json = await this.parseResponse(response);
    return (json as { messages?: { id: string }[] }).messages?.[0]?.id ?? null;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const body = (await response.json()) as GraphErrorBody & Record<string, unknown>;
    if (!response.ok || body.error) {
      this.logger.warn(`Graph API respondió con error al enviar un mensaje: ${JSON.stringify(body.error)}`);
      throw new BadRequestException(
        body.error?.message ?? 'No se pudo enviar el mensaje al destinatario. Vuelve a intentarlo.',
      );
    }
    return body;
  }
}
