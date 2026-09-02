/**
 * Helpers de fecha "YYYY-MM-DD" en aritmética UTC — deliberadamente sin
 * date-fns para estas operaciones: date-fns opera sobre los componentes
 * *locales* de un `Date` (getMonth/getDate), lo que produce resultados
 * distintos según la zona horaria del navegador. Todo el módulo Agenda
 * (page.tsx, AgendaGrid, UnifiedAgendaGrid, DateJumpPopover) comparte estos
 * helpers para que la aritmética de fechas sea consistente en toda la UI.
 */

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana ISO que contiene `date` — Lunes-primero, mismo
 *  criterio que DAY_DISPLAY_ORDER en validators/staff.ts. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const weekday = d.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekDays(date: string): string[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Matriz completa de la vista Mes: del lunes on/antes del día 1 al domingo
 *  on/después del último día, para que la grilla siempre cierre en semanas
 *  completas (relleno del mes anterior/siguiente incluido). */
export function monthMatrixDays(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const firstDate = new Date(`${first}T00:00:00.000Z`);
  const lastDayNumber = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0)).getUTCDate();
  const last = `${date.slice(0, 7)}-${String(lastDayNumber).padStart(2, "0")}`;
  const lastWeekday = new Date(`${last}T00:00:00.000Z`).getUTCDay();
  const end = lastWeekday === 0 ? last : addDays(last, 7 - lastWeekday);

  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function shortDateEs(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00.000Z`).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function monthYearEs(dateOnly: string): string {
  const label = new Date(`${dateOnly}T00:00:00.000Z`).toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Lunes 31", "Martes 1"... — nombre completo del día + número, en
 *  español, con mayúscula inicial (spec §4: cabecera de columna de la
 *  vista Semana). */
export function weekdayNumberEs(dateOnly: string): string {
  const label = new Date(`${dateOnly}T00:00:00.000Z`).toLocaleDateString("es-PE", {
    weekday: "long",
    timeZone: "UTC",
  });
  const dayNumber = Number(dateOnly.slice(8, 10));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${dayNumber}`;
}
