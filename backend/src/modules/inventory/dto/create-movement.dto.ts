import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

const MAX_QUANTITY = 999_999.99;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Tipos que este endpoint acepta directamente (spec §4: "Registrar movimiento
 * manual — Ajuste, Merma, Baja por Vencimiento"). PURCHASE_INPUT tiene su
 * propio endpoint (POST /inventory/batches, siempre crea un lote nuevo);
 * CLINICAL_CONSUMPTION y RETAIL_SALE los generan otros módulos llamando a
 * InventoryService.registerMovement directamente (Fase 3, Task 3.3), no un
 * usuario tecleando un ajuste a mano.
 */
export const MANUAL_MOVEMENT_TYPES = ['ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 'EXPIRED_DISCARD'] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** POST /inventory/movements. */
export class CreateMovementDto {
  @IsUUID('4', { message: 'Selecciona un producto válido.' })
  productId!: string;

  /**
   * Requerido para ADJUSTMENT_ADD (hay que decidir a qué lote se le suma
   * stock — no existe un "lote FEFO" para una entrada). Opcional para
   * ADJUSTMENT_SUB/EXPIRED_DISCARD: si se omite, InventoryService aplica FEFO
   * (spec §3.1) y elige automáticamente el lote activo más próximo a vencer.
   */
  @IsOptional()
  @IsUUID('4', { message: 'El lote seleccionado no es válido.' })
  batchId?: string;

  @IsIn(MANUAL_MOVEMENT_TYPES, { message: 'El tipo de movimiento no es válido.' })
  type!: ManualMovementType;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La cantidad admite máximo 2 decimales.' })
  @IsPositive({ message: 'La cantidad debe ser mayor a 0.' })
  @Max(MAX_QUANTITY, { message: 'La cantidad ingresada es demasiado alta.' })
  quantity!: number;

  @IsString({ message: 'Indica el motivo del movimiento.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'Indica el motivo del movimiento.' })
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres.' })
  notes!: string;
}
