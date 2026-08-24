import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { StaffScheduleInputDto } from './staff-schedule-input.dto';
import { StaffServiceAssignmentDto } from './staff-service-assignment.dto';

/** Same strict `#RRGGBB` as CreateCategoryDto — the frontend feeds it into a
 *  calendar badge's style attribute, and the column is VarChar(7). */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /staff — Task 2.2.
 *
 * `serviceIds` and `schedules` carry the full desired state of the "matriz de
 * competencias" and the weekly matrix (spec §2.2, Bloques 2 y 3):
 * StaffMembersService replaces the StaffService/StaffSchedule rows wholesale
 * on every write rather than diffing, so there is no accumulated-drift bug
 * from a client that forgets to send a removal.
 */
export class CreateStaffDto {
  /** Optional link to an existing system user (spec §2.3) — enforced 1:1 by
   *  StaffMember.userId's @unique in the schema, not here. */
  @IsOptional()
  @IsUUID('4', { message: 'Selecciona un usuario válido.' })
  userId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Selecciona una especialidad válida.' })
  specialtyId?: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres.' })
  firstName!: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(100, { message: 'El apellido no puede superar los 100 caracteres.' })
  lastName!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(50, { message: 'La colegiatura/licencia no puede superar los 50 caracteres.' })
  medicalLicense?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo de contacto no es válido.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres.' })
  phone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'La URL de la foto de perfil no es válida.' })
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La biografía no puede superar los 2000 caracteres.' })
  biography?: string;

  /** Calendar badge colour — same convention as ServiceCategory.color. */
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).' })
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La comisión admite máximo 2 decimales.' })
  @Min(0, { message: 'La comisión no puede ser negativa.' })
  @Max(100, { message: 'La comisión no puede superar 100%.' })
  commissionPercentage?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Matriz de competencias (spec §1.3). Absent = "no tocar la matriz actual"
   *  on PATCH; an empty array explicitly clears it. */
  @IsOptional()
  @IsArray({ message: 'Los servicios habilitados deben ser una lista.' })
  @ArrayMaxSize(500, { message: 'No se pueden asignar más de 500 servicios.' })
  @ValidateNested({ each: true })
  @Type(() => StaffServiceAssignmentDto)
  serviceIds?: StaffServiceAssignmentDto[];

  /** Horario semanal (spec §1.4). Same absent-vs-empty convention as
   *  serviceIds; at most one entry per día — enforced in StaffMembersService,
   *  where the whole array is visible at once. */
  @IsOptional()
  @IsArray({ message: 'El horario debe ser una lista.' })
  @ArrayMaxSize(7, { message: 'El horario admite como máximo un turno por día de la semana.' })
  @ValidateNested({ each: true })
  @Type(() => StaffScheduleInputDto)
  schedules?: StaffScheduleInputDto[];
}
