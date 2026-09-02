import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import {
  APPOINTMENT_COLUMNS,
  AppointmentColumnDef,
  buildAppointmentsTemplate,
  normalizeHeader,
  SHEET_APPOINTMENTS,
} from './appointments-template.generator';
import { addMinutes, formatTimeEs, resourceOverlaps, staffOverlaps } from './overlap.util';

/** One problem, addressed to a specific cell — same shape as StaffImportError. */
export interface AppointmentImportError {
  /** 1-based row number as shown in Excel. 1 = la fila de encabezados. */
  row: number;
  /** Header de la columna tal como aparece en la plantilla, o '' para errores de toda la fila. */
  column: string;
  error: string;
}

/** Una fila que pasó cada chequeo — ya trae los ids resueltos, lista para
 *  escribirse como Appointment. */
export interface ParsedAppointmentRow {
  row: number;
  patientId: string;
  staffMemberId: string;
  serviceId: string;
  roomId: string | null;
  equipmentId: string | null;
  startAt: string;
  endAt: string;
  bufferMinutes: number;
  notes: string | null;
}

export interface AppointmentParseResult {
  successCount: number;
  errors: AppointmentImportError[];
  warnings: AppointmentImportError[];
  data: ParsedAppointmentRow[];
  /** Filas de datos examinadas, excluyendo las completamente vacías. */
  totalRows: number;
}

/** Mismos topes que StaffExcelImportService — un archivo de miles de filas
 *  en una sola pasada casi siempre es un error del usuario. */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'] as const;

/** Mismo supuesto que CreatePatientDto/CreateStaffDto's normalizePhone. */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const COLUMN_BY_KEY = new Map(APPOINTMENT_COLUMNS.map((column) => [column.key, column]));

interface ExistingPatientRef {
  id: string;
  phone: string;
}
interface ExistingStaffRef {
  id: string;
  name: string;
}
interface ExistingServiceRef {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
}
interface ExistingResourceRef {
  id: string;
  name: string;
}
/** Citas ya existentes (o ya aceptadas más arriba en el mismo archivo)
 *  contra las que se revisa el choque de horario de una fila nueva. */
interface ExistingAppointmentRef {
  staffMemberId: string;
  roomId: string | null;
  equipmentId: string | null;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
}

export interface AppointmentImportOptions {
  existingPatients: ExistingPatientRef[];
  existingProfessionals: ExistingStaffRef[];
  existingServices: ExistingServiceRef[];
  existingRooms: ExistingResourceRef[];
  existingEquipment: ExistingResourceRef[];
  /** Citas BLOCKING_STATUSES ya en la base de datos — usadas para el
   *  chequeo de choque de horario junto con las filas ya aceptadas de este
   *  mismo archivo (ver `acceptedInBatch` más abajo). */
  existingAppointments: ExistingAppointmentRef[];
  filename?: string;
}

@Injectable()
export class AppointmentsExcelImportService {
  private readonly logger = new Logger(AppointmentsExcelImportService.name);

  /** GET /appointments/export-template. */
  generateTemplate(catalog: {
    professionalNames: string[];
    serviceNames: string[];
    roomNames: string[];
    equipmentNames: string[];
  }): Promise<Buffer> {
    return buildAppointmentsTemplate(catalog);
  }

  /**
   * Lee un .xlsx/.csv subido y lo reporta fila por fila. Puro: valida y
   * devuelve, no escribe nada — el mismo contrato que StaffExcelImportService,
   * lo que permite que una sola llamada alimente tanto
   * /appointments/import-preview como /appointments/import.
   */
  async parseAndValidateExcel(buffer: Buffer, options: AppointmentImportOptions): Promise<AppointmentParseResult> {
    const sheet = await this.readSheet(buffer, options.filename);
    const errors: AppointmentImportError[] = [];
    const warnings: AppointmentImportError[] = [];
    const data: ParsedAppointmentRow[] = [];

    const headerMap = this.mapHeaders(sheet);
    const missingRequired = APPOINTMENT_COLUMNS.filter(
      (column) => column.required && !headerMap.has(column.key),
    );
    if (missingRequired.length > 0) {
      return {
        successCount: 0,
        totalRows: 0,
        data: [],
        warnings: [],
        errors: missingRequired.map((column) => ({
          row: 1,
          column: column.header,
          error: `Falta la columna obligatoria "${column.header}" en el archivo.`,
        })),
      };
    }

    const patientsByPhone = new Map(options.existingPatients.map((patient) => [patient.phone, patient.id]));
    const staffByName = new Map(
      options.existingProfessionals.map((staff) => [normalizeHeader(staff.name), staff]),
    );
    const servicesByName = new Map(
      options.existingServices.map((service) => [normalizeHeader(service.name), service]),
    );
    const roomsByName = new Map(options.existingRooms.map((room) => [normalizeHeader(room.name), room]));
    const equipmentByName = new Map(
      options.existingEquipment.map((item) => [normalizeHeader(item.name), item]),
    );

    // Crece con cada fila aceptada, así que dos filas del MISMO archivo que
    // chocan entre sí también se detectan, no solo contra lo que ya había en
    // la base de datos.
    const acceptedInBatch: ExistingAppointmentRef[] = [...options.existingAppointments];

    let totalRows = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells = new Map<string, string>();
      for (const [key, columnNumber] of headerMap) {
        cells.set(key, this.cellText(row.getCell(columnNumber).value));
      }

      if ([...cells.values()].every((value) => value === '')) {
        continue;
      }

      totalRows += 1;
      if (totalRows > MAX_IMPORT_ROWS) {
        errors.push({
          row: rowNumber,
          column: '',
          error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} citas por carga.`,
        });
        break;
      }

      const rowErrors: AppointmentImportError[] = [];
      const candidate = this.coerceRow(cells, rowNumber, rowErrors);

      if (rowErrors.length === 0) {
        for (const column of APPOINTMENT_COLUMNS) {
          if (column.required && (cells.get(column.key) ?? '') === '') {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              error: `La columna "${column.header}" es obligatoria.`,
            });
          }
        }
      }

      if (rowErrors.length === 0) {
        this.resolveReferencesAndConflicts(candidate, rowNumber, {
          patientsByPhone,
          staffByName,
          servicesByName,
          roomsByName,
          equipmentByName,
          acceptedInBatch,
          rowErrors,
          data,
        });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      }
    }

    this.logger.log(
      `Importación de citas analizada: ${data.length} fila(s) válida(s), ${errors.length} error(es).`,
    );

    return { successCount: data.length, totalRows, data, errors, warnings };
  }

  // -------------------------------------------------------------------------
  // Referencias cruzadas y choque de horario
  // -------------------------------------------------------------------------

  private resolveReferencesAndConflicts(
    candidate: Record<string, string>,
    rowNumber: number,
    ctx: {
      patientsByPhone: Map<string, string>;
      staffByName: Map<string, ExistingStaffRef>;
      servicesByName: Map<string, ExistingServiceRef>;
      roomsByName: Map<string, ExistingResourceRef>;
      equipmentByName: Map<string, ExistingResourceRef>;
      acceptedInBatch: ExistingAppointmentRef[];
      rowErrors: AppointmentImportError[];
      data: ParsedAppointmentRow[];
    },
  ): void {
    const fail = (key: string, message: string) => {
      ctx.rowErrors.push({ row: rowNumber, column: COLUMN_BY_KEY.get(key)?.header ?? key, error: message });
    };

    const patientId = ctx.patientsByPhone.get(candidate.patientPhone);
    if (!patientId) {
      fail('patientPhone', `No se encontró un paciente con el teléfono "${candidate.patientPhone}".`);
    }

    const staff = ctx.staffByName.get(normalizeHeader(candidate.professionalName));
    if (!staff) {
      fail('professionalName', `El profesional "${candidate.professionalName}" no existe o no está activo.`);
    }

    const service = ctx.servicesByName.get(normalizeHeader(candidate.serviceName));
    if (!service) {
      fail('serviceName', `El servicio "${candidate.serviceName}" no existe o no está activo.`);
    }

    let room: ExistingResourceRef | undefined;
    if (candidate.roomName) {
      room = ctx.roomsByName.get(normalizeHeader(candidate.roomName));
      if (!room) {
        fail('roomName', `La sala/cabina "${candidate.roomName}" no existe o no está activa.`);
      }
    }

    let equipment: ExistingResourceRef | undefined;
    if (candidate.equipmentName) {
      equipment = ctx.equipmentByName.get(normalizeHeader(candidate.equipmentName));
      if (!equipment) {
        fail('equipmentName', `El equipo "${candidate.equipmentName}" no existe o no está activo.`);
      }
    }

    if (ctx.rowErrors.length > 0) return;

    const startAt = new Date(`${candidate.date}T${candidate.time}:00.000Z`);
    if (Number.isNaN(startAt.getTime())) {
      fail('date', `La fecha/hora "${candidate.date} ${candidate.time}" no es válida.`);
      return;
    }
    if (startAt <= new Date()) {
      fail('date', 'No se pueden reservar citas en el pasado.');
      return;
    }

    const endAt = addMinutes(startAt, service!.durationMinutes);

    const staffConflict = ctx.acceptedInBatch.find(
      (existing) =>
        existing.staffMemberId === staff!.id && staffOverlaps(existing, startAt, endAt, service!.bufferMinutes),
    );
    if (staffConflict) {
      fail(
        'date',
        `El profesional "${candidate.professionalName}" ya tiene una cita entre las ${formatTimeEs(staffConflict.startAt)} y las ${formatTimeEs(staffConflict.endAt)}.`,
      );
      return;
    }

    if (room) {
      const roomConflict = ctx.acceptedInBatch.find(
        (existing) => existing.roomId === room!.id && resourceOverlaps(existing, startAt, endAt),
      );
      if (roomConflict) {
        fail(
          'roomName',
          `La Cabina "${candidate.roomName}" ya se encuentra reservada entre las ${formatTimeEs(roomConflict.startAt)} y las ${formatTimeEs(roomConflict.endAt)}.`,
        );
        return;
      }
    }

    if (equipment) {
      const equipmentConflict = ctx.acceptedInBatch.find(
        (existing) => existing.equipmentId === equipment!.id && resourceOverlaps(existing, startAt, endAt),
      );
      if (equipmentConflict) {
        fail(
          'equipmentName',
          `El Equipo "${candidate.equipmentName}" ya se encuentra reservado entre las ${formatTimeEs(equipmentConflict.startAt)} y las ${formatTimeEs(equipmentConflict.endAt)}.`,
        );
        return;
      }
    }

    ctx.acceptedInBatch.push({
      staffMemberId: staff!.id,
      roomId: room?.id ?? null,
      equipmentId: equipment?.id ?? null,
      startAt,
      endAt,
      bufferMinutes: service!.bufferMinutes,
    });

    ctx.data.push({
      row: rowNumber,
      patientId: patientId!,
      staffMemberId: staff!.id,
      serviceId: service!.id,
      roomId: room?.id ?? null,
      equipmentId: equipment?.id ?? null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      bufferMinutes: service!.bufferMinutes,
      notes: candidate.notes || null,
    });
  }

  // -------------------------------------------------------------------------
  // Lectura del archivo
  // -------------------------------------------------------------------------

  private async readSheet(buffer: Buffer, filename?: string): Promise<Worksheet> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (buffer.length > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 5 MB.');
    }

    const isCsv = (filename ?? '').toLowerCase().endsWith('.csv');
    const workbook = new Workbook();

    try {
      if (isCsv) {
        await workbook.csv.read(Readable.from(buffer));
      } else {
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      }
    } catch {
      throw new BadRequestException(
        `No se pudo leer el archivo. Asegúrate de que sea ${ACCEPTED_EXTENSIONS.join(' o ')} y de haberlo guardado desde Excel.`,
      );
    }

    const sheet =
      workbook.getWorksheet(SHEET_APPOINTMENTS) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');

    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de citas.');
    }
    return sheet;
  }

  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(this.cellText(cell.value));
      if (!normalized) return;
      const column = APPOINTMENT_COLUMNS.find(
        (candidate) => normalizeHeader(candidate.header) === normalized,
      );
      if (column && !map.has(column.key)) {
        map.set(column.key, columnNumber);
      }
    });

    return map;
  }

  private cellText(value: CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();

    if (typeof value === 'object') {
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text).join('').trim();
      }
      if ('result' in value) return this.cellText(value.result as CellValue);
      if ('text' in value) return String(value.text).trim();
      if ('error' in value) return '';
    }

    return String(value).trim();
  }

  // -------------------------------------------------------------------------
  // Coerción
  // -------------------------------------------------------------------------

  private coerceRow(
    cells: Map<string, string>,
    rowNumber: number,
    errors: AppointmentImportError[],
  ): Record<string, string> {
    const output: Record<string, string> = {};

    for (const column of APPOINTMENT_COLUMNS) {
      const raw = cells.get(column.key) ?? '';
      if (raw === '') {
        output[column.key] = '';
        continue;
      }

      const fail = (message: string) => {
        errors.push({ row: rowNumber, column: column.header, error: message });
      };

      switch (column.kind) {
        case 'text':
          output[column.key] = column.key === 'patientPhone' ? this.normalizePhone(raw) : raw;
          break;

        case 'date': {
          const normalized = this.normalizeDate(raw);
          if (!normalized) {
            fail(`"${raw}" no es una fecha válida. Usa el formato AAAA-MM-DD.`);
          } else {
            output[column.key] = normalized;
          }
          break;
        }

        case 'time': {
          const normalized = this.normalizeTime(raw);
          if (!normalized) {
            fail(`"${raw}" no es una hora válida. Usa el formato de 24 horas HH:mm.`);
          } else {
            output[column.key] = normalized;
          }
          break;
        }
      }
    }

    return output;
  }

  /** Acepta "AAAA-MM-DD" directo o una celda de fecha de Excel ya convertida
   *  a ISO por cellText (ej. "2026-09-15T00:00:00.000Z") — se queda solo con
   *  la parte de fecha en ambos casos. */
  private normalizeDate(raw: string): string | null {
    const datePart = raw.slice(0, 10);
    return DATE_PATTERN.test(datePart) ? datePart : null;
  }

  /** Acepta "HH:mm", "HH:mm:ss" o una celda de hora de Excel ya convertida a
   *  ISO por cellText (toma la porción de hora:minuto). */
  private normalizeTime(raw: string): string | null {
    const isoTimeMatch = raw.match(/T(\d{2}:\d{2})/);
    const candidate = isoTimeMatch ? isoTimeMatch[1] : raw.slice(0, 5);
    return TIME_PATTERN.test(candidate) ? candidate : null;
  }

  /** Mismo criterio que CreatePatientDto/CreateStaffDto's normalizePhone —
   *  duplicado a propósito (ver el comentario equivalente en
   *  staff-excel-import.service.ts). */
  private normalizePhone(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('+')) {
      return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `${DEFAULT_PHONE_COUNTRY_CODE}${digits}` : '';
  }
}

export type { AppointmentColumnDef };
