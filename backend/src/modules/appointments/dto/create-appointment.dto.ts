import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /appointments (spec Módulo 06 §4). `endAt`/`bufferMinutes` no se
 * reciben del cliente — AppointmentsService los calcula a partir de
 * `Service.durationMinutes`/`bufferMinutes` en el momento de la reserva, la
 * misma razón por la que CreatePatientDto no acepta `status` desde fuera.
 */
export class CreateAppointmentDto {
  @IsUUID('4', { message: 'El paciente no es válido.' })
  patientId!: string;

  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffMemberId!: string;

  @IsUUID('4', { message: 'El servicio no es válido.' })
  serviceId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'La sala/cabina no es válida.' })
  roomId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El equipo no es válido.' })
  equipmentId?: string;

  /** ISO datetime — el inicio exacto del slot elegido (debe coincidir con uno
   *  de los devueltos por GET /appointments/slots). */
  @IsDateString({}, { message: 'La fecha y hora de la cita no son válidas.' })
  startAt!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string;
}
