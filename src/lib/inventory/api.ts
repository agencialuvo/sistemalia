import { api } from "@/lib/api";
import type {
  InventoryBatch,
  ManualMovementType,
  Product,
  ProductType,
  StockMovement,
  StockMovementType,
} from "@/lib/validators/inventory";

/**
 * Thin typed wrapper over the Módulo 07 endpoints.
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético (same contract as lib/services/api.ts y lib/staff/api.ts).
 */

/** Page sizes the backend accepts (PaginationQueryDto's @IsIn) — passing
 *  anything else (or omitting page/pageSize) makes a list endpoint return
 *  every row unpaginated. */
export const INVENTORY_PAGE_SIZES = [12, 24, 48] as const;
export type InventoryPageSize = (typeof INVENTORY_PAGE_SIZES)[number];

export interface ProductFilters {
  search?: string;
  type?: ProductType;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductsPage {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listProducts(filters: ProductFilters = {}): Promise<ProductsPage> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.type) params.type = filters.type;
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive);
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<ProductsPage>("/inventory/products", { params });
  return data;
}

export async function createProduct(payload: Record<string, unknown>): Promise<Product> {
  const { data } = await api.post<Product>("/inventory/products", payload);
  return data;
}

export async function updateProduct(id: string, payload: Record<string, unknown>): Promise<Product> {
  const { data } = await api.patch<Product>(`/inventory/products/${id}`, payload);
  return data;
}

/** Baja/alta lógica — no hay borrado físico (ver UpdateProductDto). */
export async function setProductActive(id: string, isActive: boolean): Promise<Product> {
  return updateProduct(id, { isActive });
}

export interface BatchFilters {
  productId?: string;
  expiringWithinDays?: number;
  page?: number;
  pageSize?: number;
}

export interface BatchesPage {
  data: InventoryBatch[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listBatches(filters: BatchFilters = {}): Promise<BatchesPage> {
  const params: Record<string, string> = {};
  if (filters.productId) params.productId = filters.productId;
  if (filters.expiringWithinDays !== undefined) {
    params.expiringWithinDays = String(filters.expiringWithinDays);
  }
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<BatchesPage>("/inventory/batches", { params });
  return data;
}

export interface CreateBatchPayload {
  productId: string;
  lotNumber: string;
  /** ISO date. */
  expirationDate: string;
  quantity: number;
  costUnitPrice?: number;
  notes?: string;
}

export interface CreateBatchResult {
  batch: InventoryBatch;
  movement: StockMovement;
}

export async function createBatch(payload: CreateBatchPayload): Promise<CreateBatchResult> {
  const { data } = await api.post<CreateBatchResult>("/inventory/batches", payload);
  return data;
}

export interface KardexFilters {
  productId?: string;
  batchId?: string;
  type?: StockMovementType;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface KardexPage {
  data: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listKardex(filters: KardexFilters = {}): Promise<KardexPage> {
  const params: Record<string, string> = {};
  if (filters.productId) params.productId = filters.productId;
  if (filters.batchId) params.batchId = filters.batchId;
  if (filters.type) params.type = filters.type;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<KardexPage>("/inventory/kardex", { params });
  return data;
}

export interface CreateMovementPayload {
  productId: string;
  batchId?: string;
  type: ManualMovementType;
  quantity: number;
  notes: string;
}

export async function createMovement(payload: CreateMovementPayload): Promise<StockMovement> {
  const { data } = await api.post<StockMovement>("/inventory/movements", payload);
  return data;
}

// -------------------------------------------------------------------------
// Carga masiva de productos
// -------------------------------------------------------------------------

export type ImportRowStatus = "valid" | "duplicate" | "error";

export interface ImportPreviewRow {
  row: number;
  sku: string;
  name: string;
  type: string;
  unitOfMeasure: string;
  minStock: string;
  costPrice: string;
  salePrice: string;
  status: ImportRowStatus;
  errors: string[];
}

export interface ImportError {
  row: number;
  column: string;
  error: string;
}

export interface ImportProductsResult {
  successCount: number;
  duplicateCount: number;
  errors: ImportError[];
  rows: ImportPreviewRow[];
  totalRows: number;
  imported: number;
  dryRun: boolean;
}

/** GET /inventory/products/template — downloads directly, same blob-URL
 *  pattern as lib/services/api.ts's downloadTemplate(). */
export async function downloadProductsTemplate(): Promise<void> {
  const response = await api.get<Blob>("/inventory/products/template", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-productos-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** POST /inventory/products/bulk-import?dryRun=. `dryRun: true` analyses the
 *  file and writes nothing — the import dialog's preview table. */
export async function bulkImportProducts(file: File, dryRun: boolean): Promise<ImportProductsResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ImportProductsResult>(
    `/inventory/products/bulk-import?dryRun=${dryRun}`,
    form,
  );
  return data;
}
