import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /inventory/batches (spec §4: "filtros por vencimiento/producto";
 *  plan.md §1 Pestaña 2: "Lotes por vencer este mes"). */
export class QueryBatchesDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'El filtro de producto no es válido.' })
  productId?: string;

  /** Solo lotes cuya expirationDate cae dentro de los próximos N días
   *  (incluye ya vencidos) — alimenta el filtro rápido "Lotes por vencer este
   *  mes" (plan.md) sin que el frontend tenga que calcular fechas. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El filtro de días para vencer no es válido.' })
  @Min(0, { message: 'El filtro de días para vencer no puede ser negativo.' })
  expiringWithinDays?: number;
}
