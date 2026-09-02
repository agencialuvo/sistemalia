import { Transform } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** PATCH /appointments/:id/status (spec §4). `note` queda registrado en el
 *  AppointmentLog de esta transición, no en la cita misma. */
export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus, { message: 'El estado no es válido.' })
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500, { message: 'La nota no puede superar los 500 caracteres.' })
  note?: string;
}
