import type { Appointment } from "@/lib/validators/appointment";

/**
 * Constantes de la grilla temporal compartidas por AgendaGrid (columnas por
 * recurso) y UnifiedAgendaGrid (línea de tiempo consolidada) — vivían
 * duplicadas en agenda-grid.tsx antes de que existiera una segunda grilla
 * que las necesitara.
 */
export const DEFAULT_START_MIN = 0;
export const DEFAULT_END_MIN = 24 * 60;
export const ROW_MINUTES = 30;
export const SNAP_MINUTES = 15;
export const PX_PER_MINUTE = 1.6;

export function roundDownTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}
export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export interface PackedAppointment {
  appointment: Appointment;
  /** Índice de carril dentro de su grupo de traslape (0-based). */
  column: number;
  /** Cuántos carriles tiene ese grupo — el ancho de la tarjeta es 1/columnCount. */
  columnCount: number;
}

/**
 * Empaqueta un set de citas que pueden solaparse en el tiempo dentro de
 * carriles lado a lado — mismo algoritmo que usan los calendarios tipo
 * Google Calendar para su vista "día": se agrupan las citas en clusters de
 * traslape contiguo (un cluster termina cuando el máximo `endAt` visto hasta
 * ahora ya quedó atrás), y dentro de cada cluster se asigna cada cita al
 * primer carril cuyo último `endAt` ya terminó; si ninguno sirve, se abre un
 * carril nuevo. Usado por la "Visión General" (una sola línea de tiempo para
 * toda la clínica) y por cada columna-día de la vista Semana.
 */
export function packOverlappingAppointments(appointments: Appointment[]): PackedAppointment[] {
  const sorted = [...appointments].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt),
  );

  const result: PackedAppointment[] = [];
  let cluster: { appointment: Appointment; column: number }[] = [];
  let columnsEnd: string[] = [];
  let clusterEnd = "";

  function flushCluster() {
    if (cluster.length === 0) return;
    const columnCount = Math.max(...cluster.map((entry) => entry.column)) + 1;
    for (const entry of cluster) {
      result.push({ appointment: entry.appointment, column: entry.column, columnCount });
    }
    cluster = [];
    columnsEnd = [];
  }

  for (const appointment of sorted) {
    if (clusterEnd && appointment.startAt >= clusterEnd) {
      flushCluster();
      clusterEnd = "";
    }

    let placedColumn = -1;
    for (let index = 0; index < columnsEnd.length; index += 1) {
      if (columnsEnd[index] <= appointment.startAt) {
        columnsEnd[index] = appointment.endAt;
        placedColumn = index;
        break;
      }
    }
    if (placedColumn === -1) {
      columnsEnd.push(appointment.endAt);
      placedColumn = columnsEnd.length - 1;
    }

    cluster.push({ appointment, column: placedColumn });
    clusterEnd = !clusterEnd || appointment.endAt > clusterEnd ? appointment.endAt : clusterEnd;
  }
  flushCluster();

  return result;
}
