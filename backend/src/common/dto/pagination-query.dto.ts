import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

/** Page sizes every paginated list endpoint offers (services, staff, …). */
export const PAGE_SIZES = [12, 24, 48] as const;

/**
 * Mixin fields for a paginated `GET` list endpoint. A query DTO extends this
 * alongside its own filters (see QueryServicesDto, QueryStaffDto) rather than
 * repeating the page/pageSize validation in each one.
 */
export class PaginationQueryDto {
  /** 1-based; omitted means "page 1". */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página no es válido.' })
  @IsIn(PAGE_SIZES, { message: 'El tamaño de página debe ser 12, 24 o 48.' })
  pageSize?: number;
}
