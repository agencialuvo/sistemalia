import { Module } from '@nestjs/common';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsExcelImportService } from './appointments-excel-import.service';
import { AppointmentsService } from './appointments.service';

/**
 * Módulo 06 — Engine de Reservas y Agenda Interactiva. Importa
 * GoogleCalendarModule (Feature 09, Fase 4) para espejar cada cita en
 * Google Calendar — mismo patrón que SalesModule importando InventoryModule.
 *
 * PrismaModule es global, no se importa aquí. AppointmentsService se
 * exporta por si un futuro módulo (ej. notificaciones de recordatorio)
 * necesita resolver/consultar citas directamente.
 */
@Module({
  imports: [GoogleCalendarModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsExcelImportService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
