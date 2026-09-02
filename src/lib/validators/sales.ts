import { z } from "zod";

/**
 * Mirrors backend/src/modules/sales/dto/*.dto.ts (Módulo 08).
 *
 * The API re-validates everything — it is reachable directly — so these
 * schemas exist to give the POS/caja forms inline errors before a
 * round-trip, not as the security boundary. Keep the two in sync, same rule
 * as validators/inventory.ts y validators/staff.ts.
 */

const MAX_MONEY = 999_999.99;

export const PAYMENT_METHODS = ["CASH", "YAPE", "PLIN", "CARD", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  CARD: "Tarjeta (POS)",
  TRANSFER: "Transferencia",
};

export const INVOICE_TYPES = ["BOLETA", "FACTURA", "SALE_NOTE"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  BOLETA: "Boleta de Venta",
  FACTURA: "Factura",
  SALE_NOTE: "Nota de Venta",
};

export const INVOICE_STATUSES = ["DRAFT", "PAID", "ANULLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Borrador",
  PAID: "Pagado",
  ANULLED: "Anulado",
};

export const CASH_MOVEMENT_TYPES = [
  "INITIAL_BALANCE",
  "INCOME_SALE",
  "MANUAL_INCOME",
  "EXPENSE_OUT",
  "COMMISSION_PAYMENT",
] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CASH_MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  INITIAL_BALANCE: "Apertura de caja",
  INCOME_SALE: "Cobro de venta",
  MANUAL_INCOME: "Ingreso manual",
  EXPENSE_OUT: "Egreso / Gasto",
  COMMISSION_PAYMENT: "Pago de comisión",
};

/** Tipos que POST /sales/cash-registers/movements acepta directamente —
 *  INITIAL_BALANCE lo genera openCashRegister e INCOME_SALE lo genera
 *  createInvoice (ver create-cash-movement.dto.ts). */
export const MANUAL_CASH_MOVEMENT_TYPES = ["MANUAL_INCOME", "EXPENSE_OUT", "COMMISSION_PAYMENT"] as const;
export type ManualCashMovementType = (typeof MANUAL_CASH_MOVEMENT_TYPES)[number];

export const CUSTOMER_DOC_TYPES = ["DNI", "RUC"] as const;
export type CustomerDocType = (typeof CUSTOMER_DOC_TYPES)[number];

// --- Caja chica -----------------------------------------------------------

export interface CashMovement {
  id: string;
  tenantId: string;
  cashRegisterId: string;
  type: CashMovementType;
  amount: string;
  concept: string | null;
  performedById: string | null;
  createdAt: string;
}

export interface CashRegister {
  id: string;
  tenantId: string;
  openedById: string;
  closedById: string | null;
  initialBalance: string;
  finalBalance: string | null;
  expectedBalance: string | null;
  difference: string | null;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
}

export interface CashRegisterPaymentTotal {
  method: PaymentMethod;
  total: string;
}

/** Lo que devuelven GET /cash-registers/current y POST .../open — el
 *  registro más un resumen calculado en el momento, no columnas propias. */
export interface CashRegisterSummary extends CashRegister {
  runningBalance: string;
  movements: CashMovement[];
  paymentsByMethod: CashRegisterPaymentTotal[];
}

// --- Comprobantes / Ventas -------------------------------------------------

export interface InvoiceItemRef {
  id: string;
  name: string;
}

export interface InvoiceProductRef {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
}

export interface InvoiceStaffRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface InvoiceBatchRef {
  id: string;
  lotNumber: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  serviceId: string | null;
  productId: string | null;
  batchId: string | null;
  staffId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  commissionAmount: string | null;
  service?: InvoiceItemRef | null;
  product?: InvoiceProductRef | null;
  staff?: InvoiceStaffRef | null;
  batch?: InvoiceBatchRef | null;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  cashRegisterId: string;
  method: PaymentMethod;
  amount: string;
  referenceNumber: string | null;
  createdAt: string;
}

export interface InvoicePatientRef {
  id: string;
  firstName: string;
  lastName: string;
}

/** Fila de GET /sales/invoices — resumen, sin items. */
export interface InvoiceListRow {
  id: string;
  tenantId: string;
  type: InvoiceType;
  series: string;
  number: number;
  status: InvoiceStatus;
  customerDocType: CustomerDocType | null;
  customerDocNumber: string | null;
  customerName: string | null;
  /** Cita que originó el cobro — null en una venta directa de mostrador.
   *  Usado por PosTab para no reofrecer una cita ya cobrada (tasks.md Fase 3,
   *  Task 3.3). */
  appointmentId: string | null;
  subtotal: string;
  igv: string;
  total: string;
  createdAt: string;
  anulledAt: string | null;
  anulledReason: string | null;
  patient: InvoicePatientRef | null;
  itemCount: number;
  payments: Payment[];
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
  PAID: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ANULLED: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 line-through",
};

/** Nombre a mostrar en el ticket/historial: paciente si lo hay, si no el
 *  nombre de cliente vario capturado en el comprobante. */
export function invoiceCustomerLabel(
  invoice: Pick<InvoiceListRow, "patient" | "customerName">,
): string {
  if (invoice.patient) return `${invoice.patient.firstName} ${invoice.patient.lastName}`;
  return invoice.customerName?.trim() || "Cliente vario";
}

/** GET /sales/invoices/:id y respuesta de POST /sales/invoices. */
export interface InvoiceDetail extends Omit<InvoiceListRow, "itemCount"> {
  appointment: { id: string; startAt: string } | null;
  createdBy: { id: string; fullName: string };
  items: InvoiceItem[];
}

// --- Formularios ------------------------------------------------------------

export const openCashSchema = z.object({
  initialBalance: z
    .string()
    .trim()
    .min(1, { message: "El saldo inicial es obligatorio." })
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_MONEY, {
      message: "El saldo inicial debe ser un número válido.",
    }),
  notes: z.string().max(500, { message: "Las notas no pueden superar los 500 caracteres." }).optional(),
});

export type OpenCashDraft = z.infer<typeof openCashSchema>;

export const closeCashSchema = z.object({
  finalBalance: z
    .string()
    .trim()
    .min(1, { message: "El saldo contado es obligatorio." })
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_MONEY, {
      message: "El saldo contado debe ser un número válido.",
    }),
  notes: z.string().max(500, { message: "Las notas no pueden superar los 500 caracteres." }).optional(),
});

export type CloseCashDraft = z.infer<typeof closeCashSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(MANUAL_CASH_MOVEMENT_TYPES, { message: "Selecciona un tipo de movimiento válido." }),
  amount: z
    .string()
    .trim()
    .min(1, { message: "El monto es obligatorio." })
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0 && Number(value) <= MAX_MONEY, {
      message: "El monto debe ser un número mayor a 0.",
    }),
  concept: z
    .string()
    .trim()
    .min(1, { message: "Indica el concepto del movimiento." })
    .max(300, { message: "El concepto no puede superar los 300 caracteres." }),
});

export type CashMovementDraft = z.infer<typeof cashMovementSchema>;

/** Valida solo los campos de cabecera del comprobante — el carrito
 *  (items/payments) se valida aparte en pos-tab.tsx porque su forma de
 *  error (por fila) no encaja en un solo mapa de errores de formulario. */
export const createInvoiceSchema = z.object({
  type: z.enum(INVOICE_TYPES, { message: "Selecciona un tipo de comprobante válido." }),
  customerDocType: z.enum(CUSTOMER_DOC_TYPES).optional(),
  customerDocNumber: z
    .string()
    .trim()
    .max(20, { message: "El número de documento no puede superar los 20 caracteres." })
    .optional(),
  customerName: z
    .string()
    .trim()
    .max(200, { message: "El nombre no puede superar los 200 caracteres." })
    .optional(),
});

export type CreateInvoiceHeaderDraft = z.infer<typeof createInvoiceSchema>;

/** "1500.00" -> "S/ 1,500.00". */
export function formatSolesAmount(value: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(amount);
}

export function invoiceNumberLabel(invoice: Pick<InvoiceListRow, "series" | "number">): string {
  return `${invoice.series}-${String(invoice.number).padStart(8, "0")}`;
}
