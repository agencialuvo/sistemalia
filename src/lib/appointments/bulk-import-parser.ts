import * as XLSX from "xlsx";

import { isoAtUtcMinutes } from "@/lib/validators/appointment";

/**
 * Parser 100% cliente del Excel/CSV de carga masiva de citas — lee el
 * archivo con `xlsx` (SheetJS) y arma filas ya listas para
 * `POST /appointments/bulk-import`, sin llamar al backend viejo
 * (`/appointments/import-preview`). Solo valida lo que el cliente puede
 * saber sin catálogos (campos obligatorios presentes, formato de
 * fecha/hora/duración) — si el profesional, servicio, sala o equipo
 * realmente existen se decide en el servidor (mismo motor que ya usa
 * `AppointmentsService.bulkImport`), así que el parser nunca pide
 * `listStaff`/`listRooms`/etc.
 */

const SHEET_APPOINTMENTS = "Citas";

/** Espejo de HEADER_TO_FIELD del backend (appointments-template.generator.ts)
 *  — no se puede importar código server-only, así que la tabla de columnas
 *  se repite acá con el mismo texto exacto (sin el sufijo "*"). */
const HEADER_TO_FIELD: Record<string, keyof RawRow> = {
  "telefono del paciente": "patientPhone",
  "nombre del paciente": "patientName",
  profesional: "professionalName",
  servicio: "serviceName",
  "fecha (aaaa-mm-dd)": "date",
  "hora (hh:mm)": "time",
  "duracion (min)": "durationMinutes",
  "sala / cabina": "roomName",
  equipo: "equipmentName",
  notas: "notes",
};

interface RawRow {
  patientPhone: string;
  patientName: string;
  professionalName: string;
  serviceName: string;
  date: string;
  time: string;
  durationMinutes: string;
  roomName: string;
  equipmentName: string;
  notes: string;
}

export interface ParsedImportRow {
  /** Número de fila real del archivo (1 = encabezados, primera fila de datos = 2). */
  row: number;
  status: "valid" | "error";
  issues: string[];
  patientPhone?: string;
  patientName?: string;
  staffMemberId?: string;
  serviceName?: string;
  roomId?: string;
  equipmentId?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  /** Solo para mostrar en la tabla de preview. */
  displayDate?: string;
  displayTime?: string;
}

/** Quita tildes/mayúsculas para matchear encabezados y valores — mismo
 *  criterio de normalización que el resto del módulo Agenda (ver
 *  normalizeSearch en agenda/page.tsx). */
function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*$/, "")
    .trim();
}

/** Mismo criterio que AppointmentsService.normalizeBulkImportPhone en el
 *  backend — si el backend igual va a normalizar distinto, mejor que el
 *  preview ya muestre el valor final. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+51${digits}` : "";
}

/** Una celda de fecha puede llegar como Date (SheetJS con cellDates:true,
 *  usa siempre campos UTC para representar el valor de la celda, sin
 *  importar la zona horaria del navegador) o como texto "AAAA-MM-DD". */
function coerceDateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** Igual que coerceDateOnly pero para la celda de hora — devuelve minutos
 *  desde medianoche. */
function coerceMinutesOfDay(value: unknown): number | null {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutesOfDay(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

function coerceDurationMinutes(value: unknown): { ok: true; minutes: number | null } | { ok: false } {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, minutes: null };
  const minutes = Number(text);
  if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false };
  return { ok: true, minutes };
}

export async function parseBulkImportFile(file: File): Promise<ParsedImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName =
    workbook.SheetNames.find((name) => normalize(name) === normalize(SHEET_APPOINTMENTS)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("El archivo no tiene ninguna hoja para leer.");
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  if (rawRows.length < 2) {
    throw new Error('La hoja "Citas" no tiene filas de datos debajo del encabezado.');
  }

  const headerRow = rawRows[0];
  const fieldByColumnIndex = new Map<number, keyof RawRow>();
  headerRow.forEach((header, columnIndex) => {
    const field = HEADER_TO_FIELD[normalize(String(header ?? ""))];
    if (field) fieldByColumnIndex.set(columnIndex, field);
  });

  const results: ParsedImportRow[] = [];

  for (let rowIndex = 1; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rawRows[rowIndex];
    const rowNumber = rowIndex + 1;

    const raw: Record<keyof RawRow, unknown> = {
      patientPhone: "",
      patientName: "",
      professionalName: "",
      serviceName: "",
      date: "",
      time: "",
      durationMinutes: "",
      roomName: "",
      equipmentName: "",
      notes: "",
    };
    fieldByColumnIndex.forEach((field, columnIndex) => {
      raw[field] = cells[columnIndex];
    });

    const isEmptyRow = Object.values(raw).every((value) => String(value ?? "").trim() === "");
    if (isEmptyRow) continue;

    const issues: string[] = [];

    const patientPhone = normalizePhone(String(raw.patientPhone ?? ""));
    if (!patientPhone) issues.push("El teléfono del paciente es obligatorio.");

    const professionalName = String(raw.professionalName ?? "").trim();
    if (!professionalName) issues.push("El profesional es obligatorio.");

    const serviceName = String(raw.serviceName ?? "").trim();
    if (!serviceName) issues.push("El servicio es obligatorio.");

    const dateOnly = coerceDateOnly(raw.date);
    if (!dateOnly) issues.push('La fecha no es válida — usa el formato "AAAA-MM-DD".');

    const minutesOfDay = coerceMinutesOfDay(raw.time);
    if (minutesOfDay === null) issues.push('La hora no es válida — usa el formato de 24h "HH:mm".');

    const duration = coerceDurationMinutes(raw.durationMinutes);
    if (!duration.ok) issues.push("La duración debe ser un número entero de minutos mayor que 0.");

    const roomName = String(raw.roomName ?? "").trim();
    const equipmentName = String(raw.equipmentName ?? "").trim();
    const notes = String(raw.notes ?? "").trim();
    const patientName = String(raw.patientName ?? "").trim();

    const displayDate = dateOnly ?? String(raw.date ?? "");
    const displayTime = minutesOfDay !== null ? formatMinutesOfDay(minutesOfDay) : String(raw.time ?? "");

    if (issues.length > 0) {
      results.push({
        row: rowNumber,
        status: "error",
        issues,
        patientPhone: patientPhone || undefined,
        patientName: patientName || undefined,
        staffMemberId: professionalName || undefined,
        serviceName: serviceName || undefined,
        displayDate,
        displayTime,
      });
      continue;
    }

    const startAt = isoAtUtcMinutes(dateOnly!, minutesOfDay!);
    const endAt =
      duration.ok && duration.minutes !== null ? isoAtUtcMinutes(dateOnly!, minutesOfDay! + duration.minutes) : undefined;

    results.push({
      row: rowNumber,
      status: "valid",
      issues: [],
      patientPhone,
      patientName: patientName || undefined,
      staffMemberId: professionalName,
      serviceName,
      roomId: roomName || undefined,
      equipmentId: equipmentName || undefined,
      startAt,
      endAt,
      notes: notes || undefined,
      displayDate,
      displayTime,
    });
  }

  return results;
}
