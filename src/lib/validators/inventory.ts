import { z } from "zod";

/**
 * Mirrors backend/src/modules/inventory/dto/*.dto.ts (Módulo 07).
 *
 * The API re-validates everything — it is reachable directly — so these
 * schemas exist to give the forms inline errors before a round-trip, not as
 * the security boundary. Keep the two in sync, same rule as
 * validators/service.ts y validators/staff.ts.
 */

export const PRODUCT_TYPES = ["CONSUMABLE", "RETAIL", "BOTH", "EQUIPMENT"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  CONSUMABLE: "Insumo médico",
  RETAIL: "Producto de venta",
  BOTH: "Ambos",
  EQUIPMENT: "Equipo/Accesorio",
};

export const STOCK_MOVEMENT_TYPES = [
  "PURCHASE_INPUT",
  "INITIAL_STOCK",
  "CLINICAL_CONSUMPTION",
  "RETAIL_SALE",
  "ADJUSTMENT_ADD",
  "ADJUSTMENT_SUB",
  "EXPIRED_DISCARD",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  PURCHASE_INPUT: "Ingreso por compra",
  INITIAL_STOCK: "Entrada inicial (carga masiva)",
  CLINICAL_CONSUMPTION: "Consumo en atención",
  RETAIL_SALE: "Venta en caja",
  ADJUSTMENT_ADD: "Ajuste positivo",
  ADJUSTMENT_SUB: "Ajuste negativo / Merma",
  EXPIRED_DISCARD: "Baja por vencimiento",
};

/** Tipos que POST /inventory/movements acepta directamente — el resto los
 *  genera el propio backend (ver create-movement.dto.ts). */
export const MANUAL_MOVEMENT_TYPES = ["ADJUSTMENT_ADD", "ADJUSTMENT_SUB", "EXPIRED_DISCARD"] as const;
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** Presets ofrecidos en el selector de unidad de medida — no es una lista
 *  cerrada, "Otro" revela un campo de texto libre (Task 2.2: "desplegable +
 *  texto libre"). */
export const UNIT_OF_MEASURE_PRESETS = ["ml", "UI", "unidades", "ampolla", "mg", "gr", "sesión"] as const;

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  type: ProductType;
  categoryId: string | null;
  brand: string | null;
  unitOfMeasure: string;
  minStock: string;
  costPrice: string;
  salePrice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Suma de lotes activos — calculado por el backend, no una columna. */
  totalStock: string;
  /** totalStock <= minStock. */
  isLowStock: boolean;
}

export interface InventoryBatchProductRef {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
}

export interface InventoryBatch {
  id: string;
  tenantId: string;
  lotNumber: string;
  expirationDate: string;
  initialQuantity: string;
  currentQuantity: string;
  isActive: boolean;
  createdAt: string;
  product: InventoryBatchProductRef;
}

export interface StockMovementBatchRef {
  id: string;
  lotNumber: string;
  expirationDate: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  type: StockMovementType;
  quantity: string;
  costUnitPrice: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
  product: InventoryBatchProductRef;
  batch: StockMovementBatchRef | null;
  performedBy: { id: string; fullName: string } | null;
}

/** Semáforo DIGEMID (spec §3.2): Rojo <30 días (o ya vencido), Amarillo 31-90,
 *  Verde >90. */
export type ExpirationAlertLevel = "expired" | "red" | "yellow" | "green";

export function expirationAlertLevel(expirationDate: string): ExpirationAlertLevel {
  const daysLeft = Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "red";
  if (daysLeft <= 90) return "yellow";
  return "green";
}

// --- Formularios --------------------------------------------------------

const trimmedRequired = (message: string) => z.string().trim().min(1, { message });

export const productSchema = z.object({
  name: trimmedRequired("El nombre del producto es obligatorio.").max(160, {
    message: "El nombre no puede superar los 160 caracteres.",
  }),
  sku: trimmedRequired("El SKU es obligatorio.").max(60, {
    message: "El SKU no puede superar los 60 caracteres.",
  }),
  type: z.enum(PRODUCT_TYPES, { message: "Selecciona un tipo de producto válido." }),
  unitOfMeasure: trimmedRequired("La unidad de medida es obligatoria.").max(30, {
    message: "La unidad de medida no puede superar los 30 caracteres.",
  }),
  minStock: z
    .string()
    .trim()
    .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0), {
      message: "El stock mínimo debe ser un número mayor o igual a 0.",
    }),
  costPrice: z
    .string()
    .trim()
    .min(1, { message: "El costo es obligatorio." })
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, {
      message: "El costo debe ser un número mayor o igual a 0.",
    }),
  salePrice: z
    .string()
    .trim()
    .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0), {
      message: "El precio de venta debe ser un número mayor o igual a 0.",
    }),
});

export type ProductDraft = z.infer<typeof productSchema>;

export const batchEntrySchema = z.object({
  productId: z.string().uuid({ message: "Selecciona un producto." }),
  lotNumber: trimmedRequired("El número de lote es obligatorio.").max(60, {
    message: "El número de lote no puede superar los 60 caracteres.",
  }),
  expirationDate: trimmedRequired("Selecciona una fecha de vencimiento."),
  quantity: z
    .string()
    .trim()
    .min(1, { message: "La cantidad es obligatoria." })
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, {
      message: "La cantidad debe ser un número mayor a 0.",
    }),
  costUnitPrice: z
    .string()
    .trim()
    .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0), {
      message: "El costo unitario debe ser un número mayor o igual a 0.",
    }),
  notes: z.string().max(500, { message: "Las notas no pueden superar los 500 caracteres." }).optional(),
});

export type BatchEntryDraft = z.infer<typeof batchEntrySchema>;

/** "1500.00" -> "S/ 1,500.00". */
export function formatSolesAmount(value: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(amount);
}

/** "12.50" -> "12.5" (sin ceros de relleno, para mostrar cantidades de stock
 *  sin el aspecto de un monto en soles). */
export function formatQuantity(value: string): string {
  return String(Number(value));
}
