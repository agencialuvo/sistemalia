import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateStaffDto } from './create-staff.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * One spreadsheet row, after coercion and before it becomes a StaffMember.
 *
 * Extends CreateStaffDto minus the fields a flat sheet cannot express, and
 * adds `specialtyName`/`serviceNames` in their place — same reasoning as
 * ImportServiceRowDto (services module):
 *
 *   - `specialtyId` — the sheet names the especialidad in words, and it may
 *     not exist yet at the moment the row is read (auto-created on import,
 *     like Servicios' categoría).
 *   - `userId`, `avatarUrl`, `biography`, `email`, `phone` — nothing a bulk
 *     load of "quién es esta persona" needs; set afterwards from the form.
 *   - `serviceIds`, `schedules` — the matriz de competencias and the horario
 *     semanal have no sensible flat-column representation. `serviceIds` is
 *     replaced by `serviceNames`, a comma list resolved against services that
 *     must ALREADY exist (unlike especialidad, the bulk path does not create
 *     services on the fly); `schedules` has no sheet equivalent at all —
 *     every imported professional starts with no horario configured.
 *
 * Everything else is validated by exactly the same decorators as a row
 * created through the form.
 */
export class ImportStaffRowDto extends OmitType(CreateStaffDto, [
  'userId',
  'specialtyId',
  'avatarUrl',
  'biography',
  'email',
  'phone',
  'serviceIds',
  'schedules',
] as const) {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(80, { message: 'La especialidad no puede superar los 80 caracteres.' })
  specialtyName?: string;

  /** Raw comma-separated list as typed in the sheet; resolved to actual
   *  service names (existence-checked) by StaffExcelImportService, and to
   *  serviceIds by StaffMembersService.importFromExcel at write time. */
  @IsOptional()
  @IsString()
  serviceNames?: string;
}
