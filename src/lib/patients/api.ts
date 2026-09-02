import { api } from "@/lib/api";
import type { ClinicalTemplateCategoryOption } from "@/lib/validators/clinical-template";
import type {
  ClinicalFormTemplate,
  ClinicalFormTemplateSchema,
  ClinicalProcedureRecord,
  FaceMappingData,
  Gender,
  Patient,
  PatientClinicalNote,
  PatientGalleryImage,
  PatientImportResult,
  PatientMedicalHistory,
  PatientStatus,
  PatientTag,
} from "@/lib/validators/patient";

/**
 * Thin typed wrapper over the Módulo 05 endpoints (Pacientes + Fichas
 * Clínicas Dinámicas). `x-tenant-id` is NOT set here — the axios request
 * interceptor in src/lib/api.ts attaches it to every call once AuthProvider
 * knows the active centro estético (same contract as lib/services/api.ts and
 * lib/staff/api.ts).
 */

// -------------------------------------------------------------------------
// Pacientes
// -------------------------------------------------------------------------

export interface PatientFilters {
  search?: string;
  status?: PatientStatus;
  gender?: Gender;
  tags?: string[];
  createdFrom?: string;
  page?: number;
  pageSize?: number;
}

/** Page sizes offered by the directory's page-size selector — same set as
 *  Módulo 03/04's SERVICE_PAGE_SIZES/STAFF_PAGE_SIZES. */
export const PATIENT_PAGE_SIZES = [12, 24, 48] as const;
export type PatientPageSize = (typeof PATIENT_PAGE_SIZES)[number];

export interface PatientPage {
  data: Patient[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listPatients(filters: PatientFilters = {}): Promise<PatientPage> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.gender) params.gender = filters.gender;
  if (filters.tags && filters.tags.length > 0) params.tags = filters.tags.join(",");
  if (filters.createdFrom) params.createdFrom = filters.createdFrom;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<PatientPage>("/patients", { params });
  return data;
}

/** Ficha 360° completa — GET /patients/:id. */
export async function getPatientProfile(id: string): Promise<Patient> {
  const { data } = await api.get<Patient>(`/patients/${id}`);
  return data;
}

export interface PatientStats {
  total: number;
  active: number;
  newThisMonth: number;
}

/** GET /patients/stats — conteos reales del tenant para las 3 tarjetas de KPI
 *  del directorio (reemplaza el workaround de 3 llamadas a listPatients con
 *  pageSize=1 que se usaba antes). */
export async function getPatientStats(): Promise<PatientStats> {
  const { data } = await api.get<PatientStats>("/patients/stats");
  return data;
}

export async function createPatient(payload: Record<string, unknown>): Promise<Patient> {
  const { data } = await api.post<Patient>("/patients", payload);
  return data;
}

export async function updatePatient(id: string, payload: Record<string, unknown>): Promise<Patient> {
  const { data } = await api.patch<Patient>(`/patients/${id}`, payload);
  return data;
}

/** Inactivado lógico — el paciente nunca se borra (spec §3). */
export async function deactivatePatient(id: string): Promise<Patient> {
  const { data } = await api.delete<Patient>(`/patients/${id}`);
  return data;
}

/** Sube una foto de perfil y devuelve su URL pública — reusa la misma ruta
 *  genérica que uploadStaffAvatar (lib/staff/api.ts). */
export async function uploadPatientAvatar(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ logoUrl: string }>("/tenant/upload-logo", form);
  return data.logoUrl;
}

// -------------------------------------------------------------------------
// Carga masiva (Excel) — mismo contrato que lib/staff/api.ts's
// downloadStaffTemplate/previewStaffExcelImport/importStaffExcel: el archivo
// se genera y se parsea en el backend (PatientsExcelImportService), no en el
// navegador.
// -------------------------------------------------------------------------

/** Descarga la plantilla .xlsx oficial y se la entrega al navegador — mismo
 *  motivo que downloadStaffTemplate para pasar por axios en vez de un <a
 *  href> plano: el endpoint necesita la cookie de sesión y el header
 *  x-tenant-id. */
export async function downloadPatientsTemplate(): Promise<void> {
  const response = await api.get<Blob>("/patients/export-template", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-pacientes-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Análisis dry-run — no escribe nada, alimenta la vista previa del modal de
 *  importación. */
export async function previewPatientsExcelImport(file: File): Promise<PatientImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<PatientImportResult>("/patients/import-preview", form);
  return data;
}

/** La importación real — las filas válidas se insertan, las inválidas se
 *  reportan igual que en la vista previa. */
export async function importPatientsExcel(file: File): Promise<PatientImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<PatientImportResult>("/patients/bulk-import", form);
  return data;
}

// -------------------------------------------------------------------------
// Antecedentes médicos
// -------------------------------------------------------------------------

export async function getMedicalHistory(patientId: string): Promise<PatientMedicalHistory | null> {
  const { data } = await api.get<PatientMedicalHistory | null>(`/patients/${patientId}/medical-history`);
  return data;
}

export async function upsertMedicalHistory(
  patientId: string,
  payload: Record<string, unknown>,
): Promise<PatientMedicalHistory> {
  const { data } = await api.put<PatientMedicalHistory>(
    `/patients/${patientId}/medical-history`,
    payload,
  );
  return data;
}

// -------------------------------------------------------------------------
// Notas clínicas
// -------------------------------------------------------------------------

export async function createClinicalNote(
  patientId: string,
  payload: { title: string; content: string; isPrivate?: boolean },
): Promise<PatientClinicalNote> {
  const { data } = await api.post<PatientClinicalNote>(`/patients/${patientId}/notes`, payload);
  return data;
}

// -------------------------------------------------------------------------
// Galería antes/después
// -------------------------------------------------------------------------

export async function addGalleryImage(
  patientId: string,
  payload: Record<string, unknown>,
): Promise<PatientGalleryImage> {
  const { data } = await api.post<PatientGalleryImage>(`/patients/${patientId}/gallery`, payload);
  return data;
}

export async function removeGalleryImage(patientId: string, imageId: string): Promise<{ id: string }> {
  const { data } = await api.delete<{ id: string }>(`/patients/${patientId}/gallery/${imageId}`);
  return data;
}

// -------------------------------------------------------------------------
// Etiquetas de pacientes (catálogo administrable)
// -------------------------------------------------------------------------

export async function listPatientTags(): Promise<PatientTag[]> {
  const { data } = await api.get<PatientTag[]>("/patients/tags");
  return data;
}

export async function createPatientTag(payload: Record<string, unknown>): Promise<PatientTag> {
  const { data } = await api.post<PatientTag>("/patients/tags", payload);
  return data;
}

export async function updatePatientTag(
  id: string,
  payload: Record<string, unknown>,
): Promise<PatientTag> {
  const { data } = await api.patch<PatientTag>(`/patients/tags/${id}`, payload);
  return data;
}

export interface PatientTagDeletionResult {
  id: string;
  deleted: boolean;
}

export async function deletePatientTag(id: string): Promise<PatientTagDeletionResult> {
  const { data } = await api.delete<PatientTagDeletionResult>(`/patients/tags/${id}`);
  return data;
}

// -------------------------------------------------------------------------
// Registros de procedimientos clínicos (Fase 4)
// -------------------------------------------------------------------------

export async function getPatientClinicalRecords(patientId: string): Promise<ClinicalProcedureRecord[]> {
  const { data } = await api.get<ClinicalProcedureRecord[]>(`/patients/${patientId}/clinical-records`);
  return data;
}

export interface CreateClinicalRecordPayload {
  templateId: string;
  staffId?: string;
  appointmentId?: string;
  formDataValues: Record<string, unknown>;
  faceMappingData?: FaceMappingData;
  consumedInsumo?: Record<string, unknown>;
  performedAt?: string;
}

export async function createClinicalRecord(
  patientId: string,
  payload: CreateClinicalRecordPayload,
): Promise<ClinicalProcedureRecord> {
  const { data } = await api.post<ClinicalProcedureRecord>(
    `/patients/${patientId}/clinical-records`,
    payload,
  );
  return data;
}

export async function updateClinicalRecord(
  patientId: string,
  recordId: string,
  payload: Record<string, unknown>,
): Promise<ClinicalProcedureRecord> {
  const { data } = await api.patch<ClinicalProcedureRecord>(
    `/patients/${patientId}/clinical-records/${recordId}`,
    payload,
  );
  return data;
}

export async function deleteClinicalRecord(patientId: string, recordId: string): Promise<{ id: string }> {
  const { data } = await api.delete<{ id: string }>(
    `/patients/${patientId}/clinical-records/${recordId}`,
  );
  return data;
}

// -------------------------------------------------------------------------
// Plantillas Clínicas (Form Builder)
// -------------------------------------------------------------------------

export interface ClinicalTemplateFilters {
  search?: string;
  category?: string;
  isActive?: boolean;
}

export async function getClinicalTemplates(
  filters: ClinicalTemplateFilters = {},
): Promise<ClinicalFormTemplate[]> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.category) params.category = filters.category;
  if (filters.isActive !== undefined) params.isActive = String(filters.isActive);

  const { data } = await api.get<ClinicalFormTemplate[]>("/clinical-templates", { params });
  return data;
}

export interface CreateClinicalTemplatePayload {
  name: string;
  description?: string;
  fieldsSchema: ClinicalFormTemplateSchema;
}

export async function createClinicalTemplate(
  payload: CreateClinicalTemplatePayload,
): Promise<ClinicalFormTemplate> {
  const { data } = await api.post<ClinicalFormTemplate>("/clinical-templates", payload);
  return data;
}

export async function updateClinicalTemplate(
  id: string,
  payload: Partial<CreateClinicalTemplatePayload> & { isActive?: boolean },
): Promise<ClinicalFormTemplate> {
  const { data } = await api.patch<ClinicalFormTemplate>(`/clinical-templates/${id}`, payload);
  return data;
}

export async function deleteClinicalTemplate(id: string): Promise<{ id: string }> {
  const { data } = await api.delete<{ id: string }>(`/clinical-templates/${id}`);
  return data;
}

// --- Categorías administrables (Gestionar Categorías) ------------------------

export async function getClinicalTemplateCategories(): Promise<ClinicalTemplateCategoryOption[]> {
  const { data } = await api.get<ClinicalTemplateCategoryOption[]>("/clinical-templates/categories");
  return data;
}

/** The raw catalogue row, as ClinicalTemplateCategoriesService.create/update
 *  return it — distinct from ClinicalTemplateCategoryOption (which adds
 *  `templateCount` and only comes back from the list endpoint). */
export interface ClinicalTemplateCategoryRecord {
  id: string;
  tenantId: string;
  name: string;
  color: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function createClinicalTemplateCategory(payload: {
  name: string;
  color: string;
}): Promise<ClinicalTemplateCategoryRecord> {
  const { data } = await api.post<ClinicalTemplateCategoryRecord>(
    "/clinical-templates/categories",
    payload,
  );
  return data;
}

export async function updateClinicalTemplateCategory(
  id: string,
  payload: { name?: string; color?: string },
): Promise<ClinicalTemplateCategoryRecord> {
  const { data } = await api.patch<ClinicalTemplateCategoryRecord>(
    `/clinical-templates/categories/${id}`,
    payload,
  );
  return data;
}

export interface ClinicalTemplateCategoryDeletionResult {
  id: string;
  deleted: boolean;
  message: string;
}

export async function deleteClinicalTemplateCategory(
  id: string,
): Promise<ClinicalTemplateCategoryDeletionResult> {
  const { data } = await api.delete<ClinicalTemplateCategoryDeletionResult>(
    `/clinical-templates/categories/${id}`,
  );
  return data;
}

// --- Exportación / Importación masiva ----------------------------------------

/** Descarga las plantillas activas como .xlsx — mismo patrón de blob-download
 *  que downloadPatientsTemplate. Solo Excel: un único formato de descarga es
 *  más simple que elegir entre dos (JSON sigue aceptándose al importar). */
export async function exportClinicalTemplates(): Promise<void> {
  const response = await api.get<Blob>("/clinical-templates/export", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantillas-clinicas-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type ImportTemplateRowStatus = "valid" | "duplicate" | "error";

export interface ImportTemplatePreviewRow {
  row: number;
  name: string;
  category: string;
  fieldCount: number;
  status: ImportTemplateRowStatus;
  errors: string[];
}

export interface ImportTemplatesResult {
  successCount: number;
  duplicateCount: number;
  errors: Array<{ row: number; column: string; error: string }>;
  rows: ImportTemplatePreviewRow[];
  totalRows: number;
  imported: number;
  dryRun: boolean;
}

/** `dryRun: true` analiza el archivo (.xlsx/.csv/.json) sin escribir nada —
 *  lo que alimenta la vista previa del modal antes de confirmar. */
export async function bulkImportClinicalTemplates(
  file: File,
  dryRun: boolean,
): Promise<ImportTemplatesResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ImportTemplatesResult>("/clinical-templates/bulk-import", form, {
    params: { dryRun: String(dryRun) },
  });
  return data;
}
