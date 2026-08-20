import { z } from "zod";

// Mirrors backend/src/modules/tenant/dto/create-tenant.dto.ts. The API
// re-validates everything (it is reachable directly), so these schemas exist to
// give the wizard inline errors before a round-trip — not as the security
// boundary. Keep the two in sync: a rule stricter here than on the server just
// blocks a legitimate user, and one that is looser produces a 400 the form has
// no field to attach the message to.

// --- Enums (must match the Prisma enums exactly) ---------------------------

export const TENANT_IDENTITY_TYPES = ["EMPRESA", "MARCA_PERSONAL"] as const;
export const TAX_ID_TYPES = ["RUC10", "RUC20"] as const;
export const SPECIALTY_CATEGORIES = [
  "MEDICINA_ESTETICA",
  "COSMETOLOGIA_SPA",
  "CEJAS_PESTANAS",
  "SALON_BELLEZA",
  "DERMATOLOGIA",
] as const;

export type TenantIdentityType = (typeof TENANT_IDENTITY_TYPES)[number];
export type TaxIdType = (typeof TAX_ID_TYPES)[number];
export type SpecialtyCategory = (typeof SPECIALTY_CATEGORIES)[number];

/** Appointment slot lengths offered by the wizard (spec Paso 2.3). */
export const APPOINTMENT_DURATIONS = [30, 45, 60, 90] as const;

// --- RUC (Modulo 11) -------------------------------------------------------

/** Prefixes SUNAT actually issues. */
const VALID_RUC_PREFIXES = ["10", "15", "16", "17", "20"];
const MODULO_11_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Same algorithm as backend/src/modules/sunat/validators/ruc.util.ts.
 * Duplicated rather than shared because the two halves of this repo have no
 * common package — if one changes, change both.
 */
export function isValidRuc(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  if (!VALID_RUC_PREFIXES.includes(value.slice(0, 2))) return false;

  const sum = MODULO_11_WEIGHTS.reduce(
    (acc, weight, index) => acc + weight * Number(value[index]),
    0,
  );
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return checkDigit === Number(value[10]);
}

const rucSchema = z
  .string()
  .regex(/^\d{11}$/, "El RUC debe tener exactamente 11 dígitos.")
  .refine(isValidRuc, "El número de RUC no es válido (dígito verificador incorrecto).");

// --- Paso 1: identidad y perfil fiscal -------------------------------------

export const step1Schema = z.object({
  identityType: z.enum(TENANT_IDENTITY_TYPES, {
    message: "Selecciona el tipo de identidad del negocio.",
  }),
  taxIdType: z.enum(TAX_ID_TYPES, {
    message: "Selecciona el tipo de contribuyente.",
  }),
  taxId: rucSchema,
  legalName: z.string().trim().min(1, "La razón social es obligatoria.").max(255),
  // Optional: SUNAT may be down and the user continues manually.
  fiscalAddress: z.string().trim().max(255).optional(),
  commercialName: z
    .string()
    .trim()
    .min(2, "El nombre comercial debe tener al menos 2 caracteres.")
    .max(120),
});
export type Step1Input = z.infer<typeof step1Schema>;

// --- Paso 2: sede principal y horarios -------------------------------------

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeSchema = z.string().regex(HH_MM, "Usa el formato HH:mm (ej. 09:00).");

export const workingHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    openTime: timeSchema,
    closeTime: timeSchema,
    breakStart: timeSchema.optional(),
    breakEnd: timeSchema.optional(),
  })
  // Cross-field rules only make sense on a day that is actually open, and only
  // once both ends of a range are present — hence superRefine over per-field
  // refinements. "HH:mm" is zero-padded, so string comparison is chronological.
  .superRefine((hour, ctx) => {
    if (!hour.isOpen) return;

    if (hour.openTime >= hour.closeTime) {
      ctx.addIssue({
        code: "custom",
        path: ["closeTime"],
        message: "El cierre debe ser posterior a la apertura.",
      });
    }

    const hasStart = Boolean(hour.breakStart);
    const hasEnd = Boolean(hour.breakEnd);

    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: "custom",
        path: [hasStart ? "breakEnd" : "breakStart"],
        message: "La pausa requiere hora de inicio y de fin.",
      });
      return;
    }

    if (hour.breakStart && hour.breakEnd) {
      if (hour.breakStart >= hour.breakEnd) {
        ctx.addIssue({
          code: "custom",
          path: ["breakEnd"],
          message: "El fin de la pausa debe ser posterior a su inicio.",
        });
      } else if (hour.breakStart < hour.openTime || hour.breakEnd > hour.closeTime) {
        ctx.addIssue({
          code: "custom",
          path: ["breakStart"],
          message: "La pausa debe estar dentro del horario de atención.",
        });
      }
    }
  });
export type WorkingHourInput = z.infer<typeof workingHourSchema>;

export const step2Schema = z.object({
  name: z.string().trim().min(1, "El nombre de la sede es obligatorio.").max(120),
  address: z.string().trim().min(1, "La dirección es obligatoria.").max(255),
  ubigeoCode: z.string().regex(/^\d{6}$/, "Selecciona el distrito de la sede."),
  whatsappNumber: z
    .string()
    .regex(/^\+\d{7,15}$/, "Incluye el código de país (ej. +51987654321)."),
  defaultAppointmentMinutes: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
  ]),
  workingHours: z
    .array(workingHourSchema)
    .min(1, "Debes configurar al menos un día de atención.")
    .max(7)
    // The matrix always renders 7 rows, so a duplicate can only come from a
    // corrupted localStorage draft — cheap to catch here rather than as a 400.
    .refine(
      (hours) => new Set(hours.map((h) => h.dayOfWeek)).size === hours.length,
      "Hay días duplicados en el horario.",
    )
    .refine(
      (hours) => hours.some((h) => h.isOpen),
      "Debes marcar al menos un día como abierto.",
    ),
});
export type Step2Input = z.infer<typeof step2Schema>;

// --- Paso 3: identidad visual y rubro --------------------------------------

export const step3Schema = z.object({
  specialty: z.enum(SPECIALTY_CATEGORIES, {
    message: "Selecciona el rubro principal de tu centro.",
  }),
  // Set by POST /tenant/upload-logo. Optional — the logo can be added later.
  logoUrl: z.string().url("La URL del logotipo no es válida.").optional(),
});
export type Step3Input = z.infer<typeof step3Schema>;

// --- Payload consolidado ---------------------------------------------------

/**
 * Exact body of POST /tenant/onboarding. The branch fields stay nested to match
 * CreateTenantDto — the backend runs with `forbidNonWhitelisted`, so a flattened
 * payload is rejected outright rather than silently ignored.
 */
export const tenantOnboardingSchema = step1Schema.extend({
  ...step3Schema.shape,
  branch: step2Schema,
});
export type TenantOnboardingInput = z.infer<typeof tenantOnboardingSchema>;

// --- Logo (validación de archivo en cliente) -------------------------------

export const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches UploadService
export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Pre-flight check so an oversized or wrong-typed file never leaves the browser.
 * The server repeats it — and additionally verifies the magic bytes, which the
 * browser cannot do — so this is purely to fail fast.
 */
export function validateLogoFile(file: File): string | null {
  if (
    !ALLOWED_LOGO_MIME_TYPES.includes(file.type as (typeof ALLOWED_LOGO_MIME_TYPES)[number])
  ) {
    return "Formato no permitido. Usa una imagen .jpg, .jpeg, .png o .webp.";
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return "El logotipo no puede superar los 5MB.";
  }
  return null;
}
