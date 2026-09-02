import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { ProspectsModule } from '../prospects/prospects.module';
import { MetaWebhooksController } from './meta-webhooks.controller';
import { SocialChannelsController } from './social-channels.controller';
import { SocialChannelsService } from './social-channels.service';

/**
 * Feature 10 — Integraciones No-Code (Fase 2, completa: Tasks 2.1-2.6).
 * `EncryptionService` no se provee acá: vive en `CommonModule` @Global()
 * (ver su doc comment) e inyecta directo en `SocialChannelsService`.
 *
 * `MetaWebhooksController` vive en el mismo módulo que `SocialChannelsController`
 * (comparten dominio: canales de Meta y sus eventos) pero es un controller
 * aparte porque su ruta (`webhooks/meta`) y su modelo de autenticación (Meta
 * llama esto directo, sin JWT ni tenant) son completamente distintos a
 * `marketing/channels*`.
 *
 * `ProspectsModule` (Feature 11, Task 2.3) se importa solo para que
 * `MetaWebhooksController` pueda inyectar `MetaLeadProcessorService` y
 * delegarle los eventos `leadgen` — sin dependencia inversa: ProspectsModule
 * no conoce a SocialChannelsModule (resuelve el SocialChannel del lead
 * directo por Prisma, `PrismaService` es @Global()). `InboxModule` (Feature
 * 12, Task 2.2) se importa por el mismo motivo, para delegar los eventos de
 * mensajería (`messaging`, `messages` de WhatsApp) a `InboxIngestionService`.
 */
@Module({
  imports: [ProspectsModule, InboxModule],
  controllers: [SocialChannelsController, MetaWebhooksController],
  providers: [SocialChannelsService],
  exports: [SocialChannelsService],
})
export class SocialChannelsModule {}
