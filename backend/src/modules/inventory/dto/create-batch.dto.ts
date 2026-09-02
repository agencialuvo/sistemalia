import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';

const MAX_MONEY = 999_999.99;
const MAX_QUANTITY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /inventory/batches (spec §4: "Registrar ingreso de nuevo lote —
 * Entrada por compra"). Crea el InventoryBatch y, en la misma transacción, la
 * fila de Kardex PURCHASE_INPUT correspondiente — nunca se registra un lote
 * sin dejar rastro del ingreso.
 */
export class CreateBatchDto {
  @IsUUID('4', { message: 'Selecciona un producto válido.' })
  productId!: string;

  @IsString({ message: 'El número de lote es obligatorio.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'El número de lote es obligatorio.' })
  @MaxLength(60, { message: 'El número de lote no puede superar los 60 caracteres.' })
  lotNumber!: string;

  @IsDateString({}, { message: 'La fecha de vencimiento no es válida.' })
  expirationDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La cantidad admite máximo 2 decimales.' })
  @IsPositive({ message: 'La cantidad debe ser mayor a 0.' })
  @Max(MAX_QUANTITY, { message: 'La cantidad ingresada es demasiado alta.' })
  quantity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El costo unitario admite máximo 2 decimales.' })
  @Max(MAX_MONEY, { message: 'El costo unitario ingresado es demasiado alto.' })
  costUnitPrice?: number;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(500, { message: 'Las notas no pueden superar los 500 caracteres.' })
  notes?: string;
}
