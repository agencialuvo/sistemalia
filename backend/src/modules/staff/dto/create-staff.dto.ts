import { Transform, Type } from 'class-transformer';
import { CommissionType, StaffDocumentType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
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
import { StaffScheduleDayInputDto } from './staff-schedule-input.dto';
import { StaffServiceAssignmentDto } from './staff-service-assignment.dto';

/** Same strict `#RRGGBB` as CreateCategoryDto — the frontend feeds it into a
 *  calendar badge's style attribute, and the column is VarChar(7). */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Letters (incl. accents and ñ/Ñ) and spaces only — mirrors
 *  validators/staff.ts's NAME_REGEX on the frontend. */
const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;

/** E.164-ish, same shape as CreateTenantDto's whatsappNumber. Enforced AFTER
 *  normalizePhone below runs, so by the time this checks anything it has
 *  already gained its leading "+". */
const PHONE_PATTERN = /^\+\d{7,15}$/;

/** Perú-only for now — same assumption CreateTenantDto's onboarding makes
 *  about the centro estético's own WhatsApp number. Revisit if a tenant
 *  outside Perú signs up. */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * The staff form / sheet only asks the profesional's local number — "51" is
 * the centro's own country, so the user is never made to type it. A value
 * that already starts with "+" (someone pasted a full E.164 number, or a
 * different country) is respected as-is; anything else is assumed local and
 * gets DEFAULT_PHONE_COUNTRY_CODE prepended, digits-only.
 */
const normalizePhone = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${DEFAULT_PHONE_COUNTRY_CODE}${digits}` : '';
};

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
  @Matches(NAME_PATTERN, { message: 'El nombre solo admite letras y espacios.' })
  firstName!: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(100, { message: 'El apellido no puede superar los 100 caracteres.' })
  @Matches(NAME_PATTERN, { message: 'El apellido solo admite letras y espacios.' })
  lastName!: string;

  @IsOptional()
  @IsEnum(StaffDocumentType, { message: 'El tipo de documento no es válido.' })
  documentType?: StaffDocumentType;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(20, { message: 'El número de documento no puede superar los 20 caracteres.' })
  documentNumber?: string;

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
  @Transform(normalizePhone)
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres.' })
  @Matches(PHONE_PATTERN, { message: 'El teléfono no es válido. Escribe solo el número (ej. 987654321).' })
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

  /** Nivel 3 de 3 (el más general) del Esquema de Comisiones Jerárquico:
   *  comisión por defecto de este profesional, aplicable a cualquier
   *  servicio salvo que Service.baseCommission* o
   *  StaffService.customCommission* lo sobreescriban. Ambos campos van
   *  juntos — ver assertCommissionIsValid (common/utils/commission.util.ts). */
  @IsOptional()
  @IsEnum(CommissionType, { message: 'El tipo de comisión no es válido.' })
  defaultCommissionType?: CommissionType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El valor de la comisión admite máximo 2 decimales.' })
  @Min(0, { message: 'El valor de la comisión no puede ser negativo.' })
  @Max(999999.99, { message: 'El valor de la comisión supera el máximo permitido.' })
  defaultCommissionValue?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Habilita la sincronización individual de este profesional con Google
   *  Calendar Jerárquico (Feature 09) — el motor de sincronización (Fase 4)
   *  comparte el calendario hijo con esta dirección. No se valida contra la
   *  cuenta que el tenant conectó en /integrations/google: es responsabilidad
   *  del staff darla correcta. */
  @IsOptional()
  @IsEmail({}, { message: 'El correo de Google no es válido.' })
  googleEmail?: string;

  /** Matriz de competencias (spec §1.3). Absent = "no tocar la matriz actual"
   *  on PATCH; an empty array explicitly clears it. */
  @IsOptional()
  @IsArray({ message: 'Los servicios habilitados deben ser una lista.' })
  @ArrayMaxSize(500, { message: 'No se pueden asignar más de 500 servicios.' })
  @ValidateNested({ each: true })
  @Type(() => StaffServiceAssignmentDto)
  serviceIds?: StaffServiceAssignmentDto[];

  /** Horario semanal (spec §1.4, Engine de Disponibilidad). Same
   *  absent-vs-empty convention as serviceIds; at most one entry per día —
   *  los turnos múltiples viven dentro de cada día (`shifts`), no como
   *  entradas repetidas — enforced in StaffMembersService, where the whole
   *  array is visible at once. */
  @IsOptional()
  @IsArray({ message: 'El horario debe ser una lista.' })
  @ArrayMaxSize(7, { message: 'El horario admite como máximo una entrada por día de la semana.' })
  @ValidateNested({ each: true })
  @Type(() => StaffScheduleDayInputDto)
  schedules?: StaffScheduleDayInputDto[];
}
