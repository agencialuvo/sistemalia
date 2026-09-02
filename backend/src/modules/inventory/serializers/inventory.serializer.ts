import { InventoryBatch, Prisma, Product, StockMovement } from '@prisma/client';

/**
 * Formats one Decimal for JSON — same reasoning as Service's toMoney
 * (service.serializer.ts): Prisma returns Decimal columns as decimal.js
 * instances, useless straight through JSON.stringify. Serialised as a fixed
 * 2-decimal STRING, never a JS number, so a quantity/price that survives the
 * database exactly cannot come back mangled by float arithmetic on the client.
 */
function toDecimalString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toNullableDecimalString(value: Prisma.Decimal | null): string | null {
  return value === null ? null : toDecimalString(value);
}

export type SerializedProduct = Omit<Product, 'minStock' | 'costPrice' | 'salePrice'> & {
  minStock: string;
  costPrice: string;
  salePrice: string | null;
  /** Suma de InventoryBatch.currentQuantity entre todos los lotes activos de
   *  este producto — no es una columna, la calcula InventoryService al armar
   *  la lista (spec §4: "con stock consolidado y estado de alerta"). */
  totalStock: string;
  /** true cuando totalStock <= minStock — la señal visual del catálogo, no un
   *  bloqueo: un consumo puede seguir registrándose por debajo del umbral. */
  isLowStock: boolean;
};

export function serializeProduct(product: Product, totalStock: Prisma.Decimal): SerializedProduct {
  return {
    ...product,
    minStock: toDecimalString(product.minStock),
    costPrice: toDecimalString(product.costPrice),
    salePrice: toNullableDecimalString(product.salePrice),
    totalStock: toDecimalString(totalStock),
    isLowStock: totalStock.lte(product.minStock),
  };
}

type ProductRef = Pick<Product, 'id' | 'name' | 'sku' | 'unitOfMeasure'>;
type BatchRef = Pick<InventoryBatch, 'id' | 'lotNumber' | 'expirationDate'>;
type PerformedByRef = { id: string; fullName: string };

type BatchWithProduct = InventoryBatch & { product: ProductRef };

export type SerializedInventoryBatch = Omit<
  InventoryBatch,
  'productId' | 'initialQuantity' | 'currentQuantity'
> & {
  initialQuantity: string;
  currentQuantity: string;
  product: ProductRef;
};

export function serializeBatch(batch: BatchWithProduct): SerializedInventoryBatch {
  const { product, productId: _productId, initialQuantity, currentQuantity, ...rest } = batch;
  return {
    ...rest,
    initialQuantity: toDecimalString(initialQuantity),
    currentQuantity: toDecimalString(currentQuantity),
    product,
  };
}

type MovementWithRelations = StockMovement & {
  product: ProductRef;
  batch: BatchRef | null;
  performedBy: PerformedByRef | null;
};

export type SerializedStockMovement = Omit<
  StockMovement,
  'productId' | 'batchId' | 'performedById' | 'quantity' | 'costUnitPrice'
> & {
  quantity: string;
  costUnitPrice: string | null;
  product: ProductRef;
  batch: BatchRef | null;
  performedBy: PerformedByRef | null;
};

export function serializeMovement(movement: MovementWithRelations): SerializedStockMovement {
  const {
    product,
    batch,
    performedBy,
    productId: _productId,
    batchId: _batchId,
    performedById: _performedById,
    quantity,
    costUnitPrice,
    ...rest
  } = movement;
  return {
    ...rest,
    quantity: toDecimalString(quantity),
    costUnitPrice: toNullableDecimalString(costUnitPrice),
    product,
    batch,
    performedBy,
  };
}
