import { SpecialtyCategory, TaxIdType, TenantIdentityType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsRuc } from '../../sunat/validators/is-ruc.validator';

/** "HH:mm", 24h. Matches the string format BranchWorkingHour stores. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HH_MM_MESSAGE = 'El horario debe tener el formato HH:mm (ej. 09:00).';

/** Appointment slot lengths offered by the wizard (spec §2, Paso 2.3). */
export const APPOINTMENT_DURATIONS = [30, 45, 60, 90];

export class WorkingHourDto {
  /** 0 = Domingo … 6 = Sábado. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsBoolean()
  isOpen!: boolean;

  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  openTime!: string;

  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  closeTime!: string;

  @IsOptional()
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  breakStart?: string;

  @IsOptional()
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  breakEnd?: string;
}

/** Paso 2: sede principal, ubigeo, WhatsApp y horarios. */
export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'La dirección de la sede es obligatoria.' })
  @MaxLength(255)
  address!: string;

  @Matches(/^\d{6}$/, { message: 'El ubigeo debe ser un código de 6 dígitos.' })
  ubigeoCode!: string;

  @Matches(/^\+\d{7,15}$/, {
    message: 'El WhatsApp debe incluir el código de país (ej. +51987654321).',
  })
  whatsappNumber!: string;

  @IsInt()
  @IsIn(APPOINTMENT_DURATIONS, {
    message: 'La duración estándar de citas debe ser 30, 45, 60 o 90 minutos.',
  })
  defaultAppointmentMinutes!: number;

  /**
   * Only the days the user configured. Any of the 7 left out is materialised as
   * closed by TenantService, so the calendar engine always reads a full week.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes configurar al menos un día de atención.' })
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours!: WorkingHourDto[];
}

/** Full payload of POST /tenant/onboarding — the 3 wizard steps in one shot. */
export class CreateTenantDto {
  // --- Paso 1: identidad del negocio y perfil fiscal ---
  @IsEnum(TenantIdentityType, { message: 'Selecciona el tipo de identidad del negocio.' })
  identityType!: TenantIdentityType;

  @IsEnum(TaxIdType, { message: 'Selecciona el tipo de contribuyente (RUC 10 o RUC 20).' })
  taxIdType!: TaxIdType;

  @IsRuc()
  taxId!: string;

  @IsString()
  @IsNotEmpty({ message: 'La razón social es obligatoria.' })
  @MaxLength(255)
  legalName!: string;

  /** Optional: SUNAT may have been unreachable and the user skipped it. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fiscalAddress?: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial es obligatorio.' })
  @MinLength(2)
  @MaxLength(120)
  commercialName!: string;

  // --- Paso 3: identidad visual y rubro ---
  @IsEnum(SpecialtyCategory, { message: 'Selecciona el rubro principal del centro.' })
  specialty!: SpecialtyCategory;

  /** Returned by POST /tenant/upload-logo. Optional: the logo can be added later. */
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'La URL del logotipo no es válida.' })
  logoUrl?: string;

  // --- Paso 2 ---
  // @IsDefined is not redundant with @ValidateNested: on its own, ValidateNested
  // silently passes when the property is missing, so a payload without `branch`
  // would clear validation and blow up as a TypeError (HTTP 500) inside the
  // service instead of a 400 telling the client what it forgot.
  @IsDefined({ message: 'Los datos de la sede principal son obligatorios.' })
  @IsObject({ message: 'Los datos de la sede principal son obligatorios.' })
  @ValidateNested()
  @Type(() => CreateBranchDto)
  branch!: CreateBranchDto;
}
