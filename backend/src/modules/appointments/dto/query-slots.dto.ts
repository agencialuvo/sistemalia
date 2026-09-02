import { IsDateString, IsUUID } from 'class-validator';

/** GET /appointments/slots (spec Módulo 06 §4: "Consultar slots/horarios
 *  disponibles para un servicio y profesional"). */
export class QuerySlotsDto {
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffMemberId!: string;

  @IsUUID('4', { message: 'El servicio no es válido.' })
  serviceId!: string;

  /** "YYYY-MM-DD" — un solo día a la vez, la agenda pide uno por columna. */
  @IsDateString({}, { message: 'La fecha no es válida.' })
  date!: string;
}
