import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /staff/specialties — Task 2.1.
 *
 * `tenantId` is deliberately absent, same reasoning as CreateCategoryDto: it
 * comes from @TenantId(), never from the body, so the global ValidationPipe's
 * `forbidNonWhitelisted` rejects an attempt to send it instead of silently
 * ignoring it.
 */
export class CreateSpecialtyDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'El nombre de la especialidad es obligatorio.' })
  @MaxLength(80, { message: 'El nombre de la especialidad no puede superar los 80 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
