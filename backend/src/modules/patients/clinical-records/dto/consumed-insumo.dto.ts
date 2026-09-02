import { IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

const MAX_QUANTITY = 999_999.99;

/**
 * Consumo real de inventario asociado a una atención (Módulo 07 Fase 3, Task
 * 3.3) — distinto del bloque `_insumo` (marca/lote/vencimiento en texto
 * libre) que ya vivía dentro de `formDataValues`: este SÍ descuenta stock de
 * verdad de un `InventoryBatch`. Ambos son opcionales e independientes — un
 * centro que todavía no usa el Módulo de Inventario puede seguir registrando
 * solo el insumo de texto libre.
 */
export class ConsumedInsumoDto {
  @IsUUID('4', { message: 'El producto de inventario no es válido.' })
  productId!: string;

  /** Si se omite, InventoryService aplica FEFO (lote activo más próximo a
   *  vencer) — mismo criterio que CreateMovementDto. */
  @IsOptional()
  @IsUUID('4', { message: 'El lote seleccionado no es válido.' })
  batchId?: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La cantidad consumida admite máximo 2 decimales.' })
  @IsPositive({ message: 'La cantidad consumida debe ser mayor a 0.' })
  @Max(MAX_QUANTITY, { message: 'La cantidad consumida ingresada es demasiado alta.' })
  quantity!: number;
}
