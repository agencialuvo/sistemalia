import { Type } from 'class-transformer';
import { CommissionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * One entry of the "matriz de competencias" (spec §1.3 / §2.2 Bloque 2): a
 * service this StaffMember can perform, with optional per-professional
 * overrides for duration and buffers (Engine de Disponibilidad).
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

  /** Vacío = usa Service.bufferMinutes (siempre "posterior"); este margen
   *  "previo" solo existe a nivel profesional, no hay equivalente en Service. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El buffer previo debe ser un número entero de minutos.' })
  @Min(0, { message: 'El buffer previo no puede ser negativo.' })
  @Max(240, { message: 'El buffer previo no puede superar 240 minutos.' })
  customBufferBeforeMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El buffer posterior debe ser un número entero de minutos.' })
  @Min(0, { message: 'El buffer posterior no puede ser negativo.' })
  @Max(240, { message: 'El buffer posterior no puede superar 240 minutos.' })
  customBufferAfterMin?: number;

  /** El buffer sigue bloqueando el slot en el motor de disponibilidad; esto
   *  solo controla si la duración mostrada al paciente lo incluye o no. */
  @IsOptional()
  @IsBoolean()
  hideBufferFromClient?: boolean;

  /** Nivel 1 de 3 (el más específico) del Esquema de Comisiones Jerárquico:
   *  comisión de este profesional para este servicio en particular —
   *  sobreescribe Service.baseCommission* y, en su ausencia,
   *  StaffMember.defaultCommission*. Ambos campos van juntos: uno sin el
   *  otro se rechaza en el service (assertCommissionIsValid), igual que
   *  Service's reglas de anticipo. */
  @IsOptional()
  @IsEnum(CommissionType, { message: 'El tipo de comisión no es válido.' })
  customCommissionType?: CommissionType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El valor de la comisión admite máximo 2 decimales.' })
  @Min(0, { message: 'El valor de la comisión no puede ser negativo.' })
  @Max(999999.99, { message: 'El valor de la comisión supera el máximo permitido.' })
  customCommissionValue?: number;
}
