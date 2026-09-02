/**
 * Chequeo de traslape de horario compartido por los dos caminos de carga
 * masiva de citas (Excel/CSV vía AppointmentsExcelImportService y JSON vía
 * AppointmentsService.bulkImport) y, en espíritu, por
 * AppointmentsService.assertSlotIsFree (la ruta de creación/reagendado
 * individual) — extraído aquí para que las tres rutas usen exactamente la
 * misma fórmula en vez de mantenerla sincronizada a mano en tres sitios.
 */

export interface OverlapCandidate {
  staffMemberId: string;
  roomId: string | null;
  equipmentId: string | null;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** El profesional respeta su buffer de limpieza — mismo criterio que
 *  AppointmentsService.assertSlotIsFree: `existing.startAt < newEnd+newBuffer`
 *  Y `existing.endAt+existing.bufferMinutes > newStart`. */
export function staffOverlaps(existing: OverlapCandidate, newStart: Date, newEnd: Date, newBuffer: number): boolean {
  const blockedUntil = addMinutes(newEnd, newBuffer);
  return existing.startAt < blockedUntil && addMinutes(existing.endAt, existing.bufferMinutes) > newStart;
}

/** Sala/Equipo no tienen buffer propio — traslape simple. */
export function resourceOverlaps(existing: OverlapCandidate, newStart: Date, newEnd: Date): boolean {
  return existing.startAt < newEnd && existing.endAt > newStart;
}

/** "2026-08-30T15:00:00.000Z" -> "3:00 p. m." — mismo formato que los
 *  mensajes 409 de choque de Sala/Equipo en el resto del módulo. */
export function formatTimeEs(date: Date): string {
  return date.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}
