import { Module } from '@nestjs/common';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';

/**
 * Feature 09 — Google Calendar Jerárquico (Fase 2). `EncryptionService` ya
 * no se provee acá: se promovió a `CommonModule` @Global() (Feature 10,
 * cuando SocialChannelsModule se volvió su segundo consumidor) — sigue
 * inyectable en GoogleCalendarService sin cambios.
 */
@Module({
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
