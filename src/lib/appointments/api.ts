import { api } from "@/lib/api";
import type {
  Appointment,
  AppointmentGridGroupBy,
  AppointmentGridResponse,
  AppointmentResourceRef,
  AppointmentStatus,
} from "@/lib/validators/appointment";

/**
 * Thin typed wrapper over the Módulo 06 endpoints.
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético (same contract as lib/staff/api.ts and lib/patients/api.ts).
 */

export interface AppointmentFilters {
  dateFrom: string;
  dateTo: string;
  staffMemberId?: string;
  patientId?: string;
  status?: AppointmentStatus;
  page?: number;
  pageSize?: number;
}

export interface AppointmentsPage {
  data: Appointment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listAppointments(filters: AppointmentFilters): Promise<AppointmentsPage> {
  const params: Record<string, string> = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  if (filters.staffMemberId) params.staffMemberId = filters.staffMemberId;
  if (filters.patientId) params.patientId = filters.patientId;
  if (filters.status) params.status = filters.status;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<AppointmentsPage>("/appointments", { params });
  return data;
}

export async function getAppointment(id: string): Promise<Appointment> {
  const { data } = await api.get<Appointment>(`/appointments/${id}`);
  return data;
}

export interface AppointmentGridParams {
  /** ISO timestamp — inicio del rango (nombres pedidos por el backend para
   *  este endpoint específicamente: startDate/endDate, no dateFrom/dateTo). */
  startDate: string;
  endDate: string;
  groupBy: AppointmentGridGroupBy;
}

/** GET /appointments/grid — una fila por recurso (profesional/sala/equipo)
 *  con sus citas del rango ya agrupadas; fuente de datos de AgendaGrid. */
export async function getAppointmentsGrid(params: AppointmentGridParams): Promise<AppointmentGridResponse> {
  const { data } = await api.get<AppointmentGridResponse>("/appointments/grid", { params });
  return data;
}

/** GET /appointments/rooms — catálogo de salas/cabinas activas, para el
 *  desplegable opcional del formulario de citas y el selector de grupo. */
export async function listRooms(): Promise<AppointmentResourceRef[]> {
  const { data } = await api.get<AppointmentResourceRef[]>("/appointments/rooms");
  return data;
}

/** GET /appointments/equipment — mismo propósito que listRooms, para
 *  equipos/aparatología. */
export async function listEquipment(): Promise<AppointmentResourceRef[]> {
  const { data } = await api.get<AppointmentResourceRef[]>("/appointments/equipment");
  return data;
}

export interface QuerySlotsParams {
  staffMemberId: string;
  serviceId: string;
  /** "YYYY-MM-DD". */
  date: string;
}

/** GET /appointments/slots — ISO timestamps of the day's free slots for that
 *  professional/servicio pair, already accounting for horario, ausencias,
 *  citas existentes y duración+buffer del servicio (motor de slots, spec §3). */
export async function getAvailableSlots(params: QuerySlotsParams): Promise<string[]> {
  const { data } = await api.get<string[]>("/appointments/slots", { params });
  return data;
}

export interface CreateAppointmentPayload {
  patientId: string;
  staffMemberId: string;
  serviceId: string;
  roomId?: string;
  equipmentId?: string;
  /** ISO timestamp — one of the candidates returned by getAvailableSlots. */
  startAt: string;
  notes?: string;
}

export async function createAppointment(payload: CreateAppointmentPayload): Promise<Appointment> {
  const { data } = await api.post<Appointment>("/appointments", payload);
  return data;
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  note?: string,
): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/appointments/${id}/status`, { status, note });
  return data;
}

export interface ReschedulePayload {
  startAt: string;
  /** Opcional — permite redimensionar la cita (cambiar su duración) en el
   *  mismo request. Omitido = el backend conserva la duración del servicio. */
  endAt?: string;
  staffMemberId?: string;
  roomId?: string;
  equipmentId?: string;
}

export async function rescheduleAppointment(
  id: string,
  payload: ReschedulePayload,
): Promise<Appointment> {
  const { data } = await api.patch<Appointment>(`/appointments/${id}/reschedule`, payload);
  return data;
}

/** Baja lógica (status: CANCELLED) — nunca borrado físico. */
export async function cancelAppointment(id: string, reason?: string): Promise<Appointment> {
  const { data } = await api.delete<Appointment>(`/appointments/${id}`, { data: { reason } });
  return data;
}

// --- Carga masiva (Excel/CSV) -------------------------------------------------

/** Descarga la .xlsx y dispara el guardado del navegador vía un Blob object
 *  URL — no un <a href> plano, porque el endpoint necesita la cookie de
 *  sesión + el header x-tenant-id. Mismo patrón que downloadStaffTemplate. */
export async function downloadAppointmentsTemplate(): Promise<void> {
  const response = await api.get<Blob>("/appointments/export-template", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-citas-lia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface BulkImportAppointmentItem {
  patientPhone: string;
  patientName?: string;
  serviceName: string;
  /** UUID del profesional o su nombre completo — el backend resuelve cuál es. */
  staffMemberId: string;
  /** UUID de la sala/equipo o su nombre completo — mismo criterio que staffMemberId. */
  roomId?: string;
  equipmentId?: string;
  startAt: string;
  /** Opcional — si se omite, el backend usa la duración del servicio. */
  endAt?: string;
  notes?: string;
}

export interface BulkImportPayload {
  appointments: BulkImportAppointmentItem[];
  /** false (por defecto) = mejor esfuerzo. true = todo o nada. */
  failOnError?: boolean;
}

export interface BulkImportResult {
  importedCount: number;
  failedCount: number;
  errors: { index: number; field: string; error: string }[];
  rolledBack: boolean;
  results: { index: number; appointmentId: string }[];
}

/** POST /appointments/bulk-import — motor de importación con auto-creación
 *  de paciente por teléfono y `failOnError` real, usado por el wizard de
 *  carga masiva (parseo del Excel/CSV es 100% cliente, ver
 *  lib/appointments/bulk-import-parser.ts). */
export async function bulkImportAppointments(payload: BulkImportPayload): Promise<BulkImportResult> {
  const { data } = await api.post<BulkImportResult>("/appointments/bulk-import", payload);
  return data;
}
