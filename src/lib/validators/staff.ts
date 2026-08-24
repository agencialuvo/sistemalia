import { z } from "zod";

/**
 * Mirrors backend/src/modules/staff/dto/*.dto.ts (Módulo 04).
 *
 * The API re-validates everything — it is reachable directly — so these
 * schemas exist to give the form inline errors before a round-trip, not as
 * the security boundary. Keep the two in sync, same rule as validators/service.ts.
 */

// --- Días de la semana -------------------------------------------------------

/** 0 = Domingo … 6 = Sábado, matches StaffSchedule.dayOfWeek exactly. */
export const DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/** Display order for the weekly grid (spec §4, Tab 3: "Lunes a Domingo") —
 *  the stored dayOfWeek stays 0=Domingo regardless of how it's laid out. */
export const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DAY_ABBR: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- Tipos de la API ---------------------------------------------------------

export interface Specialty {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { staffMembers: number };
}

export interface StaffServiceAssignment {
  id: string;
  staffMemberId: string;
  serviceId: string;
  customDurationMinutes: number | null;
  createdAt: string;
  service: { id: string; name: string; durationMinutes: number };
}

export interface StaffSchedule {
  id: string;
  staffMemberId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lunchStartTime: string | null;
  lunchEndTime: string | null;
  isActive: boolean;
}

export interface StaffAbsence {
  id: string;
  staffMemberId: string;
  reason: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

/**
 * A StaffMember as the API returns it.
 *
 * `commissionPercentage` is a STRING with exactly two decimals ("15.50"), not
 * a number — same reasoning as Service's money fields (validators/service.ts):
 * the backend serialises Prisma's Decimal that way so arithmetic on the
 * client never reintroduces binary-float rounding error.
 */
export interface StaffMember {
  id: string;
  tenantId: string;
  userId: string | null;
  specialtyId: string | null;
  firstName: string;
  lastName: string;
  medicalLicense: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  biography: string | null;
  color: string | null;
  commissionPercentage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  specialty: { id: string; name: string } | null;
  user?: { id: string; email: string; fullName: string } | null;
  /** Only present on GET /staff/:id and after create/update. */
  services?: StaffServiceAssignment[];
  schedules?: StaffSchedule[];
  absences?: StaffAbsence[];
  _count?: { services: number; absences: number };
}

// --- Carga masiva (Excel) -----------------------------------------------------

/** Mirrors backend/src/modules/staff/staff-excel-import.service.ts's
 *  StaffImportError — same shape as Módulo 03's ImportError (validators/service.ts). */
export interface StaffImportError {
  row: number;
  column: string;
  error: string;
}

/** Mirrors StaffMembersService.StaffImportResult — the response of both
 *  POST /staff/import-preview and POST /staff/import. */
export interface StaffImportResult {
  successCount: number;
  totalRows: number;
  errors: StaffImportError[];
  newSpecialtyNames: string[];
  imported: number;
  createdSpecialties: string[];
  dryRun: boolean;
  data: Array<{ row: number; specialtyName: string; staff: { firstName: string; lastName: string } }>;
}

// --- Especialidades ----------------------------------------------------------

export const specialtySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre de la especialidad es obligatorio.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
  description: z.string().trim().max(255, "Máximo 255 caracteres.").optional(),
  isActive: z.boolean().optional(),
});

export type SpecialtyFormInput = z.infer<typeof specialtySchema>;

// --- Ausencias ----------------------------------------------------------------

export const absenceSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Indica el motivo de la ausencia.")
      .max(200, "El motivo no puede superar los 200 caracteres."),
    // <input type="date"> hands back "YYYY-MM-DD"; sent to the API as-is —
    // the backend's @IsDateString accepts a bare date.
    startDate: z.string().min(1, "Indica la fecha de inicio."),
    endDate: z.string().min(1, "Indica la fecha de fin."),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "La fecha de fin debe ser posterior a la fecha de inicio.",
    path: ["endDate"],
  });

export type AbsenceFormInput = z.infer<typeof absenceSchema>;

// --- Profesionales -------------------------------------------------------------

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Palette offered as swatches — same set CategoryManagerDialog uses, so a
 *  doctor's calendar badge and a service category badge read consistently. */
export const STAFF_COLOR_PRESETS = [
  "#E11D48",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#7C3AED",
  "#EC4899",
  "#64748B",
] as const;

/** One row of the "matriz de competencias" (spec §2.2 Bloque 2) as the form
 *  edits it: only services the professional can perform live in this array —
 *  the checkbox list adds/removes entries rather than toggling a flag on all
 *  of them, mirroring TagPicker's value/onChange shape in validators/service.ts. */
export const serviceAssignmentSchema = z.object({
  serviceId: z.string().uuid(),
  /** Empty string = usa la duración estándar del servicio. */
  customDurationMinutes: z
    .string()
    .trim()
    .regex(/^\d+$/, "La duración debe ser un número entero.")
    .refine((value) => Number(value) >= 1 && Number(value) <= 720, {
      message: "La duración debe estar entre 1 y 720 minutos.",
    })
    .optional()
    .or(z.literal("")),
});

export type ServiceAssignmentInput = z.infer<typeof serviceAssignmentSchema>;

/** One day of the weekly matrix (spec §4, Tab 3) as the form edits it — all 7
 *  días are always present so the grid never re-renders rows; `enabled`
 *  decides which ones are sent as a StaffSchedule row on submit. */
export const scheduleDayFieldSchema = z
  .object({
    dayOfWeek: z.number().min(0).max(6),
    enabled: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    lunchStartTime: z.string(),
    lunchEndTime: z.string(),
  })
  .superRefine((day, ctx) => {
    if (!day.enabled) return;

    if (!TIME_HHMM.test(day.startTime)) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Hora de inicio inválida." });
    }
    if (!TIME_HHMM.test(day.endTime)) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Hora de fin inválida." });
    }
    if (
      TIME_HHMM.test(day.startTime) &&
      TIME_HHMM.test(day.endTime) &&
      day.startTime >= day.endTime
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "La hora de fin debe ser posterior a la de inicio.",
      });
    }

    const hasLunchStart = day.lunchStartTime !== "";
    const hasLunchEnd = day.lunchEndTime !== "";
    if (hasLunchStart !== hasLunchEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["lunchEndTime"],
        message: "El receso de almuerzo requiere hora de inicio y de fin.",
      });
    } else if (hasLunchStart && hasLunchEnd) {
      if (day.lunchStartTime >= day.lunchEndTime) {
        ctx.addIssue({
          code: "custom",
          path: ["lunchEndTime"],
          message: "El inicio del almuerzo debe ser anterior a su fin.",
        });
      }
      if (day.lunchStartTime < day.startTime || day.lunchEndTime > day.endTime) {
        ctx.addIssue({
          code: "custom",
          path: ["lunchStartTime"],
          message: "El almuerzo debe estar dentro del turno.",
        });
      }
    }
  });

export type ScheduleDayInput = z.infer<typeof scheduleDayFieldSchema>;

const moneyLikeField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+([.,]\d{1,2})?$/, `${label} debe ser un número con máximo 2 decimales.`)
    .refine((value) => Number(value.replace(",", ".")) <= max, {
      message: `${label} supera el máximo permitido.`,
    })
    .optional()
    .or(z.literal(""));

export const staffSchema = z.object({
  // Tab 1
  specialtyId: z.string().optional().or(z.literal("")),
  firstName: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(100, "El nombre no puede superar los 100 caracteres."),
  lastName: z
    .string()
    .trim()
    .min(1, "El apellido es obligatorio.")
    .max(100, "El apellido no puede superar los 100 caracteres."),
  medicalLicense: z.string().trim().max(50, "Máximo 50 caracteres.").optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("El correo no es válido.")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(30, "Máximo 30 caracteres.").optional().or(z.literal("")),
  avatarUrl: z.string().optional().or(z.literal("")),
  biography: z.string().trim().max(2000, "Máximo 2000 caracteres.").optional().or(z.literal("")),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR, "El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).")
    .optional()
    .or(z.literal("")),
  commissionPercentage: moneyLikeField("La comisión", 100),
  isActive: z.boolean(),

  // Tab 2
  serviceAssignments: z.array(serviceAssignmentSchema),

  // Tab 3 — siempre 7 entradas, una por día (0-6).
  schedules: z.array(scheduleDayFieldSchema).length(7),
});

export type StaffFormInput = z.infer<typeof staffSchema>;

const EMPTY_SCHEDULE: ScheduleDayInput[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  enabled: false,
  startTime: "08:00",
  endTime: "17:00",
  lunchStartTime: "",
  lunchEndTime: "",
}));

export const EMPTY_STAFF_FORM: StaffFormInput = {
  specialtyId: "",
  firstName: "",
  lastName: "",
  medicalLicense: "",
  email: "",
  phone: "",
  avatarUrl: "",
  biography: "",
  color: STAFF_COLOR_PRESETS[0],
  commissionPercentage: "",
  isActive: true,
  serviceAssignments: [],
  schedules: EMPTY_SCHEDULE,
};

/** API row -> form values. */
export function toStaffForm(staff: StaffMember): StaffFormInput {
  const byDay = new Map((staff.schedules ?? []).map((s) => [s.dayOfWeek, s]));

  return {
    specialtyId: staff.specialtyId ?? "",
    firstName: staff.firstName,
    lastName: staff.lastName,
    medicalLicense: staff.medicalLicense ?? "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    avatarUrl: staff.avatarUrl ?? "",
    biography: staff.biography ?? "",
    color: staff.color ?? STAFF_COLOR_PRESETS[0],
    commissionPercentage: staff.commissionPercentage ?? "",
    isActive: staff.isActive,
    serviceAssignments: (staff.services ?? []).map((entry) => ({
      serviceId: entry.serviceId,
      customDurationMinutes: entry.customDurationMinutes?.toString() ?? "",
    })),
    schedules: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const existing = byDay.get(dayOfWeek);
      return existing
        ? {
            dayOfWeek,
            enabled: true,
            startTime: existing.startTime,
            endTime: existing.endTime,
            lunchStartTime: existing.lunchStartTime ?? "",
            lunchEndTime: existing.lunchEndTime ?? "",
          }
        : { ...EMPTY_SCHEDULE[dayOfWeek] };
    }),
  };
}

/**
 * Form values -> POST/PATCH body.
 *
 * `serviceIds` and `schedules` always go out as complete arrays (never
 * omitted), because StaffMembersService replaces the whole sub-resource on
 * every write — sending only the changed rows would silently drop whatever
 * the form isn't showing (see backend's create-staff.dto.ts doc comment).
 */
export function toStaffPayload(form: StaffFormInput): Record<string, unknown> {
  return {
    specialtyId: form.specialtyId || undefined,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    medicalLicense: form.medicalLicense?.trim() || undefined,
    email: form.email?.trim() || undefined,
    phone: form.phone?.trim() || undefined,
    avatarUrl: form.avatarUrl?.trim() || undefined,
    biography: form.biography?.trim() || undefined,
    color: form.color || undefined,
    commissionPercentage:
      form.commissionPercentage && form.commissionPercentage !== ""
        ? Number(form.commissionPercentage.replace(",", "."))
        : undefined,
    isActive: form.isActive,
    serviceIds: form.serviceAssignments.map((entry) => ({
      serviceId: entry.serviceId,
      customDurationMinutes:
        entry.customDurationMinutes && entry.customDurationMinutes !== ""
          ? Number(entry.customDurationMinutes)
          : undefined,
    })),
    schedules: form.schedules
      .filter((day) => day.enabled)
      .map((day) => ({
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        lunchStartTime: day.lunchStartTime || undefined,
        lunchEndTime: day.lunchEndTime || undefined,
      })),
  };
}

/** "15.50" -> "15.5%" for display; blank when the professional has no
 *  commission configured. */
export function formatCommission(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed}%`;
}
