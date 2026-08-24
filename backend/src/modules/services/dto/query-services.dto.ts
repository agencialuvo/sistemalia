import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query-string booleans arrive as the strings "true"/"false".
 *
 * `@Type(() => Boolean)` is the obvious-looking choice and is wrong here:
 * Boolean("false") is `true`, so ?isActive=false would be read as a filter for
 * ACTIVE services — the exact opposite of what was asked. Anything that is not
 * a recognised literal is left untouched so @IsBoolean reports it.
 */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** Filters for GET /services (spec §3: categoría, búsqueda por texto, estado). */
export class QueryServicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'El filtro de categoría no es válido.' })
  categoryId?: string;

  /** Matched case-insensitively against name and commercial description. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  /** Omitted means "both": the grid shows active and inactive with a badge. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro de estado debe ser true o false.' })
  isActive?: boolean;
}
