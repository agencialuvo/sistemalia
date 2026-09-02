/**
 * Lo que un llamador (Fase 3: AppointmentsService) necesita decidir sobre un
 * evento — deliberadamente no es el shape crudo de la API de Google, así el
 * mapeo a `calendar_v3.Schema$Event` (zona horaria, formato de fecha, etc.)
 * vive en un solo lugar (GoogleCalendarService.toGoogleEvent).
 */
export interface CalendarEventPayload {
  summary: string;
  description?: string;
  /** ISO 8601 con offset (`Appointment.startAt`/`endAt` ya lo son). */
  startAt: string;
  endAt: string;
  location?: string;
  /** Correos a invitar sobre este mismo evento — usado cuando un profesional
   *  tiene `googleEmail` pero no un calendario hijo propio aprovisionado
   *  (Fase 4: AppointmentsService invita en vez de duplicar el evento). */
  attendees?: string[];
}
