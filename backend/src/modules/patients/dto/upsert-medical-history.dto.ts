import { Transform } from 'class-transformer';
import { FitzpatrickSkinType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Same E.164-ish shape as CreatePatientDto's phone. */
const PHONE_PATTERN = /^\+\d{7,15}$/;

const BLOOD_TYPE_PATTERN = /^(A|B|AB|O)[+-]$/;

/** GET/PUT /patients/:id/medical-history (spec §2/§3). Every field optional —
 *  a patient's antecedentes are filled in progressively, not all at once. */
export class UpsertMedicalHistoryDto {
  @IsOptional()
  @IsArray({ message: 'Las alergias deben ser una lista.' })
  @ArrayMaxSize(50, { message: 'Máximo 50 alergias registradas.' })
  @IsString({ each: true, message: 'Cada alergia debe ser texto.' })
  @MaxLength(120, { each: true, message: 'Cada alergia admite máximo 120 caracteres.' })
  allergies?: string[];

  @IsOptional()
  @IsArray({ message: 'Las condiciones crónicas deben ser una lista.' })
  @ArrayMaxSize(50, { message: 'Máximo 50 condiciones registradas.' })
  @IsString({ each: true, message: 'Cada condición debe ser texto.' })
  @MaxLength(120, { each: true, message: 'Cada condición admite máximo 120 caracteres.' })
  chronicConditions?: string[];

  @IsOptional()
  @IsArray({ message: 'Los medicamentos deben ser una lista.' })
  @ArrayMaxSize(50, { message: 'Máximo 50 medicamentos registrados.' })
  @IsString({ each: true, message: 'Cada medicamento debe ser texto.' })
  @MaxLength(120, { each: true, message: 'Cada medicamento admite máximo 120 caracteres.' })
  currentMedications?: string[];

  @IsOptional()
  @IsString()
  @Transform(trim)
  @Matches(BLOOD_TYPE_PATTERN, { message: 'El grupo sanguíneo debe ser uno de: A+, A-, B+, B-, AB+, AB-, O+, O-.' })
  bloodType?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre del contacto de emergencia no puede superar los 150 caracteres.' })
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @Matches(PHONE_PATTERN, { message: 'Incluye el código de país (ej. +51987654321).' })
  emergencyContactPhone?: string;

  // ---------------------------------------------------------------------
  // Cumplimiento Normativo MINSA NTS N° 139 (Fase 4)
  // ---------------------------------------------------------------------

  @IsOptional()
  @IsEnum(FitzpatrickSkinType, { message: 'El fototipo de piel no es válido.' })
  fitzpatrickSkinType?: FitzpatrickSkinType;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(120, { message: 'El tipo de piel admite máximo 120 caracteres.' })
  skinType?: string;

  @IsOptional()
  @IsBoolean({ message: 'El embarazo o lactancia debe ser verdadero o falso.' })
  isPregnantOrLactating?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'El uso de isotretinoína debe ser verdadero o falso.' })
  roaccutaneLast12Months?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'La tendencia a queloides debe ser verdadero o falso.' })
  keloidTendency?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'El brote activo de herpes debe ser verdadero o falso.' })
  activeHerpesBreakout?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'La exposición solar frecuente debe ser verdadero o falso.' })
  frequentSunExposure?: boolean;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(200, { message: 'Los hábitos de tabaquismo admiten máximo 200 caracteres.' })
  smokingHabits?: string;
}
