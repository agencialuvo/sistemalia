import { api } from "@/lib/api";
import type {
  CashMovement,
  CashRegisterSummary,
  CashRegister,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceStatus,
  InvoiceType,
  ManualCashMovementType,
  PaymentMethod,
} from "@/lib/validators/sales";

/**
 * Thin typed wrapper over the Módulo 08 endpoints.
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético (same contract as lib/inventory/api.ts y lib/staff/api.ts).
 */

/** Page sizes the backend accepts (PaginationQueryDto's @IsIn) — same
 *  contract as INVENTORY_PAGE_SIZES (lib/inventory/api.ts). */
export const SALES_PAGE_SIZES = [12, 24, 48] as const;
export type SalesPageSize = (typeof SALES_PAGE_SIZES)[number];

// --- Caja chica -------------------------------------------------------------

/** null si no hay ninguna caja abierta para el tenant. */
export async function getCurrentCashRegister(): Promise<CashRegisterSummary | null> {
  const { data } = await api.get<CashRegisterSummary | null>("/sales/cash-registers/current");
  return data;
}

export async function openCashRegister(payload: {
  initialBalance: number;
  notes?: string;
}): Promise<CashRegisterSummary> {
  const { data } = await api.post<CashRegisterSummary>("/sales/cash-registers/open", payload);
  return data;
}

export async function closeCashRegister(payload: {
  finalBalance: number;
  notes?: string;
}): Promise<CashRegister> {
  const { data } = await api.post<CashRegister>("/sales/cash-registers/close", payload);
  return data;
}

export async function registerCashMovement(payload: {
  type: ManualCashMovementType;
  amount: number;
  concept: string;
}): Promise<CashMovement> {
  const { data } = await api.post<CashMovement>("/sales/cash-registers/movements", payload);
  return data;
}

// --- Comprobantes / Ventas ---------------------------------------------------

export interface InvoiceFilters {
  status?: InvoiceStatus;
  type?: InvoiceType;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface InvoicesPage {
  data: InvoiceListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<InvoicesPage> {
  const params: Record<string, string> = {};
  if (filters.status) params.status = filters.status;
  if (filters.type) params.type = filters.type;
  if (filters.patientId) params.patientId = filters.patientId;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<InvoicesPage>("/sales/invoices", { params });
  return data;
}

export interface CreateInvoiceItemPayload {
  serviceId?: string;
  productId?: string;
  batchId?: string;
  staffId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoicePaymentPayload {
  method: PaymentMethod;
  amount: number;
  referenceNumber?: string;
}

export interface CreateInvoicePayload {
  type: InvoiceType;
  patientId?: string;
  appointmentId?: string;
  customerDocType?: "DNI" | "RUC";
  customerDocNumber?: string;
  customerName?: string;
  items: CreateInvoiceItemPayload[];
  payments: CreateInvoicePaymentPayload[];
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<InvoiceDetail> {
  const { data } = await api.post<InvoiceDetail>("/sales/invoices", payload);
  return data;
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const { data } = await api.get<InvoiceDetail>(`/sales/invoices/${id}`);
  return data;
}

export async function anullInvoice(id: string, reason: string): Promise<InvoiceDetail> {
  const { data } = await api.patch<InvoiceDetail>(`/sales/invoices/${id}/anull`, { reason });
  return data;
}
