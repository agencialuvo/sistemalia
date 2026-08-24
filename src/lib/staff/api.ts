import { api } from "@/lib/api";
import type {
  StaffAbsence,
  StaffImportResult,
  StaffMember,
  Specialty,
} from "@/lib/validators/staff";

/**
 * Thin typed wrapper over the Módulo 04 endpoints.
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético (same contract as lib/services/api.ts).
 */

export interface StaffFilters {
  specialtyId?: string;
  serviceId?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

/** Page sizes offered by the directory's page-size selector — same set as
 *  Módulo 03's SERVICE_PAGE_SIZES (lib/services/api.ts). */
export const STAFF_PAGE_SIZES = [12, 24, 48] as const;
export type StaffPageSize = (typeof STAFF_PAGE_SIZES)[number];

export interface StaffPage {
  data: StaffMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listStaff(filters: StaffFilters = {}): Promise<StaffPage> {
  const params: Record<string, string> = {};
  if (filters.specialtyId) params.specialtyId = filters.specialtyId;
  if (filters.serviceId) params.serviceId = filters.serviceId;
  if (filters.search) params.search = filters.search;
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive);
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<StaffPage>("/staff", { params });
  return data;
}

export async function getStaffMember(id: string): Promise<StaffMember> {
  const { data } = await api.get<StaffMember>(`/staff/${id}`);
  return data;
}

export async function createStaffMember(payload: Record<string, unknown>): Promise<StaffMember> {
  const { data } = await api.post<StaffMember>("/staff", payload);
  return data;
}

export async function updateStaffMember(
  id: string,
  payload: Record<string, unknown>,
): Promise<StaffMember> {
  const { data } = await api.patch<StaffMember>(`/staff/${id}`, payload);
  return data;
}

/** Logical deactivation — the row is never removed (spec §3). */
export async function deactivateStaffMember(id: string): Promise<StaffMember> {
  const { data } = await api.delete<StaffMember>(`/staff/${id}`);
  return data;
}

/** Reactivates a previously deactivated professional; no dedicated route. */
export async function reactivateStaffMember(id: string): Promise<StaffMember> {
  return updateStaffMember(id, { isActive: true });
}

/**
 * Genuine, irreversible hard delete — distinct from `deactivateStaffMember`.
 * Callers must confirm with the user first; there is no undo once this
 * resolves (see backend's StaffMembersService.removePermanently).
 */
export async function deleteStaffMemberPermanently(
  id: string,
): Promise<{ id: string; deleted: true }> {
  const { data } = await api.delete<{ id: string; deleted: true }>(`/staff/${id}/permanent`);
  return data;
}

export async function listSpecialties(): Promise<Specialty[]> {
  const { data } = await api.get<Specialty[]>("/staff/specialties");
  return data;
}

export async function createSpecialty(payload: Record<string, unknown>): Promise<Specialty> {
  const { data } = await api.post<Specialty>("/staff/specialties", payload);
  return data;
}

export async function updateSpecialty(
  id: string,
  payload: Record<string, unknown>,
): Promise<Specialty> {
  const { data } = await api.patch<Specialty>(`/staff/specialties/${id}`, payload);
  return data;
}

export interface SpecialtyDeletionResult {
  id: string;
  /** false when the specialty had staff and was deactivated instead. */
  deleted: boolean;
  message: string;
}

export async function removeSpecialty(id: string): Promise<SpecialtyDeletionResult> {
  const { data } = await api.delete<SpecialtyDeletionResult>(`/staff/specialties/${id}`);
  return data;
}

export async function listAbsences(staffMemberId: string): Promise<StaffAbsence[]> {
  const { data } = await api.get<StaffAbsence[]>(`/staff/${staffMemberId}/absences`);
  return data;
}

export async function createAbsence(
  staffMemberId: string,
  payload: { reason: string; startDate: string; endDate: string },
): Promise<StaffAbsence> {
  const { data } = await api.post<StaffAbsence>(`/staff/${staffMemberId}/absences`, payload);
  return data;
}

export async function removeAbsence(absenceId: string): Promise<{ id: string; deleted: boolean }> {
  const { data } = await api.delete<{ id: string; deleted: boolean }>(
    `/staff/absences/${absenceId}`,
  );
  return data;
}

/** Uploads a profile photo and returns its public URL — reuses the same
 *  upload route Services' ImagePicker calls (see lib/services/api.ts). */
export async function uploadStaffAvatar(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ logoUrl: string }>("/tenant/upload-logo", form);
  return data.logoUrl;
}

// -------------------------------------------------------------------------
// Carga masiva (Excel) — same contract as lib/services/api.ts's
// downloadTemplate/importServices, split into two routes instead of one
// `dryRun` query param (see StaffController's export-template/import-preview/
// import).
// -------------------------------------------------------------------------

/**
 * Downloads the official .xlsx template and hands it to the browser.
 *
 * Goes through axios rather than a plain <a href> because the endpoint needs
 * both the session cookie and the x-tenant-id header — a bare link sends
 * neither, and would download a 403 page named "plantilla.xlsx".
 */
export async function downloadStaffTemplate(): Promise<void> {
  const response = await api.get<Blob>("/staff/export-template", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-personal-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dry-run analysis — writes nothing, powers the import dialog's preview step. */
export async function previewStaffExcelImport(file: File): Promise<StaffImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<StaffImportResult>("/staff/import-preview", form);
  return data;
}

/** The real import — valid rows are inserted, invalid ones come back reported
 *  the same way the preview reports them. */
export async function importStaffExcel(file: File): Promise<StaffImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<StaffImportResult>("/staff/import", form);
  return data;
}
