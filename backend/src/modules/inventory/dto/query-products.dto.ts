import { ProductType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Query-string booleans arrive as "true"/"false" strings — same guard as
 *  QueryServicesDto's toBoolean (Boolean("false") === true would flip the
 *  filter). */
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** GET /inventory/products (spec §4: "con stock consolidado y estado de
 *  alerta"). */
export class QueryProductsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ProductType, { message: 'El filtro de tipo no es válido.' })
  type?: ProductType;

  /** Omitido significa "ambos": el catálogo muestra activos e inactivos con
   *  un badge, mismo criterio que QueryServicesDto. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro de estado debe ser true o false.' })
  isActive?: boolean;
}
