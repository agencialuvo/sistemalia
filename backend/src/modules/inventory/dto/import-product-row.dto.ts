import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Same MAX_QUANTITY ceiling as CreateProductDto.minStock — an initial stock
 *  in the thousands is already an unusual insumo count for a centro estético. */
const MAX_QUANTITY = 999_999.99;

/**
 * One spreadsheet row, after coercion and before it becomes a Product
 * (+ its opening InventoryBatch/StockMovement, when there is initial stock).
 *
 * Extends CreateProductDto minus `categoryId` — the sheet names the
 * categoría in words, and it may not exist yet at the moment the row is read
 * (auto-created on import, same reasoning as ImportServiceRowDto's
 * categoryName / ImportStaffRowDto's specialtyName) — and adds the three
 * "opening lote" columns, which have no home on Product at all: a non-zero
 * `initialStock` is what tells InventoryService to create the first
 * InventoryBatch + PURCHASE_INPUT kardex row in the same transaction as the
 * product itself.
 */
export class ImportProductRowDto extends OmitType(CreateProductDto, ['categoryId'] as const) {
  @IsOptional()
  @IsString()
  @Transform(trim)
  categoryName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El stock inicial admite máximo 2 decimales.' })
  @Min(0, { message: 'El stock inicial no puede ser negativo.' })
  @Max(MAX_QUANTITY, { message: 'El stock inicial ingresado es demasiado alto.' })
  initialStock?: number;

  @IsOptional()
  @IsString()
  @Transform(trim)
  lotNumber?: string;

  /** ISO "AAAA-MM-DD" once InventoryExcelImportService's tolerant date
   *  parser has run — never the raw cell text. */
  @IsOptional()
  @IsString()
  expirationDate?: string;
}
