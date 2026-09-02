import { z } from "zod";
import type { ClinicalFormTemplateSchema } from "./clinical-template";

/**
 * Mirrors backend/src/modules/patients/dto/*.dto.ts (Módulo 05).
 *
 * The API re-validates everything — it is reachable directly — so this
 * schema exists to give the form inline errors before a round-trip, not as
 * the security boundary. Keep the two in sync, same rule as
 * validators/staff.ts and validators/service.ts.
 */

// --- Enums de la API ---------------------------------------------------------

export const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Masculino",
  FEMALE: "Femenino",
  OTHER: "Otro",
  PREFER_NOT_TO_SAY: "Prefiere no decir",
};

export const PATIENT_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  BLOCKED: "Bloqueado",
};

export const DOCUMENT_TYPES = ["DNI", "CE", "PASSPORT", "OTHER"] as const;
export type PatientDocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<PatientDocumentType, string> = {
  DNI: "DNI",
  CE: "Carné de Extranjería",
  PASSPORT: "Pasaporte",
  OTHER: "Otro",
};

export const GALLERY_CATEGORIES = ["BEFORE", "AFTER", "PROGRESS"] as const;
export type PatientGalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export const GALLERY_CATEGORY_LABELS: Record<PatientGalleryCategory, string> = {
  BEFORE: "Antes",
  AFTER: "Después",
  PROGRESS: "Progreso",
};

export const CONSENT_STATUSES = ["PENDING", "SIGNED", "REVOKED"] as const;
export type PatientConsentStatus = (typeof CONSENT_STATUSES)[number];

// --- Cumplimiento MINSA NTS N° 139 (Fase 4) ----------------------------------

export const FITZPATRICK_TYPES = [
  "TYPE_I",
  "TYPE_II",
  "TYPE_III",
  "TYPE_IV",
  "TYPE_V",
  "TYPE_VI",
] as const;
export type FitzpatrickSkinType = (typeof FITZPATRICK_TYPES)[number];

/** Etiqueta corta + descripción clínica de cada fototipo — la escala
 *  Fitzpatrick clasifica por color de piel y reacción al sol, no es
 *  autoexplicativa para quien no la usa a diario. */
export const FITZPATRICK_LABELS: Record<FitzpatrickSkinType, string> = {
  TYPE_I: "Tipo I",
  TYPE_II: "Tipo II",
  TYPE_III: "Tipo III",
  TYPE_IV: "Tipo IV",
  TYPE_V: "Tipo V",
  TYPE_VI: "Tipo VI",
};

export const FITZPATRICK_DESCRIPTIONS: Record<FitzpatrickSkinType, string> = {
  TYPE_I: "Piel muy clara. Siempre se quema, nunca broncea.",
  TYPE_II: "Piel clara. Se quema con facilidad, broncea poco.",
  TYPE_III: "Piel clara a mate. Se quema moderadamente, broncea gradual.",
  TYPE_IV: "Piel mate. Se quema poco, broncea con facilidad.",
  TYPE_V: "Piel morena. Rara vez se quema, broncea intensamente.",
  TYPE_VI: "Piel negra. Nunca se quema.",
};

/** `skinType` es texto libre en el backend — este set solo alimenta el
 *  Select del formulario; el usuario puede seguir viendo un valor fuera de
 *  esta lista si vino de otra fuente (ej. importado). */
export const SKIN_TYPE_OPTIONS = ["Grasa", "Mixta", "Seca", "Sensible"] as const;

export interface PatientMedicalHistory {
  id: string;
  patientId: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  bloodType: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  fitzpatrickSkinType: FitzpatrickSkinType | null;
  skinType: string | null;
  isPregnantOrLactating: boolean;
  roaccutaneLast12Months: boolean;
  keloidTendency: boolean;
  activeHerpesBreakout: boolean;
  frequentSunExposure: boolean;
  smokingHabits: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientClinicalNote {
  id: string;
  patientId: string;
  title: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientGalleryImage {
  id: string;
  patientId: string;
  imageUrl: string;
  category: PatientGalleryCategory;
  serviceId: string | null;
  caption: string | null;
  takenAt: string;
  createdAt: string;
}

export interface PatientConsent {
  id: string;
  patientId: string;
  title: string;
  documentUrl: string | null;
  status: PatientConsentStatus;
  signedAt: string | null;
  signatureUrl: string | null;
  createdAt: string;
}

// --- Fichas Dinámicas y Mapeo Facial (Fase 4) --------------------------------
//
// El vocabulario de campos/categoría (FormFieldType, ClinicalTemplateCategory,
// ClinicalFormField, ClinicalFormTemplateSchema) vive en validators/clinical-template.ts
// junto con el Form Builder — reexportado aquí para no romper el resto de este
// archivo, que sigue siendo dueño de los tipos de recurso de la API
// (ClinicalFormTemplate, ClinicalProcedureRecord).

export type {
  ClinicalFormField,
  ClinicalFormTemplateSchema,
  ClinicalTemplateCategory,
  FormFieldType,
} from "./clinical-template";

export interface ClinicalFormTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  fieldsSchema: ClinicalFormTemplateSchema;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Insumo/lote de un procedimiento (marca, lote, vencimiento) — no es una
 *  columna propia tampoco: viaja dentro de `formDataValues._insumo` para no
 *  forzar una migración por un dato que solo aplica a fichas inyectables. */
export interface ClinicalRecordInsumo {
  brand?: string;
  lot?: string;
  expirationDate?: string;
}

/** Un marcador del visor de Mapeo Facial — `xPct`/`yPct` en 0-100 para que el
 *  punto se reposicione junto con el SVG sin importar el tamaño en pantalla. */
export interface FaceMappingMarker {
  id: string;
  pointKey: string;
  label: string;
  units?: number;
  ml?: number;
  note?: string;
  xPct: number;
  yPct: number;
}

export interface FaceMappingData {
  markers: FaceMappingMarker[];
}

export interface ClinicalProcedureRecord {
  id: string;
  patientId: string;
  templateId: string | null;
  template: { id: string; name: string } | null;
  staffId: string | null;
  staff: { id: string; firstName: string; lastName: string } | null;
  /** Cita que originó este registro (Módulo 06 Fase 3, Task 3.2) — null
   *  cuando el registro no vino de la agenda (walk-in, carga histórica). */
  appointmentId: string | null;
  appointment: { id: string; startAt: string } | null;
  formDataValues: Record<string, unknown>;
  faceMappingData: FaceMappingData | null;
  performedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A Patient as the API returns it.
 *
 * `_count` comes back on GET /patients (list); the relation arrays and
 * `medicalHistory` only come back on GET /patients/:id (ficha 360°) — same
 * "one interface, list vs. detail fills in different optional keys"
 * convention as StaffMember (validators/staff.ts).
 */
export interface Patient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentType: PatientDocumentType;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  gender: Gender | null;
  avatarUrl: string | null;
  tags: string[];
  notes: string | null;
  status: PatientStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { clinicalNotes: number; galleryImages: number };
  medicalHistory?: PatientMedicalHistory | null;
  clinicalNotes?: PatientClinicalNote[];
  galleryImages?: PatientGalleryImage[];
  consents?: PatientConsent[];
}

// --- Etiquetas de color (CRM) -------------------------------------------------

/** Same palette CategoryManagerDialog/StaffFormDialog offer as color presets
 *  — a tag chip reads consistently with the rest of the app's use of color. */
const TAG_COLOR_PALETTE = [
  "#E11D48",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#7C3AED",
  "#EC4899",
] as const;

/** Deterministic color per tag text — the same tag always reads the same
 *  color across patients and re-renders, without storing a color anywhere
 *  (tags are free text, not a catalogue). Used as a fallback for tags that
 *  don't (yet) have a PatientTag catalogue entry with the same name. */
export function tagColor(tag: string): string {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) >>> 0;
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}

// --- Catálogo de etiquetas administrable (Gestionar etiquetas) --------------

/** A tag as PatientTagsService returns it. `id: null` marks the synthetic
 *  "Sin etiqueta" row (patients with an empty `tags` array) — it is never a
 *  real PatientTag record, so it can't be edited or deleted. */
export interface PatientTag {
  id: string | null;
  name: string;
  color: string;
  isSystem: boolean;
  patientCount: number;
}

/** Looks up `tag`'s color in the catalogue by name; falls back to the
 *  deterministic hash when the catalogue hasn't loaded yet or the tag has no
 *  matching entry (e.g. imported free text no one has catalogued). */
export function resolveTagColor(tag: string, catalog: PatientTag[]): string {
  const match = catalog.find((entry) => entry.name === tag);
  return match?.color ?? tagColor(tag);
}

export const patientTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la etiqueta es obligatorio.")
    .max(40, "El nombre de la etiqueta no puede superar los 40 caracteres."),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "El color debe ser un hexadecimal de 6 dígitos."),
});

export type PatientTagFormInput = z.infer<typeof patientTagSchema>;

// --- Formulario de alta/edición ----------------------------------------------

/** Solo letras (con acentos), ñ/Ñ y espacios — mismo criterio que
 *  validators/staff.ts's NAME_REGEX, reexportado para que
 *  PatientFormDialog pueda bloquear las mismas teclas en `onKeyDown`. */
export const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;
const PHONE_REGEX = /^\+\d{7,15}$/;

export const patientSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(100, "El nombre no puede superar los 100 caracteres.")
    .regex(NAME_REGEX, "El nombre solo admite letras y espacios."),
  lastName: z
    .string()
    .trim()
    .min(1, "El apellido es obligatorio.")
    .max(100, "El apellido no puede superar los 100 caracteres.")
    .regex(NAME_REGEX, "El apellido solo admite letras y espacios."),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().trim().max(20, "Máximo 20 caracteres.").optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Incluye el código de país (ej. +51987654321).")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("El correo no es válido.").optional().or(z.literal("")),
  /** <input type="date"> hands back "YYYY-MM-DD". */
  birthDate: z.string().optional().or(z.literal("")),
  gender: z.enum(GENDERS).optional().or(z.literal("")),
  avatarUrl: z.string().optional().or(z.literal("")),
  tags: z.array(z.string().trim().max(40, "Cada etiqueta admite máximo 40 caracteres.")).max(20, "Máximo 20 etiquetas."),
  notes: z.string().trim().max(2000, "Las notas no pueden superar los 2000 caracteres.").optional().or(z.literal("")),
  status: z.enum(PATIENT_STATUSES),
});

export type PatientFormInput = z.infer<typeof patientSchema>;

export const EMPTY_PATIENT_FORM: PatientFormInput = {
  firstName: "",
  lastName: "",
  documentType: "DNI",
  documentNumber: "",
  phone: "",
  email: "",
  birthDate: "",
  gender: "",
  avatarUrl: "",
  tags: [],
  notes: "",
  status: "ACTIVE",
};

/** API row -> form values. */
export function toPatientForm(patient: Patient): PatientFormInput {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    documentType: patient.documentType,
    documentNumber: patient.documentNumber ?? "",
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    // La API devuelve un ISO completo (DateTime) — <input type="date"> solo
    // acepta la parte de fecha.
    birthDate: patient.birthDate ? patient.birthDate.slice(0, 10) : "",
    gender: patient.gender ?? "",
    avatarUrl: patient.avatarUrl ?? "",
    tags: patient.tags,
    notes: patient.notes ?? "",
    status: patient.status,
  };
}

/** Form values -> POST/PATCH body. */
export function toPatientPayload(form: PatientFormInput): Record<string, unknown> {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    documentType: form.documentType,
    documentNumber: form.documentNumber?.trim() || undefined,
    phone: form.phone?.trim() || undefined,
    email: form.email?.trim() || undefined,
    birthDate: form.birthDate || undefined,
    gender: form.gender || undefined,
    // `null` explícito (no `undefined`) — mismo criterio que
    // toStaffPayload: así el backend distingue "no viene en el body" (no
    // tocar) de "viene null" (borrar la foto).
    avatarUrl: form.avatarUrl?.trim() || null,
    tags: form.tags,
    notes: form.notes?.trim() || undefined,
    status: form.status,
  };
}

// --- Carga masiva (Excel) -----------------------------------------------------

/** Mirrors backend/src/modules/patients/patients-excel-import.service.ts's
 *  PatientImportError — same shape as Módulo 03/04's ImportError/
 *  StaffImportError. */
export interface PatientImportError {
  row: number;
  column: string;
  error: string;
}

/** Mirrors PatientsService.PatientImportResult — the response of both
 *  POST /patients/import-preview and POST /patients/bulk-import. */
export interface PatientImportResult {
  successCount: number;
  totalRows: number;
  errors: PatientImportError[];
  imported: number;
  dryRun: boolean;
  data: Array<{
    row: number;
    patient: { firstName: string; lastName: string; documentNumber?: string; phone?: string };
    allergies: string[];
  }>;
}

/** "1990-05-12" -> 35 (edad actual). Used by the table/detail views, never
 *  sent to the API. */
export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age;
}
