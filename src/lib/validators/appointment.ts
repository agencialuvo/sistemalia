import { z } from "zod";

/**
 * Mirrors backend/src/modules/appointments/dto/*.dto.ts (Módulo 06).
 *
 * The API re-validates everything — it is reachable directly — so these
 * schemas exist to give the wizard inline errors before a round-trip, not as
 * the security boundary. Keep the two in sync, same rule as
 * validators/staff.ts and validators/service.ts.
 */

export const APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_SERVICE: "En atención",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No asistió",
};

/** Tailwind classes for the status badge/card accent — same palette family
 *  used across the app (amber/blue/violet/emerald/rose/zinc). */
export const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, string> = {
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  CONFIRMED: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  IN_SERVICE: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 line-through",
  NO_SHOW: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
};

/** Statuses a currently-open appointment can transition into, keyed by its
 *  current status — drives which quick-action buttons AppointmentDetailDialog
 *  offers. Terminal statuses (COMPLETED/CANCELLED/NO_SHOW) map to []. */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_SERVICE", "CANCELLED", "NO_SHOW"],
  IN_SERVICE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export interface AppointmentPatientRef {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface AppointmentStaffRef {
  id: string;
  firstName: string;
  lastName: string;
  color: string | null;
}

export interface AppointmentServiceRef {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
}

/** Referencia liviana a una Sala/Cabina o Equipo — el backend solo incluye
 *  {id, name} en DETAIL_INCLUDE, no el registro completo. */
export interface AppointmentResourceRef {
  id: string;
  name: string;
}

export const APPOINTMENT_PAYMENT_STATUSES = ["PENDING", "PAID"] as const;
export type AppointmentPaymentStatus = (typeof APPOINTMENT_PAYMENT_STATUSES)[number];

export const APPOINTMENT_PAYMENT_STATUS_LABELS: Record<AppointmentPaymentStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
};

/** Mismo lenguaje visual que APPOINTMENT_STATUS_COLORS — verde para pagado,
 *  ámbar para pendiente, el mismo par que ya usa el resto de la app para
 *  "completo/ok" vs "a la espera". */
export const APPOINTMENT_PAYMENT_STATUS_COLORS: Record<AppointmentPaymentStatus, string> = {
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PAID: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  staffMemberId: string;
  serviceId: string;
  roomId: string | null;
  equipmentId: string | null;
  startAt: string;
  endAt: string;
  bufferMinutes: number;
  status: AppointmentStatus;
  paymentStatus: AppointmentPaymentStatus;
  notes: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  patient: AppointmentPatientRef;
  staffMember: AppointmentStaffRef;
  service: AppointmentServiceRef;
  room: AppointmentResourceRef | null;
  equipment: AppointmentResourceRef | null;
}

// --- Grid de recursos (GET /appointments/grid) -------------------------------

export const APPOINTMENT_GRID_GROUP_BY = ["PROFESSIONAL", "ROOM", "EQUIPMENT"] as const;
export type AppointmentGridGroupBy = (typeof APPOINTMENT_GRID_GROUP_BY)[number];

export interface AppointmentGridResource {
  id: string;
  name: string;
  color: string | null;
  appointments: Appointment[];
  bookedMinutes: number;
  occupancyRate: number;
}

export interface AppointmentGridResponse {
  groupBy: AppointmentGridGroupBy;
  dateFrom: string;
  dateTo: string;
  resources: AppointmentGridResource[];
  occupancy: { bookedMinutes: number; capacityMinutes: number; rate: number };
}

// --- Wizard (AppointmentFormDialog) ------------------------------------------

export const newAppointmentSchema = z.object({
  patientId: z.string().uuid({ message: "Selecciona un paciente." }),
  serviceId: z.string().uuid({ message: "Selecciona un servicio." }),
  staffMemberId: z.string().uuid({ message: "Selecciona un profesional." }),
  roomId: z.string().uuid({ message: "La sala/cabina no es válida." }).optional(),
  equipmentId: z.string().uuid({ message: "El equipo no es válido." }).optional(),
  date: z.string().min(1, { message: "Selecciona una fecha." }),
  startAt: z.string().min(1, { message: "Selecciona un horario disponible." }),
  notes: z.string().max(2000, { message: "Las notas no pueden superar los 2000 caracteres." }).optional(),
});

export type NewAppointmentDraft = z.infer<typeof newAppointmentSchema>;

/** "2026-08-29T14:30:00.000Z" -> "14:30", read in UTC (see backend's
 *  slot-engine doc comment: every date/time in this module is UTC, not the
 *  browser's local time zone). */
export function formatTimeUtc(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/** "2026-08-29T00:00:00.000Z" -> "sáb, 29 ago 2026". */
export function formatDateUtc(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-08-29T14:30:00.000Z" -> 870 (14*60+30) — minutes since UTC
 *  midnight, the same "UTC-naive local time" convention every date/time
 *  helper in this module follows. Used by the Agenda grid to position an
 *  appointment card vertically. */
export function minutesFromMidnightUtc(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Inverse of minutesFromMidnightUtc: "YYYY-MM-DD" + a minute offset since
 *  UTC midnight -> full ISO timestamp. Used to turn a grid drop position
 *  back into the `startAt` rescheduleAppointment expects. */
export function isoAtUtcMinutes(dateOnly: string, minutes: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCMinutes(minutes);
  return d.toISOString();
}

/** "YYYY-MM-DD" for today, in the browser's local time zone — used as the
 *  default value of the agenda's date picker and the wizard's date step. */
export function todayDateOnly(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
