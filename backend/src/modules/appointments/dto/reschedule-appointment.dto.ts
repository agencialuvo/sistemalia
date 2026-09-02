import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** PATCH /appointments/:id/reschedule (spec §4). `staffMemberId`/`roomId`/
 *  `equipmentId` son opcionales: reagendar normalmente solo cambia el
 *  horario, pero también cubre "reasignar a otro profesional/sala/equipo"
 *  (ej. arrastrar la tarjeta a otra columna de la grilla) sin un endpoint
 *  aparte. Omitido = se conserva el recurso actual de la cita; no hay forma
 *  de "quitar" un roomId/equipmentId ya asignado desde aquí, mismo criterio
 *  que staffMemberId (una cita siempre necesita un profesional, y en la
 *  práctica no tiene sentido reagendar "hacia ningún recurso"). */
export class RescheduleAppointmentDto {
  @IsDateString({}, { message: 'La fecha y hora de la cita no son válidas.' })
  startAt!: string;

  /** Opcional — permite redimensionar la cita (cambiar su duración) en el
   *  mismo request que el drag & drop, en vez de derivar siempre `endAt` de
   *  `service.durationMinutes`. Omitido = se conserva el cálculo por
   *  duración del servicio, igual que antes. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha y hora de fin no son válidas.' })
  endAt?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffMemberId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'La sala/cabina no es válida.' })
  roomId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El equipo no es válido.' })
  equipmentId?: string;
}
