import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from './inbox.service';

interface MetaMessagingAttachment {
  type?: string;
  payload?: { url?: string };
}

export interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    attachments?: MetaMessagingAttachment[];
    // Meta reenvía como evento propio los mensajes que la Página misma
    // manda (incluidos los que salieron de este Inbox) — sin este filtro,
    // cada respuesta enviada desde InboxService.sendMessage se duplicaría
    // acá como un segundo Message.
    is_echo?: boolean;
  };
}

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WhatsAppInboundMessage {
  id?: string;
  from?: string;
  text?: { body?: string };
}

export interface WhatsAppMessagesChangeValue {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppInboundMessage[];
}

/**
 * Módulo 12 — Inbox Unificado, Fase 2 (Task 2.2). Resuelve el payload crudo
 * del webhook de Meta a un SocialChannel existente y delega en InboxService
 * la creación/actualización de la Conversation + Message — mismo split que
 * MetaLeadProcessorService (Feature 11): este servicio conoce la forma del
 * payload de Meta, InboxService no.
 *
 * Se dispara desde MetaWebhooksController SIN `await` (mismo motivo que
 * processLeadgenEvent: la respuesta al webhook debe salir en <200ms), así
 * que cada método envuelve todo en try/catch y nunca relanza.
 */
@Injectable()
export class InboxIngestionService {
  private readonly logger = new Logger(InboxIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /** Messenger/Instagram Direct — `entry.messaging[]`. `pageOrIgId` es
   *  `entry.id`: el ID de Página para Messenger, el ID de la cuenta de
   *  Instagram Business para IG Direct (ambos ya viven como `externalId` de
   *  un SocialChannel desde Integraciones, Feature 10). */
  async processMessagingEvent(pageOrIgId: string, event: MetaMessagingEvent): Promise<void> {
    try {
      if (event.message?.is_echo) return;
      const senderId = event.sender?.id;
      if (!senderId || !event.message) return;

      const channel = await this.prisma.socialChannel.findFirst({
        where: { externalId: pageOrIgId, provider: { in: ['META_FACEBOOK', 'META_INSTAGRAM'] } },
      });
      if (!channel) {
        this.logger.warn(
          `Mensaje entrante para ${pageOrIgId}, pero no hay ningún SocialChannel conectado para ese ID — se descarta.`,
        );
        return;
      }

      await this.inbox.ingestInboundMessage(channel, {
        externalUserId: senderId,
        externalId: event.message.mid ?? null,
        body: event.message.text ?? '',
        attachments: mapMetaAttachments(event.message.attachments),
      });
    } catch (error) {
      this.logger.error(`No se pudo procesar un mensaje entrante de ${pageOrIgId}: ${String(error)}`);
    }
  }

  /** WhatsApp Cloud API — `entry.changes[].value` con `field: 'messages'`.
   *  `wabaId` es `entry.id` (el ID de la WhatsApp Business Account, mismo
   *  `externalId` que guarda SocialChannelsService.connectWhatsApp). */
  async processWhatsAppEvent(wabaId: string, value: WhatsAppMessagesChangeValue): Promise<void> {
    try {
      const channel = await this.prisma.socialChannel.findFirst({
        where: { externalId: wabaId, provider: 'WHATSAPP_OFFICIAL' },
      });
      if (!channel) {
        this.logger.warn(
          `Mensaje de WhatsApp para la WABA ${wabaId}, pero no hay ningún SocialChannel conectado — se descarta.`,
        );
        return;
      }

      for (const message of value.messages ?? []) {
        if (!message.from) continue;
        const contact = value.contacts?.find((c) => c.wa_id === message.from);
        await this.inbox.ingestInboundMessage(channel, {
          externalUserId: message.from,
          externalId: message.id ?? null,
          body: message.text?.body ?? '',
          contactName: contact?.profile?.name ?? null,
          contactPhone: message.from,
        });
      }
    } catch (error) {
      this.logger.error(`No se pudo procesar un mensaje de WhatsApp de la WABA ${wabaId}: ${String(error)}`);
    }
  }
}

function mapMetaAttachments(attachments?: MetaMessagingAttachment[]): { type: string; url: string }[] | null {
  if (!attachments?.length) return null;
  const mapped = attachments
    .filter((attachment) => Boolean(attachment.type && attachment.payload?.url))
    .map((attachment) => ({ type: attachment.type as string, url: attachment.payload!.url as string }));
  return mapped.length ? mapped : null;
}
