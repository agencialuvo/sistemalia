import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Strict `#RRGGBB`. Narrower than class-validator's @IsHexColor on purpose:
 * that one also accepts 3/4/8-digit forms and an optional `#`, and the 8-digit
 * variant is 8 characters — one more than the VarChar(7) column, so it would
 * pass validation and then fail at the database.
 */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * POST /services/categories — Task 2.1.
 *
 * `tenantId` is deliberately absent: it comes from @TenantId(), which the
 * TenantContextInterceptor only sets after verifying membership. Accepting it
 * in the body would let a caller write into another centro estético, and the
 * global ValidationPipe runs with `forbidNonWhitelisted`, so sending it is a
 * 400 rather than a silent override.
 */
export class CreateCategoryDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio.' })
  @MaxLength(80, { message: 'El nombre de la categoría no puede superar los 80 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /**
   * Painted behind the appointment in the calendar. Validated as a real hex
   * colour because the frontend feeds it straight into a style attribute.
   */
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
