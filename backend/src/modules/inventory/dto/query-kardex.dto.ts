import { StockMovementType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** GET /inventory/kardex (spec §4: "historial unificado de movimientos"). */
export class QueryKardexDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'El filtro de producto no es válido.' })
  productId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El filtro de lote no es válido.' })
  batchId?: string;

  @IsOptional()
  @IsEnum(StockMovementType, { message: 'El filtro de tipo de movimiento no es válido.' })
  type?: StockMovementType;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "desde" no es válida.' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha "hasta" no es válida.' })
  dateTo?: string;
}
