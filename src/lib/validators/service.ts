import { z } from "zod";

import { COMMISSION_TYPES, type CommissionType } from "./staff";

/**
 * Mirrors backend/src/modules/services/dto/*.dto.ts (Módulo 03).
 *
 * The API re-validates everything — it is reachable directly — so these
 * schemas exist to give the form inline errors before a round-trip, not as the
 * security boundary. Keep the two in sync: a rule stricter here only blocks a
 * legitimate user, and one that is looser produces a 400 the form has no field
 * to attach the message to.
 */

// --- Enums (must match the Prisma enums exactly) ---------------------------

export const SERVICE_STRUCTURE_TYPES = ["SINGLE", "SESSIONS"] as const;
export const SERVICE_AVAILABILITY_TYPES = ["GENERAL", "CUSTOM"] as const;
export const SERVICE_PAYMENT_METHODS = ["IN_PERSON", "ONLINE", "DEPOSIT", "FULL_PAYMENT"] as const;

export type ServiceStructureType = (typeof SERVICE_STRUCTURE_TYPES)[number];
export type ServiceAvailabilityType = (typeof SERVICE_AVAILABILITY_TYPES)[number];
export type ServicePaymentMethod = (typeof SERVICE_PAYMENT_METHODS)[number];

/** Backend ceilings, duplicated so the form can report them before a 400. */
export const MAX_DURATION_MINUTES = 720;
export const MAX_BUFFER_MINUTES = 240;
export const MAX_PRICE = 999_999.99;
export const MAX_SESSIONS = 100;
export const MAX_GALLERY_IMAGES = 10;
export const MAX_CONTRAINDICATIONS = 30;
export const MAX_CONTRAINDICATION_LENGTH = 60;

/** Client-side upload ceilings for ImagePicker (Tab Identificación/Galería) —
 *  intentionally tighter than the media library's own backend limits
 *  (15MB image / 200MB video, media.service.ts): a service's imagen
 *  principal or testimonio doesn't need studio-quality masters, and a
 *  smaller cap keeps the catalogue's page weight sane. */
export const MAX_IMAGE_UPLOAD_MB = 5;
export const MAX_GALLERY_VIDEO_UPLOAD_MB = 50;

/** Offered as chips in Tab 4. Free text is still allowed — this is a shortcut,
 *  not a closed list, because the clinical vocabulary varies per centre. */
export const COMMON_CONTRAINDICATIONS = [
  "EMBARAZO",
  "LACTANCIA",
  "MARCAPASOS",
  "CÁNCER ACTIVO",
  "EPILEPSIA",
  "DIABETES NO CONTROLADA",
  "ANTICOAGULANTES",
  "ISOTRETINOÍNA",
  "IMPLANTES METÁLICOS",
  "PIEL BRONCEADA",
  "HERPES ACTIVO",
  "ROSÁCEA ACTIVA",
  "HIPERTENSIÓN",
  "QUELOIDES",
] as const;

// --- Tipos de la API -------------------------------------------------------

/** Mirrors CategoriesService.DEFAULT_CATEGORY_NAME on the backend — the
 *  fallback every service without a real category (or whose category was
 *  deleted) lands in. The API refuses to delete it; the UI hides that action
 *  instead of letting the user hit the 409. */
export const DEFAULT_CATEGORY_NAME = "Sin categoría";

export interface CategorySummary {
  id: string;
  name: string;
  color: string | null;
}

export interface ServiceCategory extends CategorySummary {
  tenantId: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on GET /services/categories; drives the deactivate warning. */
  _count?: { services: number };
}

/**
 * One paquete de sesiones ofrecido por un servicio SESSIONS — un mismo
 * tratamiento puede vender varios a la vez (ej. "3 sesiones" y "6 sesiones"),
 * de ahí la lista en vez de un sessionCount/packagePrice único en Service.
 */
export interface ServicePackage {
  id: string;
  serviceId: string;
  sessionCount: number;
  frequencyDays: number | null;
  /** String de 2 decimales, misma convención que el resto del dinero. */
  price: string;
  createdAt: string;
}

/**
 * A Service as the API returns it.
 *
 * Every money field is a STRING with exactly two decimals ("1200.00"), not a
 * number. The backend serialises Prisma's Decimal that way on purpose: a
 * JavaScript number is a binary double, so a price that is exact in the
 * database can come back as 199.89999999999998 after arithmetic here. Keep
 * these as strings, format them with formatSoles(), and only call Number() at
 * the moment a real calculation needs it.
 */
export interface Service {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  commercialDescription: string;
  mainImageUrl: string | null;
  testimonioGallery: string[];
  structureType: ServiceStructureType;
  singlePrice: string;
  /** Only populated (and only meaningful) when structureType === SESSIONS. */
  packages: ServicePackage[];
  requiresEvaluation: boolean;
  evaluationServiceId: string | null;
  evaluationCost: string | null;
  isEvaluationDeductible: boolean;
  deductibleExpirationDays: number | null;
  availabilityType: ServiceAvailabilityType;
  customSchedule: unknown;
  durationMinutes: number;
  bufferMinutes: number;
  contraindications: string[];
  prePostCare: string | null;
  /** Un mismo servicio puede aceptar varias formas de cobro a la vez (ej. "en
   *  caja" y "anticipo"), de ahí la lista en vez de un valor único. */
  paymentMethods: ServicePaymentMethod[];
  depositAmount: string | null;
  depositIsPercentage: boolean;
  /** Nivel 2 (base) del Esquema de Comisiones Jerárquico — comisión que
   *  aplica a cualquier profesional que ofrezca este servicio, salvo un
   *  override más específico (StaffService.customCommission*) o, en su
   *  ausencia, la caída a StaffMember.defaultCommission* (ver
   *  resolveCommission). Null = sin comisión base configurada. */
  baseCommissionType: CommissionType | null;
  baseCommissionValue: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: CategorySummary;
  /** Only included by GET /services/:id. */
  evaluationService?: { id: string; name: string } | null;
  /** Profesionales habilitados para este servicio (Engine de Disponibilidad,
   *  Tab "Personal Asignado") — solo ids, sincronizados vía el endpoint de
   *  matriz masiva (lib/staff/api.ts's bulkSyncServiceMatrix), no vía este
   *  payload de servicio. */
  assignedStaffIds: string[];
}

export interface ImportError {
  row: number;
  column: string;
  error: string;
}

export interface ImportResult {
  successCount: number;
  totalRows: number;
  errors: ImportError[];
  newCategoryNames: string[];
  imported: number;
  createdCategories: string[];
  dryRun: boolean;
  data: Array<{ row: number; categoryName: string; service: { name: string } }>;
}

// --- Formato de dinero -----------------------------------------------------

/**
 * "1200.00" -> "S/ 1,200.00".
 *
 * Formats by manipulating the STRING, never by parsing it into a number:
 * Intl.NumberFormat would take a double and reintroduce exactly the rounding
 * error the string representation exists to avoid.
 */
export function formatSoles(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  const negative = value.startsWith("-");
  const [rawInt = "0", rawDecimals = ""] = value.replace("-", "").split(".");
  const grouped = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = rawDecimals.padEnd(2, "0").slice(0, 2);

  return `${negative ? "-" : ""}S/ ${grouped}.${decimals}`;
}

/** "45 min (+ 10 min limpieza)" — the buffer only shows when there is one. */
export function formatDuration(durationMinutes: number, bufferMinutes: number): string {
  const base = `${durationMinutes} min`;
  return bufferMinutes > 0 ? `${base} (+ ${bufferMinutes} min limpieza)` : base;
}

// --- Categorías ------------------------------------------------------------

/** Strict #RRGGBB, matching the backend: the column is VarChar(7), so the
 *  8-digit form some pickers emit would pass a loose check and fail on save. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la categoría es obligatorio.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
  description: z.string().trim().max(255, "Máximo 255 caracteres.").optional(),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR, "El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
});

export type CategoryFormInput = z.infer<typeof categorySchema>;

// --- Servicios -------------------------------------------------------------

/**
 * Money lives in the form as a STRING for the same reason it does on the wire:
 * binding a number input to a float turns "199.90" into "199.9" the moment the
 * form is rehydrated for editing, and the user watches their price lose a
 * digit. Converted with Number() once, in toServicePayload().
 */
const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, `${label} debe ser un número con máximo 2 decimales.`)
    .refine((value) => Number(value.replace(",", ".")) <= MAX_PRICE, {
      message: `${label} supera el máximo permitido.`,
    });

const optionalMoneyField = (label: string) =>
  moneyField(label).optional().or(z.literal(""));

/**
 * Strips every keystroke that isn't a digit or the first decimal separator —
 * used as the price inputs' onChange so the field can never hold letters or a
 * second ".", instead of only catching it at submit time via moneyField's
 * regex. Accepts "." and "," (Peruvian spreadsheets/keyboards use both) but
 * keeps just one of whichever comes first.
 */
export function sanitizeMoneyInput(raw: string): string {
  let sawSeparator = false;
  let result = "";
  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      result += char;
    } else if ((char === "." || char === ",") && !sawSeparator) {
      sawSeparator = true;
      result += char;
    }
  }
  return result;
}

/** Same idea for whole-number fields (sesiones, días) — digits only. */
export function sanitizeIntInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

const intField = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} debe ser un número entero.`)
    .refine((value) => Number(value) >= min && Number(value) <= max, {
      message: `${label} debe estar entre ${min} y ${max}.`,
    });

const optionalIntField = (label: string, min: number, max: number) =>
  intField(label, min, max).optional().or(z.literal(""));

const isBlank = (value: string | undefined) => value === undefined || value.trim() === "";

/** One paquete de sesiones as the form edits it (spec ampliación: un mismo
 *  servicio puede vender varios paquetes a la vez). Money and counts stay
 *  strings for the same reason every other numeric form field does — see
 *  moneyField's doc comment. */
export const packageFieldSchema = z.object({
  sessionCount: intField("El número de sesiones", 2, MAX_SESSIONS),
  frequencyDays: optionalIntField("Los días entre sesiones", 0, 365),
  price: moneyField("El precio del paquete"),
});

export type ServicePackageFormInput = z.infer<typeof packageFieldSchema>;

export const EMPTY_SERVICE_PACKAGE: ServicePackageFormInput = {
  sessionCount: "",
  frequencyDays: "",
  price: "",
};

/**
 * Full service form. The conditional rules are expressed with superRefine
 * rather than a discriminated union so the error lands on the FIELD the user
 * has to fix — a union would report "no matching variant" against the whole
 * object, which no input can display.
 */
export const serviceSchema = z
  .object({
    // Tab 1
    name: z
      .string()
      .trim()
      .min(1, "El nombre del servicio es obligatorio.")
      .max(150, "El nombre no puede superar los 150 caracteres."),
    // Absent when `newCategory` is true — an existing categoryId and a
    // fresh one being created on the fly are mutually exclusive, enforced
    // below in superRefine (Módulo 03 mejora: crear categoría on-the-fly).
    categoryId: z.string().optional().or(z.literal("")),
    newCategory: z.boolean(),
    newCategoryName: z
      .string()
      .trim()
      .max(80, "El nombre no puede superar los 80 caracteres.")
      .optional(),
    newCategoryColor: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "El color debe ser un hexadecimal de 6 dígitos.")
      .optional()
      .or(z.literal("")),
    commercialDescription: z
      .string()
      .trim()
      .max(5000, "La descripción no puede superar los 5000 caracteres.")
      .optional()
      .or(z.literal("")),
    mainImageUrl: z.string().optional().or(z.literal("")),
    testimonioGallery: z
      .array(z.string())
      .max(MAX_GALLERY_IMAGES, `La galería admite hasta ${MAX_GALLERY_IMAGES} imágenes.`)
      .optional(),

    // Tab 2
    structureType: z.enum(SERVICE_STRUCTURE_TYPES),
    singlePrice: moneyField("El precio unitario"),
    /** Uno o más paquetes cuando structureType = SESSIONS; ignorado en SINGLE. */
    packages: z.array(packageFieldSchema),

    // Tab 3
    requiresEvaluation: z.boolean(),
    evaluationServiceId: z.string().optional().or(z.literal("")),
    evaluationCost: optionalMoneyField("El costo de valoración"),
    isEvaluationDeductible: z.boolean(),
    deductibleExpirationDays: optionalIntField("La vigencia del descuento", 1, 3650),

    // Tab 4
    durationMinutes: intField("La duración", 1, MAX_DURATION_MINUTES),
    bufferMinutes: optionalIntField("El tiempo de limpieza", 0, MAX_BUFFER_MINUTES),
    contraindications: z
      .array(z.string().max(MAX_CONTRAINDICATION_LENGTH))
      .max(MAX_CONTRAINDICATIONS, `Máximo ${MAX_CONTRAINDICATIONS} contraindicaciones.`)
      .optional(),
    prePostCare: z.string().trim().max(5000, "Máximo 5000 caracteres.").optional(),

    // Tab 5
    /** Selección múltiple (spec ampliación §5): un servicio puede aceptar
     *  varias formas de cobro a la vez, no solo una. */
    paymentMethods: z
      .array(z.enum(SERVICE_PAYMENT_METHODS))
      .min(1, "Selecciona al menos un método de pago."),
    depositAmount: optionalMoneyField("El anticipo"),
    depositIsPercentage: z.boolean(),

    /** Nivel 2 (base) del Esquema de Comisiones Jerárquico — "Comisión Base
     *  del Servicio". Ambos vacíos = sin comisión base configurada. */
    baseCommissionType: z.enum(COMMISSION_TYPES).optional().or(z.literal("")),
    baseCommissionValue: optionalMoneyField("La comisión base"),

    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.newCategory) {
      if (isBlank(data.newCategoryName)) {
        ctx.addIssue({
          code: "custom",
          path: ["newCategoryName"],
          message: "El nombre de la nueva categoría es obligatorio.",
        });
      }
    } else if (isBlank(data.categoryId)) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Selecciona una categoría.",
      });
    }

    if (data.structureType === "SESSIONS" && data.packages.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["packages"],
        message: "Agrega al menos un paquete de sesiones.",
      });
    }

    if (data.requiresEvaluation && isBlank(data.evaluationServiceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["evaluationServiceId"],
        message: "Selecciona el servicio de valoración asociado.",
      });
    }

    if (data.paymentMethods.includes("DEPOSIT")) {
      if (isBlank(data.depositAmount)) {
        ctx.addIssue({
          code: "custom",
          path: ["depositAmount"],
          message: "Indica el anticipo a cobrar.",
        });
      } else if (data.depositIsPercentage) {
        const percentage = Number(String(data.depositAmount).replace(",", "."));
        if (percentage <= 0 || percentage > 100) {
          ctx.addIssue({
            code: "custom",
            path: ["depositAmount"],
            message: "El anticipo en porcentaje debe estar entre 1 y 100.",
          });
        }
      }
    }

    if (data.baseCommissionType && isBlank(data.baseCommissionValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["baseCommissionValue"],
        message: "Indica el valor de la comisión base.",
      });
    }
    if (!data.baseCommissionType && !isBlank(data.baseCommissionValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["baseCommissionType"],
        message: "Selecciona el tipo de comisión.",
      });
    }
    if (data.baseCommissionType === "PERCENTAGE" && !isBlank(data.baseCommissionValue)) {
      const percentage = Number(String(data.baseCommissionValue).replace(",", "."));
      if (percentage > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["baseCommissionValue"],
          message: "Una comisión porcentual no puede superar 100%.",
        });
      }
    }
  });

export type ServiceFormInput = z.infer<typeof serviceSchema>;

/** Blank form: the defaults mirror the Prisma column defaults so a service
 *  created without touching tabs 3-5 lands in the same state either way. */
export const EMPTY_SERVICE_FORM: ServiceFormInput = {
  name: "",
  categoryId: "",
  newCategory: false,
  newCategoryName: "",
  newCategoryColor: "",
  commercialDescription: "",
  mainImageUrl: "",
  testimonioGallery: [],
  structureType: "SINGLE",
  singlePrice: "",
  packages: [],
  requiresEvaluation: false,
  evaluationServiceId: "",
  evaluationCost: "",
  isEvaluationDeductible: false,
  deductibleExpirationDays: "",
  durationMinutes: "60",
  bufferMinutes: "0",
  contraindications: [],
  prePostCare: "",
  paymentMethods: ["IN_PERSON"],
  depositAmount: "",
  depositIsPercentage: false,
  baseCommissionType: "",
  baseCommissionValue: "",
  isActive: true,
};

/** API row -> form values. Money stays a string throughout, so "1200.00"
 *  round-trips through an edit untouched. */
export function toServiceForm(service: Service): ServiceFormInput {
  return {
    name: service.name,
    categoryId: service.categoryId,
    newCategory: false,
    newCategoryName: "",
    newCategoryColor: "",
    commercialDescription: service.commercialDescription,
    mainImageUrl: service.mainImageUrl ?? "",
    testimonioGallery: service.testimonioGallery ?? [],
    structureType: service.structureType,
    singlePrice: service.singlePrice,
    packages: (service.packages ?? []).map((pkg) => ({
      sessionCount: pkg.sessionCount.toString(),
      frequencyDays: pkg.frequencyDays?.toString() ?? "",
      price: pkg.price,
    })),
    requiresEvaluation: service.requiresEvaluation,
    evaluationServiceId: service.evaluationServiceId ?? "",
    evaluationCost: service.evaluationCost ?? "",
    isEvaluationDeductible: service.isEvaluationDeductible,
    deductibleExpirationDays: service.deductibleExpirationDays?.toString() ?? "",
    durationMinutes: service.durationMinutes.toString(),
    bufferMinutes: service.bufferMinutes.toString(),
    contraindications: service.contraindications ?? [],
    prePostCare: service.prePostCare ?? "",
    paymentMethods: service.paymentMethods.length > 0 ? service.paymentMethods : ["IN_PERSON"],
    depositAmount: service.depositAmount ?? "",
    depositIsPercentage: service.depositIsPercentage,
    baseCommissionType: service.baseCommissionType ?? "",
    baseCommissionValue: service.baseCommissionValue ?? "",
    isActive: service.isActive,
  };
}

const toNumber = (value: string | undefined): number | undefined =>
  isBlank(value) ? undefined : Number(String(value).replace(",", "."));

const toText = (value: string | undefined): string | undefined =>
  isBlank(value) ? undefined : value!.trim();

/**
 * Form values -> POST/PATCH body.
 *
 * Fields the chosen mode does not use are omitted rather than sent as empty
 * strings: the API runs with `forbidNonWhitelisted`, and an empty string in a
 * numeric field is a 400. The server nulls out the irrelevant columns itself,
 * so omitting is both correct and less to send.
 *
 * `categoryId` must already be resolved to a real id by the caller — when
 * `newCategory` is true, ServiceFormDialog creates the category first and
 * passes its id in here via `{ ...form, categoryId: created.id }`. This
 * function never talks to the API itself, so it cannot do that step.
 */
export function toServicePayload(form: ServiceFormInput): Record<string, unknown> {
  const isPackage = form.structureType === "SESSIONS";
  const isDeposit = form.paymentMethods.includes("DEPOSIT");

  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    commercialDescription: toText(form.commercialDescription) ?? "",
    mainImageUrl: toText(form.mainImageUrl),
    testimonioGallery: form.testimonioGallery ?? [],

    structureType: form.structureType,
    singlePrice: toNumber(form.singlePrice),
    // Sent as the complete list on every write — the backend replaces the
    // whole set rather than diffing (see ServicesService.update's doc
    // comment), so omitting a package here would delete it there.
    packages: isPackage
      ? form.packages.map((pkg) => ({
          sessionCount: toNumber(pkg.sessionCount),
          frequencyDays: toNumber(pkg.frequencyDays),
          price: toNumber(pkg.price),
        }))
      : undefined,

    requiresEvaluation: form.requiresEvaluation,
    evaluationServiceId: form.requiresEvaluation ? toText(form.evaluationServiceId) : undefined,
    evaluationCost: form.requiresEvaluation ? toNumber(form.evaluationCost) : undefined,
    isEvaluationDeductible: form.requiresEvaluation ? form.isEvaluationDeductible : false,
    deductibleExpirationDays:
      form.requiresEvaluation && form.isEvaluationDeductible
        ? toNumber(form.deductibleExpirationDays)
        : undefined,

    durationMinutes: toNumber(form.durationMinutes),
    bufferMinutes: toNumber(form.bufferMinutes) ?? 0,
    contraindications: form.contraindications ?? [],
    prePostCare: toText(form.prePostCare),

    paymentMethods: form.paymentMethods,
    depositAmount: isDeposit ? toNumber(form.depositAmount) : undefined,
    depositIsPercentage: isDeposit ? form.depositIsPercentage : false,

    baseCommissionType: form.baseCommissionType || undefined,
    baseCommissionValue: toNumber(form.baseCommissionValue),

    isActive: form.isActive,
  };
}

/**
 * An imported service that says "requires a valoración" but has nothing linked.
 *
 * The bulk template cannot express `evaluationServiceId` — it is a reference to
 * another service by id, which nobody can type into a cell — so the backend
 * lets those rows through and the link is made here. Without a visible flag
 * they would sit in the catalogue looking complete while the agenda has no
 * consult to book before the treatment.
 */
export function needsEvaluationLink(service: Service): boolean {
  return service.requiresEvaluation && !service.evaluationServiceId;
}
