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

// --- Excepciones de calendario -------------------------------------------------

/** Mirrors Prisma's ExceptionType enum (Engine de Disponibilidad). */
export const EXCEPTION_TYPES = ["CUSTOM_OFF", "WORKING_DAY", "REPETITIVE_OFF"] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  CUSTOM_OFF: "Día libre / Vacación",
  WORKING_DAY: "Día laborable extraordinario",
  REPETITIVE_OFF: "Ausencia recurrente",
};

export const EXCEPTION_TYPE_HELP: Record<ExceptionType, string> = {
  CUSTOM_OFF: "Bloquea la disponibilidad del profesional en este rango de fechas.",
  WORKING_DAY: "Fuerza la apertura en un día normalmente cerrado según su horario habitual.",
  REPETITIVE_OFF: "Ausencia que se repite dentro del rango (ej. todos los lunes de este mes).",
};

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

/** Mirrors SpecialtiesService.DEFAULT_SPECIALTY_NAME on the backend — the
 *  system specialty that represents "sin especialidad definida". The API
 *  refuses to delete it; the UI hides that action instead of letting the
 *  user hit the 409. */
export const DEFAULT_SPECIALTY_NAME = "Sin especialidad";

/** Mirrors Prisma's CommissionType enum — compartido por los 3 niveles del
 *  Esquema de Comisiones Jerárquico. */
export const COMMISSION_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  PERCENTAGE: "%",
  FIXED_AMOUNT: "S/",
};

/**
 * Esquema de Comisiones Jerárquico de 3 niveles — de más a menos específico:
 * 1. `CUSTOM` — StaffService.customCommission* (este profesional, este servicio).
 * 2. `BASE` — Service.baseCommission* (cualquier profesional, este servicio).
 * 3. `DEFAULT` — StaffMember.defaultCommission* (este profesional, cualquier servicio).
 * El primer nivel que tenga un `type` configurado gana; si ninguno lo tiene,
 * no hay comisión resuelta (`null`).
 */
export const COMMISSION_SOURCES = ["CUSTOM", "BASE", "DEFAULT"] as const;
export type CommissionSource = (typeof COMMISSION_SOURCES)[number];

export const COMMISSION_SOURCE_LABELS: Record<CommissionSource, string> = {
  CUSTOM: "Personalizada",
  BASE: "Base del servicio",
  DEFAULT: "Por defecto del profesional",
};

export interface ResolvedCommission {
  type: CommissionType;
  /** STRING con dos decimales, misma convención que el resto de campos de dinero. */
  value: string;
  source: CommissionSource;
}

/**
 * Resuelve la comisión efectiva de un par (profesional, servicio) siguiendo
 * el orden custom > base > default. Cada nivel llega como su propio par
 * type/value porque cada uno vive en un modelo distinto (StaffService,
 * Service, StaffMember) — ver el enum CommissionType en schema.prisma.
 */
export function resolveCommission(
  custom: { type: CommissionType | null; value: string | null },
  base: { type: CommissionType | null; value: string | null },
  staffDefault: { type: CommissionType | null; value: string | null },
): ResolvedCommission | null {
  if (custom.type && custom.value) return { type: custom.type, value: custom.value, source: "CUSTOM" };
  if (base.type && base.value) return { type: base.type, value: base.value, source: "BASE" };
  if (staffDefault.type && staffDefault.value) {
    return { type: staffDefault.type, value: staffDefault.value, source: "DEFAULT" };
  }
  return null;
}

/** "10.00" + PERCENTAGE -> "10%"; "25.00" + FIXED_AMOUNT -> "S/ 25.00". */
export function formatCommissionValue(type: CommissionType, value: string): string {
  return type === "PERCENTAGE" ? `${Number(value)}%` : `S/ ${value}`;
}

export interface StaffServiceAssignment {
  id: string;
  staffMemberId: string;
  serviceId: string;
  customDurationMinutes: number | null;
  /** Sobreescriben Service.bufferMinutes para este profesional (Engine de
   *  Disponibilidad). Null = usa el buffer estándar del servicio. */
  customBufferBeforeMin: number | null;
  customBufferAfterMin: number | null;
  hideBufferFromClient: boolean;
  /** Nivel 1 (custom) del Esquema de Comisiones Jerárquico — null = sin
   *  override para este par, la comisión efectiva cae al servicio o al
   *  profesional (ver resolveCommission). `customCommissionValue` es un
   *  STRING con dos decimales, misma convención que commissionPercentage. */
  customCommissionType: CommissionType | null;
  customCommissionValue: string | null;
  createdAt: string;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    baseCommissionType: CommissionType | null;
    baseCommissionValue: string | null;
  };
}

/** Pausa dentro de un turno (ej. "Almuerzo") — un turno puede tener 0, 1 o
 *  varias. */
export interface StaffBreak {
  id: string;
  shiftId: string;
  startTime: string;
  endTime: string;
  label: string | null;
}

/** Un turno dentro de un día — multi-shift: un día puede tener varios turnos
 *  en vez de un único rango, y cada uno puede restringirse a un servicio. */
export interface StaffScheduleShift {
  id: string;
  scheduleId: string;
  startTime: string;
  endTime: string;
  serviceId: string | null;
  service: { id: string; name: string } | null;
  sortOrder: number;
  breaks: StaffBreak[];
}

/** Un día de la semana con sus turnos. Solo existe una fila por día — si no
 *  hay fila, el profesional no atiende ese día. */
export interface StaffSchedule {
  id: string;
  staffMemberId: string;
  dayOfWeek: number;
  isActive: boolean;
  shifts: StaffScheduleShift[];
}

export interface StaffAbsence {
  id: string;
  staffMemberId: string;
  type: ExceptionType;
  reason: string;
  /** Contexto administrativo/IA más largo que `reason`. */
  internalNote: string | null;
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
  /** Correo Google/Gmail de este profesional (Feature 09) — el motor de
   *  sincronización (Fase 4) comparte su calendario hijo con esta dirección.
   *  No es la cuenta de Google del tenant (esa vive en /integraciones). */
  googleEmail: string | null;
  avatarUrl: string | null;
  biography: string | null;
  color: string | null;
  commissionPercentage: string | null;
  /** Nivel 3 (default) del Esquema de Comisiones Jerárquico — comisión de
   *  este profesional para cualquier servicio que no tenga un override más
   *  específico (Service.baseCommission* o StaffService.customCommission*). */
  defaultCommissionType: CommissionType | null;
  defaultCommissionValue: string | null;
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
  /** Same shape as `errors`, but non-blocking — e.g. a "Servicios
   *  habilitados" name that didn't match anything: that service is skipped,
   *  the professional is imported anyway. */
  warnings: StaffImportError[];
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
    type: z.enum(EXCEPTION_TYPES),
    reason: z
      .string()
      .trim()
      .min(1, "Indica el motivo de la ausencia.")
      .max(200, "El motivo no puede superar los 200 caracteres."),
    internalNote: z
      .string()
      .trim()
      .max(1000, "La nota interna no puede superar los 1000 caracteres.")
      .optional()
      .or(z.literal("")),
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

/** Solo letras (con acentos), ñ/Ñ y espacios — nombre/apellido no deben
 *  aceptar números ni símbolos. Enforced both here and at the keystroke
 *  level in StaffFormDialog (onKeyDown), same "block at the event AND at
 *  validation" approach the spec asked for. */
export const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;

/** Local number only, no country code — the backend prepends +51
 *  automatically (CreateStaffDto's normalizePhone), so the form never asks
 *  the user to type it. A leading "+" is still accepted so a full E.164
 *  number (a different country, or a value loaded from an old record) is
 *  respected as-is rather than double-prefixed. */
const PHONE_REGEX = /^\+?\d{7,15}$/;

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

const minutesField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} debe ser un número entero.`)
    .refine((value) => Number(value) <= max, {
      message: `${label} no puede superar ${max} minutos.`,
    })
    .optional()
    .or(z.literal(""));

/** Same shape as validators/service.ts's moneyField — kept local because
 *  that helper lives further down this file (staffSchema's own
 *  moneyLikeField, defined after this point) and serviceAssignmentSchema
 *  needs it earlier. */
const commissionValueField = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, "La comisión debe ser un número con máximo 2 decimales.")
  .refine((value) => Number(value.replace(",", ".")) <= 999_999.99, {
    message: "La comisión supera el máximo permitido.",
  })
  .optional()
  .or(z.literal(""));

/** One row of the "matriz de competencias" (spec §2.2 Bloque 2) as the form
 *  edits it: only services the professional can perform live in this array —
 *  the checkbox list adds/removes entries rather than toggling a flag on all
 *  of them, mirroring TagPicker's value/onChange shape in validators/service.ts. */
export const serviceAssignmentSchema = z
  .object({
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
    /** Empty string = usa Service.bufferMinutes (Engine de Disponibilidad). */
    customBufferBeforeMin: minutesField("El buffer previo", 240),
    customBufferAfterMin: minutesField("El buffer posterior", 240),
    hideBufferFromClient: z.boolean(),
    /** Nivel 1 (custom) del Esquema de Comisiones Jerárquico — ambos vacíos =
     *  sin override, la comisión efectiva cae al servicio o al profesional
     *  (resolveCommission). Van juntos (superRefine abajo), igual que el
     *  backend (assertCommissionIsValid, common/utils/commission.util.ts). */
    customCommissionType: z.enum(COMMISSION_TYPES).optional().or(z.literal("")),
    customCommissionValue: commissionValueField,
  })
  .superRefine((entry, ctx) => {
    if (entry.customCommissionType && !entry.customCommissionValue) {
      ctx.addIssue({
        code: "custom",
        path: ["customCommissionValue"],
        message: "Indica el valor de la comisión.",
      });
    }
    if (!entry.customCommissionType && entry.customCommissionValue) {
      ctx.addIssue({
        code: "custom",
        path: ["customCommissionType"],
        message: "Selecciona el tipo de comisión.",
      });
    }
    if (entry.customCommissionType === "PERCENTAGE" && entry.customCommissionValue) {
      const percentage = Number(entry.customCommissionValue.replace(",", "."));
      if (percentage > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["customCommissionValue"],
          message: "Una comisión porcentual no puede superar 100%.",
        });
      }
    }
  });

export type ServiceAssignmentInput = z.infer<typeof serviceAssignmentSchema>;

/** Un descanso dentro de un turno (ej. "Almuerzo"). */
export const breakFieldSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  label: z.string().trim().max(60, "Máximo 60 caracteres.").optional().or(z.literal("")),
});

export type BreakFieldInput = z.infer<typeof breakFieldSchema>;

/** Un turno dentro de un día (Multi-shift). `serviceId` vacío = el turno
 *  aplica a cualquier servicio habilitado del profesional. */
export const shiftFieldSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  serviceId: z.string().optional().or(z.literal("")),
  breaks: z.array(breakFieldSchema),
});

export type ShiftFieldInput = z.infer<typeof shiftFieldSchema>;

/** One day of the weekly matrix (spec §4, Tab 3) as the form edits it: all 7
 *  días son siempre presentes so the grid never re-renders rows; `enabled`
 *  decide which ones are sent as a StaffSchedule row on submit — un día
 *  enviado sin turnos no cuenta, igual que uno deshabilitado. */
export const scheduleDayFieldSchema = z
  .object({
    dayOfWeek: z.number().min(0).max(6),
    enabled: z.boolean(),
    shifts: z.array(shiftFieldSchema),
  })
  .superRefine((day, ctx) => {
    if (!day.enabled) return;

    if (day.shifts.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["shifts"],
        message: "Agrega al menos un turno o desactiva este día.",
      });
      return;
    }

    const order = day.shifts
      .map((shift, index) => ({ shift, index }))
      .sort((a, b) => a.shift.startTime.localeCompare(b.shift.startTime));

    order.forEach(({ shift, index }, position) => {
      if (!TIME_HHMM.test(shift.startTime) || !TIME_HHMM.test(shift.endTime)) {
        ctx.addIssue({ code: "custom", path: ["shifts", index, "startTime"], message: "Hora inválida." });
        return;
      }
      if (shift.startTime >= shift.endTime) {
        ctx.addIssue({
          code: "custom",
          path: ["shifts", index, "endTime"],
          message: "La hora de fin debe ser posterior a la de inicio.",
        });
      }
      const previous = order[position - 1];
      if (previous && shift.startTime < previous.shift.endTime) {
        ctx.addIssue({
          code: "custom",
          path: ["shifts", index, "startTime"],
          message: "Este turno se superpone con otro del mismo día.",
        });
      }

      const breakOrder = shift.breaks
        .map((brk, breakIndex) => ({ brk, breakIndex }))
        .sort((a, b) => a.brk.startTime.localeCompare(b.brk.startTime));

      breakOrder.forEach(({ brk, breakIndex }, breakPosition) => {
        if (!TIME_HHMM.test(brk.startTime) || !TIME_HHMM.test(brk.endTime)) {
          ctx.addIssue({
            code: "custom",
            path: ["shifts", index, "breaks", breakIndex, "startTime"],
            message: "Hora inválida.",
          });
          return;
        }
        if (brk.startTime >= brk.endTime) {
          ctx.addIssue({
            code: "custom",
            path: ["shifts", index, "breaks", breakIndex, "endTime"],
            message: "El descanso debe terminar después de empezar.",
          });
        }
        if (brk.startTime < shift.startTime || brk.endTime > shift.endTime) {
          ctx.addIssue({
            code: "custom",
            path: ["shifts", index, "breaks", breakIndex, "startTime"],
            message: "El descanso debe estar dentro del turno.",
          });
        }
        const previousBreak = breakOrder[breakPosition - 1];
        if (previousBreak && brk.startTime < previousBreak.brk.endTime) {
          ctx.addIssue({
            code: "custom",
            path: ["shifts", index, "breaks", breakIndex, "startTime"],
            message: "Los descansos de un mismo turno no pueden superponerse.",
          });
        }
      });
    });
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

export const staffSchema = z
  .object({
    // Tab 1
    specialtyId: z.string().optional().or(z.literal("")),
    /** "+ Agregar especialidad" inline (Tab 1) — mismo patrón diferido que
     *  ServiceFormDialog's newCategory/newCategoryName: no llama a la API al
     *  tipear, solo al guardar el formulario (ver StaffFormDialog.onSubmit). */
    newSpecialty: z.boolean().optional(),
    newSpecialtyName: z.string().trim().max(80, "Máximo 80 caracteres.").optional().or(z.literal("")),
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
    medicalLicense: z.string().trim().max(50, "Máximo 50 caracteres.").optional().or(z.literal("")),
    email: z.string().trim().email("El correo no es válido.").optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX, "El teléfono no es válido. Escribe solo el número (ej. 987654321).")
      .optional()
      .or(z.literal("")),
    googleEmail: z.string().trim().email("El correo de Google no es válido.").optional().or(z.literal("")),
    avatarUrl: z.string().optional().or(z.literal("")),
    biography: z.string().trim().max(2000, "Máximo 2000 caracteres.").optional().or(z.literal("")),
    color: z
      .string()
      .trim()
      .regex(HEX_COLOR, "El color debe ser un hexadecimal de 6 dígitos (ej. #E11D48).")
      .optional()
      .or(z.literal("")),
    commissionPercentage: moneyLikeField("La comisión", 100),
    /** Nivel 3 (default) del Esquema de Comisiones Jerárquico — "Comisión
     *  General por Defecto". Vacío = sin comisión general configurada. */
    defaultCommissionType: z.enum(COMMISSION_TYPES).optional().or(z.literal("")),
    defaultCommissionValue: commissionValueField,
    isActive: z.boolean(),

    // Tab 2
    serviceAssignments: z.array(serviceAssignmentSchema),

    // Tab 3 — siempre 7 entradas, una por día (0-6).
    schedules: z.array(scheduleDayFieldSchema).length(7),
  })
  .superRefine((data, ctx) => {
    if (data.newSpecialty && !data.newSpecialtyName) {
      ctx.addIssue({
        code: "custom",
        path: ["newSpecialtyName"],
        message: "Indica el nombre de la nueva especialidad.",
      });
    }
    if (data.defaultCommissionType && !data.defaultCommissionValue) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultCommissionValue"],
        message: "Indica el valor de la comisión.",
      });
    }
    if (!data.defaultCommissionType && data.defaultCommissionValue) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultCommissionType"],
        message: "Selecciona el tipo de comisión.",
      });
    }
    if (data.defaultCommissionType === "PERCENTAGE" && data.defaultCommissionValue) {
      const percentage = Number(data.defaultCommissionValue.replace(",", "."));
      if (percentage > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultCommissionValue"],
          message: "Una comisión porcentual no puede superar 100%.",
        });
      }
    }
  });

export type StaffFormInput = z.infer<typeof staffSchema>;

const EMPTY_SCHEDULE: ScheduleDayInput[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  enabled: false,
  shifts: [],
}));

/** Turno por defecto que se agrega al activar un día o al pulsar "+ Agregar
 *  Turno" — mismo horario que el antiguo turno único fijo (08:00-17:00). */
export const DEFAULT_SHIFT: ShiftFieldInput = {
  startTime: "08:00",
  endTime: "17:00",
  serviceId: "",
  breaks: [],
};

export const EMPTY_STAFF_FORM: StaffFormInput = {
  specialtyId: "",
  newSpecialty: false,
  newSpecialtyName: "",
  firstName: "",
  lastName: "",
  medicalLicense: "",
  email: "",
  phone: "",
  googleEmail: "",
  avatarUrl: "",
  biography: "",
  color: STAFF_COLOR_PRESETS[0],
  commissionPercentage: "",
  defaultCommissionType: "",
  defaultCommissionValue: "",
  isActive: true,
  serviceAssignments: [],
  schedules: EMPTY_SCHEDULE,
};

/** API row -> form values. */
export function toStaffForm(staff: StaffMember): StaffFormInput {
  const byDay = new Map((staff.schedules ?? []).map((s) => [s.dayOfWeek, s]));

  return {
    specialtyId: staff.specialtyId ?? "",
    newSpecialty: false,
    newSpecialtyName: "",
    firstName: staff.firstName,
    lastName: staff.lastName,
    medicalLicense: staff.medicalLicense ?? "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    googleEmail: staff.googleEmail ?? "",
    avatarUrl: staff.avatarUrl ?? "",
    biography: staff.biography ?? "",
    color: staff.color ?? STAFF_COLOR_PRESETS[0],
    commissionPercentage: staff.commissionPercentage ?? "",
    defaultCommissionType: staff.defaultCommissionType ?? "",
    defaultCommissionValue: staff.defaultCommissionValue ?? "",
    isActive: staff.isActive,
    serviceAssignments: (staff.services ?? []).map((entry) => ({
      serviceId: entry.serviceId,
      customDurationMinutes: entry.customDurationMinutes?.toString() ?? "",
      customBufferBeforeMin: entry.customBufferBeforeMin?.toString() ?? "",
      customBufferAfterMin: entry.customBufferAfterMin?.toString() ?? "",
      hideBufferFromClient: entry.hideBufferFromClient,
      customCommissionType: entry.customCommissionType ?? "",
      customCommissionValue: entry.customCommissionValue ?? "",
    })),
    schedules: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const day = byDay.get(dayOfWeek);
      if (!day || day.shifts.length === 0) {
        return { dayOfWeek, enabled: false, shifts: [] };
      }
      return {
        dayOfWeek,
        enabled: true,
        shifts: day.shifts.map((shift) => ({
          startTime: shift.startTime,
          endTime: shift.endTime,
          serviceId: shift.serviceId ?? "",
          breaks: shift.breaks.map((brk) => ({
            startTime: brk.startTime,
            endTime: brk.endTime,
            label: brk.label ?? "",
          })),
        })),
      };
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
    googleEmail: form.googleEmail?.trim() || undefined,
    // `null` explícito (no `undefined`) — el backend distingue "no viene en
    // el body" (no tocar) de "viene null" (borrar), ver
    // StaffMembersService.update. Si se manda `undefined` acá, el borrado de
    // la foto nunca llega al servidor (axios/JSON.stringify omite las claves
    // undefined del body).
    avatarUrl: form.avatarUrl?.trim() || null,
    biography: form.biography?.trim() || undefined,
    color: form.color || undefined,
    commissionPercentage:
      form.commissionPercentage && form.commissionPercentage !== ""
        ? Number(form.commissionPercentage.replace(",", "."))
        : undefined,
    defaultCommissionType: form.defaultCommissionType || undefined,
    defaultCommissionValue:
      form.defaultCommissionValue && form.defaultCommissionValue !== ""
        ? Number(form.defaultCommissionValue.replace(",", "."))
        : undefined,
    isActive: form.isActive,
    serviceIds: form.serviceAssignments.map((entry) => ({
      serviceId: entry.serviceId,
      customDurationMinutes:
        entry.customDurationMinutes && entry.customDurationMinutes !== ""
          ? Number(entry.customDurationMinutes)
          : undefined,
      customBufferBeforeMin:
        entry.customBufferBeforeMin && entry.customBufferBeforeMin !== ""
          ? Number(entry.customBufferBeforeMin)
          : undefined,
      customBufferAfterMin:
        entry.customBufferAfterMin && entry.customBufferAfterMin !== ""
          ? Number(entry.customBufferAfterMin)
          : undefined,
      hideBufferFromClient: entry.hideBufferFromClient,
      customCommissionType: entry.customCommissionType || undefined,
      customCommissionValue:
        entry.customCommissionValue && entry.customCommissionValue !== ""
          ? Number(entry.customCommissionValue.replace(",", "."))
          : undefined,
    })),
    schedules: form.schedules
      .filter((day) => day.enabled && day.shifts.length > 0)
      .map((day) => ({
        dayOfWeek: day.dayOfWeek,
        shifts: day.shifts.map((shift) => ({
          startTime: shift.startTime,
          endTime: shift.endTime,
          serviceId: shift.serviceId || undefined,
          breaks: shift.breaks.map((brk) => ({
            startTime: brk.startTime,
            endTime: brk.endTime,
            label: brk.label?.trim() || undefined,
          })),
        })),
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
