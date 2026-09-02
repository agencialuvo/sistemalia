import { api } from "@/lib/api";
import type {
  CommissionType,
  StaffAbsence,
  StaffImportResult,
  StaffMember,
  Specialty,
} from "@/lib/validators/staff";

// -------------------------------------------------------------------------
// Matriz de competencias (asignación masiva Doctores <-> Servicios) — Engine
// de Disponibilidad, inspirado en JetAppointment.
// -------------------------------------------------------------------------

export interface ServiceMatrixStaffRow {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  color: string | null;
  specialty: { id: string; name: string } | null;
  /** Nivel 3 (default) del Esquema de Comisiones Jerárquico. */
  defaultCommissionType: CommissionType | null;
  defaultCommissionValue: string | null;
}

export interface ServiceMatrixServiceColumn {
  id: string;
  name: string;
  category: { id: string; name: string; color: string | null } | null;
  /** Nivel 2 (base) del Esquema de Comisiones Jerárquico. */
  baseCommissionType: CommissionType | null;
  baseCommissionValue: string | null;
}

export interface ServiceMatrixAssignment {
  staffMemberId: string;
  serviceId: string;
  customDurationMinutes: number | null;
  /** Nivel 1 (custom, el más específico) del Esquema de Comisiones
   *  Jerárquico — `customCommissionValue` es un STRING con dos decimales,
   *  misma convención que StaffServiceAssignment (validators/staff.ts). */
  customCommissionType: CommissionType | null;
  customCommissionValue: string | null;
}

export interface ServiceMatrixData {
  staffMembers: ServiceMatrixStaffRow[];
  services: ServiceMatrixServiceColumn[];
  assignments: ServiceMatrixAssignment[];
}

/** GET /staff/services/matrix — pinta la grilla completa de una sola vez. */
export async function getStaffServiceMatrix(): Promise<ServiceMatrixData> {
  const { data } = await api.get<ServiceMatrixData>("/staff/services/matrix");
  return data;
}

export interface BulkServiceMatrixEntry {
  staffMemberId: string;
  serviceId: string;
  customDurationMinutes?: number;
  /** Nivel 1 (custom) del Esquema de Comisiones Jerárquico. Both omitted =
   *  leave whatever commission the pair already had untouched (see
   *  StaffMembersService.bulkSyncServiceMatrix's doc comment); sending one
   *  without the other is rejected server-side. */
  customCommissionType?: CommissionType;
  customCommissionValue?: number;
}

export interface BulkServiceMatrixResult {
  assigned: number;
  removed: number;
}

/**
 * POST /staff/services/bulk-matrix. `serviceIds` is the sync scope — every
 * service listed there ends up with EXACTLY the assignments present for it
 * in `assignments`, including none. Callers touching a single service (e.g.
 * ServiceFormDialog's "Personal Asignado" tab) must pass `serviceIds: [id]`
 * so the rest of the tenant's matrix is left untouched.
 */
export async function bulkSyncServiceMatrix(
  serviceIds: string[],
  assignments: BulkServiceMatrixEntry[],
): Promise<BulkServiceMatrixResult> {
  const { data } = await api.post<BulkServiceMatrixResult>("/staff/services/bulk-matrix", {
    serviceIds,
    assignments,
  });
  return data;
}

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
  payload: {
    type?: string;
    reason: string;
    internalNote?: string;
    startDate: string;
    endDate: string;
  },
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
