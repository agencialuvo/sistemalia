import { z } from "zod";

/**
 * Mirrors backend/src/modules/patients/clinical-records/dto/clinical-form-field.dto.ts
 * (Módulo 05, Fase 4 — Form Builder de Plantillas Clínicas).
 *
 * These are the building blocks of `ClinicalFormTemplate.fieldsSchema` — the
 * JSON structure a tenant designs for its own fichas (ej. "Ficha de Toxina
 * Botulínica"). `ClinicalFormTemplate`/`ClinicalProcedureRecord` themselves
 * stay in validators/patient.ts (the API resource types established in
 * Fase 4); this file only owns the field/category vocabulary and the Zod
 * schema the Form Builder dialog validates against.
 */

// --- Tipo de campo -----------------------------------------------------------

export const FORM_FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "CHECKBOX", "TEXTAREA"] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  TEXT: "Texto corto",
  NUMBER: "Número",
  SELECT: "Lista desplegable",
  CHECKBOX: "Casilla (Sí/No)",
  TEXTAREA: "Texto largo",
};

// --- Categoría de plantilla ---------------------------------------------------
//
// Antes un enum cerrado de 7 valores; ahora un catálogo administrable por
// tenant (ClinicalTemplateCategoriesService en el backend, "Gestionar
// Categorías" en el frontend) — `fieldsSchema.category` guarda el NOMBRE de
// la categoría (texto libre), no un código. Las mismas 7 siguen existiendo
// como filas `isSystem: true` sembradas automáticamente para cada tenant, con
// estos mismos nombres/colores, para que la migración sea invisible.

export type ClinicalTemplateCategory = string;

/** El nombre de la categoría INJECTABLE de antes — el Form Builder la usa
 *  para decidir el valor inicial del switch de Mapeo Facial al crear una
 *  plantilla nueva (ver ClinicalTemplateFormDialog.selectCategory). */
export const INJECTABLE_CATEGORY_NAME = "Inyectables";

/** Fallback al que se reasignan las plantillas cuando se borra la categoría
 *  personalizada que usaban — mismo nombre que
 *  ClinicalTemplateCategoriesService.FALLBACK_CATEGORY_NAME en el backend. */
export const FALLBACK_CATEGORY_NAME = "General / Otro";

const CATEGORY_COLOR_PALETTE = [
  "#E11D48",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#7C3AED",
  "#EC4899",
] as const;

/** Deterministic color per category name — used while the catalogue hasn't
 *  loaded yet, same "hash instead of storing a color" fallback as tagColor
 *  in validators/patient.ts. */
export function categoryColorHash(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

/** A category as ClinicalTemplateCategoriesService returns it. */
export interface ClinicalTemplateCategoryOption {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  templateCount: number;
}

/** Looks up `name`'s color in the fetched catalogue; falls back to the
 *  deterministic hash when the catalogue hasn't loaded yet or the template
 *  named a category with no matching entry. */
export function resolveCategoryColor(
  name: string,
  categories: ClinicalTemplateCategoryOption[],
): string {
  const match = categories.find((category) => category.name === name);
  return match?.color ?? categoryColorHash(name);
}

// --- Estructura de un campo del formulario dinámico --------------------------

export interface ClinicalFormField {
  id: string;
  label: string;
  type: FormFieldType;
  /** Solo aplica cuando type === "SELECT". */
  options?: string[];
  required: boolean;
}

/** La forma que `ClinicalFormTemplate.fieldsSchema` guarda como JSON —
 *  categoría + lista de campos, nada de esto vive en columnas propias.
 *  `hasFaceMapping` desacopla el visor de Mapeo Facial de la categoría: el
 *  builder lo prende por defecto al elegir "Inyectables", pero el usuario
 *  puede apagarlo o encenderlo para cualquier categoría (ej. una ficha
 *  Corporal que también aplica toxina en zonas puntuales). */
export interface ClinicalFormTemplateSchema {
  category: ClinicalTemplateCategory;
  hasFaceMapping: boolean;
  fields: ClinicalFormField[];
}

// --- Validación del Form Builder ----------------------------------------------

export const clinicalFormFieldSchema = z
  .object({
    id: z.string().min(1),
    label: z
      .string()
      .trim()
      .min(1, "La etiqueta del campo es obligatoria.")
      .max(150, "La etiqueta no puede superar los 150 caracteres."),
    type: z.enum(FORM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1)).optional(),
    required: z.boolean(),
  })
  .refine((field) => field.type !== "SELECT" || (field.options && field.options.length > 0), {
    message: "Agrega al menos una opción separada por comas.",
    path: ["options"],
  });

export const clinicalFormTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la plantilla es obligatorio.")
    .max(150, "El nombre no puede superar los 150 caracteres."),
  category: z
    .string()
    .trim()
    .min(1, "La categoría de la plantilla es obligatoria.")
    .max(60, "La categoría no puede superar los 60 caracteres."),
  hasFaceMapping: z.boolean().default(false),
  fields: z.array(clinicalFormFieldSchema).min(1, "Agrega al menos un campo a la plantilla."),
});

export type ClinicalFormTemplateFormInput = z.infer<typeof clinicalFormTemplateSchema>;

/** Nuevo campo en blanco para el Form Builder — `id` estable por campo (no
 *  por índice de arreglo) para que reordenar no invalide el `key` de React
 *  ni las referencias que el usuario ya llenó. */
export function createEmptyClinicalFormField(): ClinicalFormField {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "TEXT",
    required: false,
  };
}
