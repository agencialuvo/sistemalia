import { z } from "zod";

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
export const SERVICE_PAYMENT_METHODS = ["IN_PERSON", "ONLINE", "DEPOSIT"] as const;

export type ServiceStructureType = (typeof SERVICE_STRUCTURE_TYPES)[number];
export type ServiceAvailabilityType = (typeof SERVICE_AVAILABILITY_TYPES)[number];
export type ServicePaymentMethod = (typeof SERVICE_PAYMENT_METHODS)[number];

/** Backend ceilings, duplicated so the form can report them before a 400. */
export const MAX_DURATION_MINUTES = 720;
export const MAX_BUFFER_MINUTES = 240;
export const MAX_PRICE = 999_999.99;
export const MAX_SESSIONS = 100;
export const MAX_GALLERY_IMAGES = 20;
export const MAX_CONTRAINDICATIONS = 30;
export const MAX_CONTRAINDICATION_LENGTH = 60;

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
  sessionCount: number | null;
  frequencyDays: number | null;
  singlePrice: string;
  packagePrice: string | null;
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
  paymentMethod: ServicePaymentMethod;
  depositAmount: string | null;
  depositIsPercentage: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: CategorySummary;
  /** Only included by GET /services/:id. */
  evaluationService?: { id: string; name: string } | null;
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
    categoryId: z.string().uuid("Selecciona una categoría."),
    commercialDescription: z
      .string()
      .trim()
      .min(1, "La descripción comercial es obligatoria.")
      .max(5000, "La descripción no puede superar los 5000 caracteres."),
    mainImageUrl: z.string().optional().or(z.literal("")),
    testimonioGallery: z
      .array(z.string())
      .max(MAX_GALLERY_IMAGES, `La galería admite hasta ${MAX_GALLERY_IMAGES} imágenes.`)
      .optional(),

    // Tab 2
    structureType: z.enum(SERVICE_STRUCTURE_TYPES),
    sessionCount: optionalIntField("El número de sesiones", 2, MAX_SESSIONS),
    frequencyDays: optionalIntField("Los días entre sesiones", 0, 365),
    singlePrice: moneyField("El precio unitario"),
    packagePrice: optionalMoneyField("El precio del paquete"),

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
    paymentMethod: z.enum(SERVICE_PAYMENT_METHODS),
    depositAmount: optionalMoneyField("El anticipo"),
    depositIsPercentage: z.boolean(),

    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.structureType === "SESSIONS") {
      if (isBlank(data.sessionCount)) {
        ctx.addIssue({
          code: "custom",
          path: ["sessionCount"],
          message: "Un paquete debe indicar cuántas sesiones incluye.",
        });
      }
      if (isBlank(data.packagePrice)) {
        ctx.addIssue({
          code: "custom",
          path: ["packagePrice"],
          message: "Un paquete debe indicar su precio total.",
        });
      }
    }

    if (data.requiresEvaluation && isBlank(data.evaluationServiceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["evaluationServiceId"],
        message: "Selecciona el servicio de valoración asociado.",
      });
    }

    if (data.paymentMethod === "DEPOSIT") {
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
  });

export type ServiceFormInput = z.infer<typeof serviceSchema>;

/** Blank form: the defaults mirror the Prisma column defaults so a service
 *  created without touching tabs 3-5 lands in the same state either way. */
export const EMPTY_SERVICE_FORM: ServiceFormInput = {
  name: "",
  categoryId: "",
  commercialDescription: "",
  mainImageUrl: "",
  testimonioGallery: [],
  structureType: "SINGLE",
  sessionCount: "",
  frequencyDays: "",
  singlePrice: "",
  packagePrice: "",
  requiresEvaluation: false,
  evaluationServiceId: "",
  evaluationCost: "",
  isEvaluationDeductible: false,
  deductibleExpirationDays: "",
  durationMinutes: "60",
  bufferMinutes: "0",
  contraindications: [],
  prePostCare: "",
  paymentMethod: "IN_PERSON",
  depositAmount: "",
  depositIsPercentage: false,
  isActive: true,
};

/** API row -> form values. Money stays a string throughout, so "1200.00"
 *  round-trips through an edit untouched. */
export function toServiceForm(service: Service): ServiceFormInput {
  return {
    name: service.name,
    categoryId: service.categoryId,
    commercialDescription: service.commercialDescription,
    mainImageUrl: service.mainImageUrl ?? "",
    testimonioGallery: service.testimonioGallery ?? [],
    structureType: service.structureType,
    sessionCount: service.sessionCount?.toString() ?? "",
    frequencyDays: service.frequencyDays?.toString() ?? "",
    singlePrice: service.singlePrice,
    packagePrice: service.packagePrice ?? "",
    requiresEvaluation: service.requiresEvaluation,
    evaluationServiceId: service.evaluationServiceId ?? "",
    evaluationCost: service.evaluationCost ?? "",
    isEvaluationDeductible: service.isEvaluationDeductible,
    deductibleExpirationDays: service.deductibleExpirationDays?.toString() ?? "",
    durationMinutes: service.durationMinutes.toString(),
    bufferMinutes: service.bufferMinutes.toString(),
    contraindications: service.contraindications ?? [],
    prePostCare: service.prePostCare ?? "",
    paymentMethod: service.paymentMethod,
    depositAmount: service.depositAmount ?? "",
    depositIsPercentage: service.depositIsPercentage,
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
 */
export function toServicePayload(form: ServiceFormInput): Record<string, unknown> {
  const isPackage = form.structureType === "SESSIONS";
  const isDeposit = form.paymentMethod === "DEPOSIT";

  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    commercialDescription: form.commercialDescription.trim(),
    mainImageUrl: toText(form.mainImageUrl),
    testimonioGallery: form.testimonioGallery ?? [],

    structureType: form.structureType,
    sessionCount: isPackage ? toNumber(form.sessionCount) : undefined,
    frequencyDays: isPackage ? toNumber(form.frequencyDays) : undefined,
    singlePrice: toNumber(form.singlePrice),
    packagePrice: isPackage ? toNumber(form.packagePrice) : undefined,

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

    paymentMethod: form.paymentMethod,
    depositAmount: isDeposit ? toNumber(form.depositAmount) : undefined,
    depositIsPercentage: isDeposit ? form.depositIsPercentage : false,

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
