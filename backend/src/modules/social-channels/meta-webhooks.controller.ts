import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Logger, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboxIngestionService, MetaMessagingEvent, WhatsAppMessagesChangeValue } from '../inbox/inbox-ingestion.service';
import { MetaLeadProcessorService } from '../prospects/meta-lead-processor.service';

interface MetaLeadgenValue {
  leadgen_id?: string;
}

interface MetaWebhookChange {
  field?: string;
  value?: MetaLeadgenValue & WhatsAppMessagesChangeValue;
}

interface MetaWebhookEntry {
  id?: string;
  changes?: MetaWebhookChange[];
  messaging?: MetaMessagingEvent[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

/**
 * Feature 10 — Integraciones No-Code (Fase 2, Task 2.6). Ruta propia
 * `webhooks/meta` (no bajo `marketing/channels`, ver plan.md §2) porque este
 * endpoint no lo llama el frontend de LIA: lo llama Meta directamente, sin
 * cookie de sesión ni `x-tenant-id` — de ahí que no lleve `JwtAuthGuard` ni
 * `@TenantId()`, mismo criterio que `GoogleCalendarController.callback`.
 *
 * Ingesta (Feature 11, Task 2.3): `leadgen` se delega a
 * `MetaLeadProcessorService.processLeadgenEvent` — deliberadamente sin
 * `await`, para no retrasar la respuesta al webhook.
 *
 * Ingesta de mensajería (Feature 12, Task 2.2): `entry.messaging[]`
 * (Messenger/Instagram Direct) y `changes[].value` con `field: 'messages'`
 * (WhatsApp Cloud API) se delegan a `InboxIngestionService`, mismo criterio
 * fire-and-forget que `leadgen`.
 *
 * Seguridad: la verificación de `X-Hub-Signature-256` (HMAC del body con
 * META_APP_SECRET) queda pendiente a propósito — requiere acceso al body
 * crudo antes de que Express lo parsee a JSON, que este proyecto no
 * configura todavía. Ya no es un riesgo despreciable ahora que `leadgen` SÍ
 * dispara un efecto real (crear/actualizar un Prospect) — queda anotado como
 * bloqueante antes de producción, no antes de este merge.
 */
@Controller('webhooks/meta')
export class MetaWebhooksController {
  private readonly logger = new Logger(MetaWebhooksController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metaLeadProcessor: MetaLeadProcessorService,
    private readonly inboxIngestion: InboxIngestionService,
  ) {}

  /**
   * GET /webhooks/meta — Meta llama esto UNA vez al configurar la
   * suscripción de webhooks en su panel de developers, para confirmar que el
   * endpoint es tuyo: si `hub.verify_token` coincide con el configurado,
   * debe responder con el valor exacto de `hub.challenge` como texto plano
   * (no JSON) y 200; cualquier otro caso es 403.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  verifyChallenge(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    const expectedToken = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN');

    if (mode !== 'subscribe' || !expectedToken || verifyToken !== expectedToken || !challenge) {
      this.logger.warn('Verificación de webhook de Meta rechazada (hub.verify_token no coincide).');
      throw new ForbiddenException('Token de verificación inválido.');
    }

    return challenge;
  }

  /**
   * POST /webhooks/meta — evento en tiempo real. Responder 200 rápido es
   * parte del contrato (spec §4: <200ms, si no Meta reintenta en masa), así
   * que esto NUNCA debe esperar a un procesamiento pesado — de ahí que
   * `leadgen` se dispare con `void` (fire-and-forget) en vez de `await`arse:
   * la consulta a la Graph API que hace MetaLeadProcessorService puede
   * tardar más que eso.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  receiveEvent(@Body() payload: MetaWebhookPayload): { received: true } {
    for (const entry of payload.entry ?? []) {
      const changes = entry.changes ?? [];
      const fields = changes.map((change) => change.field).filter(Boolean);
      this.logger.log(
        `Webhook de Meta recibido — object=${payload.object ?? 'desconocido'} entryId=${entry.id ?? 'desconocido'} ` +
          `fields=[${fields.join(', ')}] messagingEvents=${entry.messaging?.length ?? 0}`,
      );

      if (!entry.id) continue;
      for (const change of changes) {
        if (change.field === 'leadgen' && change.value?.leadgen_id) {
          void this.metaLeadProcessor.processLeadgenEvent(entry.id, change.value.leadgen_id);
        }
        if (change.field === 'messages' && change.value) {
          void this.inboxIngestion.processWhatsAppEvent(entry.id, change.value);
        }
      }
      for (const messagingEvent of entry.messaging ?? []) {
        void this.inboxIngestion.processMessagingEvent(entry.id, messagingEvent);
      }
    }
    return { received: true };
  }
}
