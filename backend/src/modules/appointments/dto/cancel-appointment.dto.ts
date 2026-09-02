import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** DELETE /appointments/:id (spec §4: "Cancelar cita con motivo") — baja
 *  lógica (status: CANCELLED), nunca borrado físico: la cita sigue viva
 *  para el historial de citas del paciente y las métricas de no-show. */
export class CancelAppointmentDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres.' })
  reason?: string;
}
