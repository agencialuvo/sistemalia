import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * One entry of the "matriz de competencias" (spec §1.3 / §2.2 Bloque 2): a
 * service this StaffMember can perform, with an optional per-professional
 * duration override.
 */
export class StaffServiceAssignmentDto {
  @IsUUID('4', { message: 'Selecciona un servicio válido.' })
  serviceId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La duración personalizada debe ser un número entero de minutos.' })
  @Min(1, { message: 'La duración personalizada debe ser de al menos 1 minuto.' })
  @Max(720, { message: 'La duración personalizada no puede superar 720 minutos.' })
  customDurationMinutes?: number;
}
