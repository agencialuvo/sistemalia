import { Transform } from 'class-transformer';
import { ExceptionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /staff/:id/absences — Task 2.2, ampliado por el Engine de
 * Disponibilidad con `type`/`internalNote`.
 *
 * `startDate`/`endDate` arrive as ISO date-time strings; StaffMembersService
 * checks endDate > startDate against the parsed Date objects, since a
 * `@ValidateIf` comparing two raw strings can't express "later than".
 */
export class CreateAbsenceDto {
  /** CUSTOM_OFF (bloqueo) por defecto — la mayoría de excepciones siguen
   *  siendo "este profesional no atiende estos días". */
  @IsOptional()
  @IsEnum(ExceptionType, { message: 'El tipo de excepción no es válido.' })
  type?: ExceptionType;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Indica el motivo de la ausencia.' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres.' })
  reason!: string;

  /** Contexto administrativo/IA más largo que `reason` — no se muestra en la
   *  tarjeta rápida, solo en el detalle de gestión. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(1000, { message: 'La nota interna no puede superar los 1000 caracteres.' })
  internalNote?: string;

  @IsDateString({}, { message: 'La fecha de inicio no es válida.' })
  startDate!: string;

  @IsDateString({}, { message: 'La fecha de fin no es válida.' })
  endDate!: string;
}
