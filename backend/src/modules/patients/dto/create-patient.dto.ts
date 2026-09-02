import { Transform } from 'class-transformer';
import { AcquisitionChannel, Gender, PatientDocumentType, PatientStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** E.164-ish: leading "+" then 7-15 digits — same shape used across the app
 *  (CreateTenantDto's whatsappNumber, CreateStaffDto's phone). Enforced AFTER
 *  normalizePhone below runs, so by validation time it always has its "+". */
const PHONE_PATTERN = /^\+\d{7,15}$/;

/** Perú-only for now — same assumption CreateStaffDto's normalizePhone makes. */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';

/**
 * The patient form / carga masiva sheet only asks for the local number — the
 * centro's own country, so nobody has to type "51". A value that already
 * starts with "+" (a different country, or a full E.164 number pasted in) is
 * respected as-is; anything else is assumed local and gets
 * DEFAULT_PHONE_COUNTRY_CODE prepended, digits-only. Same rule as
 * CreateStaffDto's normalizePhone (kept duplicated rather than shared — see
 * that file's parseNumber-style precedent).
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
 * POST /patients — Módulo 05, Fase 1 (spec §2/§3).
 *
 * `status` lives here (not only on UpdatePatientDto) so PartialType picks it
 * up for free on PATCH — a brand-new patient always starts ACTIVE regardless
 * of what's sent, enforced in PatientsService, not here.
 */
export class CreatePatientDto {
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
  @IsEnum(PatientDocumentType, { message: 'El tipo de documento no es válido.' })
  documentType?: PatientDocumentType;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(20, { message: 'El número de documento no puede superar los 20 caracteres.' })
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(normalizePhone)
  @Matches(PHONE_PATTERN, { message: 'El teléfono no es válido. Escribe solo el número (ej. 987654321).' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  email?: string;

  /** <input type="date"> hands back "YYYY-MM-DD" — accepted as-is, same
   *  convention as CreateAbsenceDto's startDate/endDate. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento no es válida.' })
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'El género no es válido.' })
  gender?: Gender;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(255, { message: 'La dirección no puede superar los 255 caracteres.' })
  address?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100, { message: 'El distrito no puede superar los 100 caracteres.' })
  district?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'La URL de la foto no es válida.' })
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(AcquisitionChannel, { message: 'El medio de captación no es válido.' })
  acquisitionChannel?: AcquisitionChannel;

  @IsOptional()
  @IsArray({ message: 'Las etiquetas deben ser una lista.' })
  @ArrayMaxSize(20, { message: 'Máximo 20 etiquetas por paciente.' })
  @IsString({ each: true, message: 'Cada etiqueta debe ser texto.' })
  @MaxLength(40, { each: true, message: 'Cada etiqueta admite máximo 40 caracteres.' })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string;

  @IsOptional()
  @IsEnum(PatientStatus, { message: 'El estado no es válido.' })
  status?: PatientStatus;
}
