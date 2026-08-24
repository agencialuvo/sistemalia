import { api } from "@/lib/api";
import type {
  ImportResult,
  Service,
  ServiceCategory,
} from "@/lib/validators/service";

/**
 * Thin typed wrapper over the Módulo 03 endpoints.
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético. Adding it per call is how one forgotten request turns into
 * a 403 that reads like a permissions bug.
 */

export interface ServiceFilters {
  categoryId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

/** Page sizes offered by the catalogue's page-size selector. */
export const SERVICE_PAGE_SIZES = [12, 24, 48] as const;
export type ServicePageSize = (typeof SERVICE_PAGE_SIZES)[number];

export interface ServicesPage {
  data: Service[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listServices(filters: ServiceFilters = {}): Promise<ServicesPage> {
  const params: Record<string, string> = {};
  if (filters.categoryId) params.categoryId = filters.categoryId;
  if (filters.search) params.search = filters.search;
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive);
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<ServicesPage>("/services", { params });
  return data;
}

export async function getService(id: string): Promise<Service> {
  const { data } = await api.get<Service>(`/services/${id}`);
  return data;
}

export async function createService(payload: Record<string, unknown>): Promise<Service> {
  const { data } = await api.post<Service>("/services", payload);
  return data;
}

export async function updateService(
  id: string,
  payload: Record<string, unknown>,
): Promise<Service> {
  const { data } = await api.patch<Service>(`/services/${id}`, payload);
  return data;
}

/** Logical deactivation — the row is never removed (spec §3). */
export async function deactivateService(id: string): Promise<Service> {
  const { data } = await api.delete<Service>(`/services/${id}`);
  return data;
}

/** Reactivates a previously deactivated service; there is no dedicated route. */
export async function reactivateService(id: string): Promise<Service> {
  return updateService(id, { isActive: true });
}

/**
 * Genuine, irreversible hard delete — distinct from `deactivateService`.
 * Callers must confirm with the user first; there is no undo once this
 * resolves (see backend's ServicesService.removePermanently).
 */
export async function deleteServicePermanently(id: string): Promise<{ id: string; deleted: true }> {
  const { data } = await api.delete<{ id: string; deleted: true }>(`/services/${id}/permanent`);
  return data;
}

export async function listCategories(): Promise<ServiceCategory[]> {
  const { data } = await api.get<ServiceCategory[]>("/services/categories");
  return data;
}

export async function createCategory(payload: Record<string, unknown>): Promise<ServiceCategory> {
  const { data } = await api.post<ServiceCategory>("/services/categories", payload);
  return data;
}

export async function updateCategory(
  id: string,
  payload: Record<string, unknown>,
): Promise<ServiceCategory> {
  const { data } = await api.patch<ServiceCategory>(`/services/categories/${id}`, payload);
  return data;
}

export interface CategoryDeletionResult {
  id: string;
  /** false when the category had services and was deactivated instead. */
  deleted: boolean;
  message: string;
}

export async function removeCategory(id: string): Promise<CategoryDeletionResult> {
  const { data } = await api.delete<CategoryDeletionResult>(`/services/categories/${id}`);
  return data;
}

/**
 * Downloads the official .xlsx template and hands it to the browser.
 *
 * Goes through axios rather than a plain <a href> because the endpoint needs
 * both the session cookie and the x-tenant-id header — a bare link sends
 * neither, and would download a 403 page named "plantilla.xlsx".
 */
export async function downloadTemplate(): Promise<void> {
  const response = await api.get<Blob>("/services/template", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-servicios-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Without this the blob stays in memory for the life of the document.
    URL.revokeObjectURL(url);
  }
}

/**
 * Bulk import. `dryRun` analyses the file and writes nothing — that is what
 * the preview calls before the user confirms.
 */
export async function importServices(file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ImportResult>(
    `/services/import?dryRun=${dryRun}`,
    form,
  );
  return data;
}

/**
 * Uploads a service image and returns its public URL.
 *
 * Reuses POST /tenant/upload-logo, the only upload route the API exposes today
 * (Módulo 02). Files therefore land under uploads/logos/ regardless of what
 * they depict — a naming wart, not a correctness problem. When Módulo 03 gets
 * its own route, only this function changes.
 */
export async function uploadServiceImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ logoUrl: string }>("/tenant/upload-logo", form);
  return data.logoUrl;
}
