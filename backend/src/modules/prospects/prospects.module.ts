import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { MetaLeadProcessorService } from './meta-lead-processor.service';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';

/**
 * Módulo 11 — Prospectos (Ingesta de Lead Ads y CRM), Fase 2.
 *
 * `PrismaService`/`EncryptionService` no se importan acá: ambos son
 * `@Global()` (`PrismaModule`, `CommonModule`) e inyectan directo.
 * `PatientsModule` sí hace falta — `ProspectsService.convertToPatient`
 * (Task 2.4, RF-3) reusa `PatientsService.create()` en vez de duplicar su
 * lógica de escritura.
 *
 * `MetaLeadProcessorService` se exporta para que `SocialChannelsModule`
 * pueda inyectarlo en `MetaWebhooksController` (Task 2.3) — el webhook de
 * Meta vive en Integraciones (Feature 10), pero delega la ingesta de
 * `leadgen` acá.
 */
@Module({
  imports: [PatientsModule],
  controllers: [ProspectsController],
  providers: [ProspectsService, MetaLeadProcessorService],
  exports: [ProspectsService, MetaLeadProcessorService],
})
export class ProspectsModule {}
