import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * POST /staff/:id/absences — Task 2.2.
 *
 * `startDate`/`endDate` arrive as ISO date-time strings; StaffMembersService
 * checks endDate > startDate against the parsed Date objects, since a
 * `@ValidateIf` comparing two raw strings can't express "later than".
 */
export class CreateAbsenceDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Indica el motivo de la ausencia.' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres.' })
  reason!: string;

  @IsDateString({}, { message: 'La fecha de inicio no es válida.' })
  startDate!: string;

  @IsDateString({}, { message: 'La fecha de fin no es válida.' })
  endDate!: string;
}
