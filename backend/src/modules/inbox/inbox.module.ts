import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxIngestionService } from './inbox-ingestion.service';
import { InboxService } from './inbox.service';
import { MessagingSenderService } from './messaging-sender.service';

/**
 * Módulo 12 — Inbox Unificado (Chat Omnicanal), Fase 2.
 *
 * `PrismaService`/`EncryptionService` no se importan acá: ambos son
 * `@Global()` (`PrismaModule`, `CommonModule`) e inyectan directo.
 *
 * `InboxIngestionService` se exporta para que `SocialChannelsModule` pueda
 * inyectarlo en `MetaWebhooksController` (Task 2.2) — mismo patrón que
 * `MetaLeadProcessorService` de ProspectsModule (Feature 11): el webhook de
 * Meta vive en Integraciones (Feature 10), pero delega la ingesta de
 * mensajes acá.
 */
@Module({
  controllers: [InboxController],
  providers: [InboxService, MessagingSenderService, InboxIngestionService],
  exports: [InboxIngestionService],
})
export class InboxModule {}
