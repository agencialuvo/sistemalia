import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Strict `#RRGGBB` — same rationale as CreateCategoryDto's HEX_COLOR. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * POST /patients/tags.
 *
 * `tenantId` is deliberately absent: it comes from @TenantId(), never from
 * the body — same isolation model as CreateCategoryDto.
 */
export class CreatePatientTagDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'El nombre de la etiqueta es obligatorio.' })
  @MaxLength(40, { message: 'El nombre de la etiqueta no puede superar los 40 caracteres.' })
  name!: string;

  @IsString()
  @Matches(HEX_COLOR, { message: 'El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).' })
  color!: string;
}
