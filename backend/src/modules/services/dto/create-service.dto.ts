import {
  ServiceAvailabilityType,
  ServicePaymentMethod,
  ServiceStructureType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsDepositAmount } from '../validators/is-deposit-amount.validator';
import { ServicePackageDto } from './service-package.dto';

/** Longest treatment we accept in one appointment: 12h. Guards against a typo
 *  (600 instead of 60) silently blocking a whole week of the agenda. */
const MAX_DURATION_MINUTES = 720;
const MAX_BUFFER_MINUTES = 240;
/** Decimal(10,2) tops out at 99 999 999.99; this is the business-sane ceiling. */
const MAX_PRICE = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /services — Task 2.2.
 *
 * Conditional validation follows one rule consistently: a field the chosen
 * mode REQUIRES is enforced here (missing it is a 400 that names the field),
 * while a field the chosen mode does not apply to is normalised to null by
 * ServicesService rather than rejected. Rejecting the second case would turn
 * harmless leftovers in a form's state — the user toggling SESSIONS back to
 * SINGLE without the inputs being cleared — into an error the user cannot see
 * the cause of, while the database still ends up consistent either way.
 */
export class CreateServiceDto {
  // --- Bloque 1: Identificación y multimedia ---

  @IsUUID('4', { message: 'Selecciona una categoría válida.' })
  categoryId!: string;

  @IsString({ message: 'El nombre del servicio es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre del servicio es obligatorio.' })
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto.' })
  @Transform(trim)
  @MaxLength(5000, { message: 'La descripción no puede superar los 5000 caracteres.' })
  commercialDescription?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'La URL de la imagen principal no es válida.' })
  mainImageUrl?: string;

  @IsOptional()
  @IsArray({ message: 'La galería debe ser una lista de imágenes.' })
  @ArrayMaxSize(20, { message: 'La galería admite hasta 20 imágenes.' })
  @IsUrl({ require_tld: false }, { each: true, message: 'La galería contiene una URL inválida.' })
  testimonioGallery?: string[];

  // --- Bloque 2: Estructura comercial y paquetes ---

  @IsEnum(ServiceStructureType, {
    message: 'El tipo de estructura debe ser SINGLE (sesión única) o SESSIONS (paquete).',
  })
  structureType!: ServiceStructureType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio admite máximo 2 decimales.' })
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El precio supera el máximo permitido.' })
  singlePrice!: number;

  /**
   * Required for SESSIONS, at least one entry: a service can now sell
   * several packages of the same tratamiento at once (ampliación: "3
   * sesiones" y "6 sesiones" del mismo servicio). ServicesService replaces
   * the whole set on every write — see its doc comment — the same
   * whole-resource convention StaffMembersService uses for schedules.
   */
  @ValidateIf((o: CreateServiceDto) => o.structureType === ServiceStructureType.SESSIONS)
  @IsArray({ message: 'Indica al menos un paquete de sesiones.' })
  @ArrayMinSize(1, { message: 'Indica al menos un paquete de sesiones.' })
  @ArrayMaxSize(20, { message: 'Un servicio admite hasta 20 paquetes distintos.' })
  @ValidateNested({ each: true })
  @Type(() => ServicePackageDto)
  packages?: ServicePackageDto[];

  // --- Bloque 3: Filtro clínico y valoración ---

  @IsOptional()
  @IsBoolean({ message: 'Indica con sí o no si el servicio requiere valoración previa.' })
  requiresEvaluation?: boolean;

  /**
   * The valoración appointment is itself a Service. Required when
   * requiresEvaluation is on — the agenda engine has to know what to book
   * before the treatment, and "requires an evaluation we cannot name" is not
   * an actionable state.
   *
   * That the referenced service belongs to THIS tenant is checked in
   * ServicesService; a UUID alone proves nothing about ownership.
   */
  @ValidateIf((o: CreateServiceDto) => o.requiresEvaluation === true)
  @IsUUID('4', { message: 'Selecciona el servicio de valoración asociado.' })
  evaluationServiceId?: string;

  /** Optional: a free valoración is a real commercial strategy. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo de valoración admite máximo 2 decimales.' })
  @Min(0, { message: 'El costo de valoración no puede ser negativo.' })
  @Max(MAX_PRICE, { message: 'El costo de valoración supera el máximo permitido.' })
  evaluationCost?: number;

  @IsOptional()
  @IsBoolean({ message: 'Indica con sí o no si la valoración es descontable.' })
  isEvaluationDeductible?: boolean;

  /** Optional even when deductible: absent means the credit never expires. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La vigencia del descuento debe ser un número entero de días.' })
  @Min(1, { message: 'La vigencia del descuento debe ser de al menos 1 día.' })
  @Max(3650, { message: 'La vigencia del descuento no puede superar los 3650 días.' })
  deductibleExpirationDays?: number;

  // --- Bloque 4: Tiempos y operativa ---

  @IsOptional()
  @IsEnum(ServiceAvailabilityType, {
    message: 'La disponibilidad debe ser GENERAL (horario de la sede) o CUSTOM (horario propio).',
  })
  availabilityType?: ServiceAvailabilityType;

  /**
   * Free-form matrix, shape owned by the frontend (Fase 3). Only its presence
   * is enforced here: CUSTOM without a schedule would fall back to the branch
   * hours silently, which is the opposite of what the user asked for.
   */
  @ValidateIf((o: CreateServiceDto) => o.availabilityType === ServiceAvailabilityType.CUSTOM)
  @IsObject({ message: 'Define el horario propio del servicio o usa el horario de la sede.' })
  customSchedule?: Record<string, unknown>;

  @Type(() => Number)
  @IsInt({ message: 'La duración debe ser un número entero de minutos.' })
  @Min(1, { message: 'La duración debe ser de al menos 1 minuto.' })
  @Max(MAX_DURATION_MINUTES, { message: `La duración no puede superar ${MAX_DURATION_MINUTES} minutos.` })
  durationMinutes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tiempo de limpieza debe ser un número entero de minutos.' })
  @Min(0, { message: 'El tiempo de limpieza no puede ser negativo.' })
  @Max(MAX_BUFFER_MINUTES, { message: `El tiempo de limpieza no puede superar ${MAX_BUFFER_MINUTES} minutos.` })
  bufferMinutes?: number;

  @IsOptional()
  @IsArray({ message: 'Las contraindicaciones deben ser una lista.' })
  @ArrayMaxSize(30, { message: 'Máximo 30 contraindicaciones por servicio.' })
  @IsString({ each: true, message: 'Cada contraindicación debe ser texto.' })
  @MaxLength(60, { each: true, message: 'Cada contraindicación admite máximo 60 caracteres.' })
  contraindications?: string[];

  @IsOptional()
  @IsString({ message: 'Los cuidados previos y posteriores deben ser texto.' })
  @MaxLength(5000, { message: 'Los cuidados no pueden superar los 5000 caracteres.' })
  prePostCare?: string;

  // --- Bloque 5: Condiciones de pago ---

  /**
   * A service can accept more than one way to be paid at once (ej. "en caja"
   * y "anticipo" a la vez) — hence the list instead of a single enum value.
   */
  @IsOptional()
  @IsArray({ message: 'Los métodos de pago deben ser una lista.' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un método de pago.' })
  @IsEnum(ServicePaymentMethod, {
    each: true,
    message: 'Cada método de pago debe ser IN_PERSON, ONLINE, DEPOSIT o FULL_PAYMENT.',
  })
  paymentMethods?: ServicePaymentMethod[];

  @IsOptional()
  @IsBoolean({ message: 'Indica con sí o no si el anticipo es un porcentaje.' })
  depositIsPercentage?: boolean;

  /**
   * Required for DEPOSIT. The ceiling depends on `depositIsPercentage`, which
   * a plain @Max cannot express, so @IsDepositAmount carries that half — see
   * the validator for why two @ValidateIf branches would silently disable the
   * check entirely.
   */
  @ValidateIf((o: CreateServiceDto) => (o.paymentMethods ?? []).includes(ServicePaymentMethod.DEPOSIT))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Indica el anticipo requerido.' })
  @Max(MAX_PRICE, { message: 'El anticipo supera el máximo permitido.' })
  @IsDepositAmount()
  depositAmount?: number;

  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser activo o inactivo.' })
  isActive?: boolean;
}
