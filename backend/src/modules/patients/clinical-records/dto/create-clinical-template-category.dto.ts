import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Strict `#RRGGBB` — same rule as services/dto/create-category.dto.ts. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** POST /clinical-templates/categories (Plantillas Clínicas: categorías
 *  administrables por tenant). `tenantId` is deliberately absent — it comes
 *  from @TenantId(), never from the body. */
export class CreateClinicalTemplateCategoryDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio.' })
  @MaxLength(60, { message: 'El nombre de la categoría no puede superar los 60 caracteres.' })
  name!: string;

  @IsString()
  @Matches(HEX_COLOR, { message: 'El color debe ser un hexadecimal de 6 dígitos (ej. #7C3AED).' })
  color!: string;
}
