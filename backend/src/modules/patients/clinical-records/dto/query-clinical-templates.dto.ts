import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Query-string booleans arrive as "true"/"false" strings — same
 *  `Boolean("false") === true` trap as QueryServicesDto, hence the explicit
 *  literal check instead of `@Type(() => Boolean)`. */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Filters for GET /clinical-templates (Plantillas Clínicas: búsqueda,
 *  categoría, estado). Omitting `isActive` means "both" — the management
 *  grid shows active and inactive with a badge, same convention as
 *  QueryServicesDto. Callers that need only active templates (the record
 *  form's picker) pass `isActive: true` explicitly. */
export class QueryClinicalTemplatesDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(150)
  search?: string;

  /** Free text — matched against the category's NAME (see the JSON path
   *  filter in ClinicalRecordsService.listTemplates), not a closed enum
   *  anymore now that categories are a per-tenant catalogue. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60, { message: 'El filtro de categoría no es válido.' })
  category?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro de estado debe ser true o false.' })
  isActive?: boolean;
}
