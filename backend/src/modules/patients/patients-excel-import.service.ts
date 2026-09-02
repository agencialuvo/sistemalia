import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import { ImportPatientRowDto } from './dto/import-patient-row.dto';
import {
  ACQUISITION_CHANNEL_LABELS,
  buildPatientsTemplate,
  DOCUMENT_TYPE_LABELS,
  GENDER_LABELS,
  normalizeHeader,
  PATIENT_COLUMNS,
  PatientColumnDef,
  SHEET_PATIENTS,
} from './patients-template.generator';

/** One problem, addressed to a specific cell so the user can go fix it. Same
 *  shape as ExcelImportService's ImportError (services module). */
export interface PatientImportError {
  /** 1-based row number as shown in Excel. 1 = the header row. */
  row: number;
  /** Column header as printed in the template, or '' for whole-row problems. */
  column: string;
  error: string;
}

/** A row that passed every check, ready to become a Patient. */
export interface ParsedPatientRow {
  row: number;
  patient: ImportPatientRowDto;
  /** Split from "Alergias / Antecedentes" — not a Patient column, so it is
   *  kept apart to be upserted into PatientMedicalHistory after the patient
   *  itself is created (see PatientsService.importFromExcel). Empty = the
   *  cell was blank; the patient still gets created, just with no antecedente
   *  row written. */
  allergies: string[];
}

export interface PatientParseResult {
  successCount: number;
  errors: PatientImportError[];
  data: ParsedPatientRow[];
  /** Data rows examined, blank ones excluded. */
  totalRows: number;
}

/** Same caps as ExcelImportService (services module) — one transaction
 *  holding thousands of inserts is almost always a mistake. */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'] as const;

/** Same assumption as CreatePatientDto's normalizePhone. */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';

const DOCUMENT_TYPE_INDEX = new Map(
  Object.entries(DOCUMENT_TYPE_LABELS).map(([label, value]) => [normalizeHeader(label), value]),
);
/** Deliberately more generous than the template's dropdown — "F"/"M" are what
 *  people type by hand, same spirit as ExcelImportService's BOOLEAN_INDEX. */
const GENDER_INDEX = new Map<string, string>([
  ...Object.entries(GENDER_LABELS).map(([label, value]) => [normalizeHeader(label), value] as const),
  ['f', 'FEMALE'],
  ['mujer', 'FEMALE'],
  ['m', 'MALE'],
  ['hombre', 'MALE'],
]);
const ACQUISITION_CHANNEL_INDEX = new Map(
  Object.entries(ACQUISITION_CHANNEL_LABELS).map(([label, value]) => [normalizeHeader(label), value]),
);

const COLUMN_BY_KEY = new Map(PATIENT_COLUMNS.map((column) => [column.key, column]));

@Injectable()
export class PatientsExcelImportService {
  private readonly logger = new Logger(PatientsExcelImportService.name);

  /** GET /patients/export-template — takes the tenant's PatientTag names so
   *  the "Etiquetas" reference list offers what the centro already uses. */
  generateTemplate(tagNames: string[]): Promise<Buffer> {
    return buildPatientsTemplate(tagNames);
  }

  /**
   * Reads an uploaded .xlsx/.csv and reports it row by row.
   *
   * Pure: it validates and returns, it does not write anything — same
   * contract as ExcelImportService/StaffExcelImportService.parseAndValidateExcel.
   */
  async parseAndValidateExcel(
    buffer: Buffer,
    options: { existingDocumentNumbers?: string[]; filename?: string } = {},
  ): Promise<PatientParseResult> {
    const sheet = await this.readSheet(buffer, options.filename);
    const errors: PatientImportError[] = [];
    const data: ParsedPatientRow[] = [];

    const headerMap = this.mapHeaders(sheet);
    const missingRequired = PATIENT_COLUMNS.filter(
      (column) => column.required && !headerMap.has(column.key),
    );
    if (missingRequired.length > 0) {
      return {
        successCount: 0,
        totalRows: 0,
        data: [],
        errors: missingRequired.map((column) => ({
          row: 1,
          column: column.header,
          error: `Falta la columna obligatoria "${column.header}" en el archivo.`,
        })),
      };
    }

    const knownDocuments = new Set(
      (options.existingDocumentNumbers ?? []).map((value) => value.trim()),
    );
    const seenInFile = new Set<string>();
    let totalRows = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells = new Map<string, string>();
      for (const [key, columnNumber] of headerMap) {
        cells.set(key, this.cellText(row.getCell(columnNumber).value));
      }

      // Rows that only ever held formatting are not rows the user wrote.
      if ([...cells.values()].every((value) => value === '')) {
        continue;
      }

      totalRows += 1;
      if (totalRows > MAX_IMPORT_ROWS) {
        errors.push({
          row: rowNumber,
          column: '',
          error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} pacientes por carga.`,
        });
        break;
      }

      const rowErrors: PatientImportError[] = [];
      const candidate = this.coerceRow(cells, rowNumber, rowErrors);

      // Presence first, same reasoning as ExcelImportService: an empty cell
      // reaching class-validator produces an English constraint message
      // instead of "esta columna es obligatoria".
      if (rowErrors.length === 0) {
        for (const column of PATIENT_COLUMNS) {
          if (column.required && (cells.get(column.key) ?? '') === '') {
            rowErrors.push({
              row: rowNumber,
              column: column.header,
              error: `La columna "${column.header}" es obligatoria.`,
            });
          }
        }
      }

      // Duplicidad de documento — contra el tenant y contra el propio
      // archivo. Comprobado antes de validateRow: un documento repetido no
      // necesita que el resto de la fila también esté bien para reportarse.
      const documentNumber = (candidate.documentNumber as string | undefined)?.trim();
      if (rowErrors.length === 0 && documentNumber) {
        if (knownDocuments.has(documentNumber)) {
          rowErrors.push({
            row: rowNumber,
            column: COLUMN_BY_KEY.get('documentNumber')?.header ?? 'Documento',
            error: `El documento "${documentNumber}" ya está registrado en tu centro estético.`,
          });
        } else if (seenInFile.has(documentNumber)) {
          rowErrors.push({
            row: rowNumber,
            column: COLUMN_BY_KEY.get('documentNumber')?.header ?? 'Documento',
            error: `El documento "${documentNumber}" está repetido dentro del archivo.`,
          });
        } else {
          seenInFile.add(documentNumber);
        }
      }

      if (rowErrors.length === 0) {
        rowErrors.push(...this.validateRow(candidate, rowNumber));
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      // Safe by construction: the row only reaches here after validateRow()
      // ran the DTO's decorators over it and reported nothing. `allergies`
      // was never part of ImportPatientRowDto — pulled out here into its own
      // field, same as ImportStaffRowDto pulling specialtyName/serviceNames.
      const { allergies, ...patientCandidate } = candidate;
      const patient = patientCandidate as unknown as ImportPatientRowDto;

      data.push({
        row: rowNumber,
        patient,
        allergies: typeof allergies === 'string' ? (allergies as string).split(',').map((a) => a.trim()).filter(Boolean) : [],
      });
    }

    this.logger.log(
      `Importación de pacientes analizada: ${data.length} fila(s) válida(s), ${errors.length} error(es).`,
    );

    return { successCount: data.length, totalRows, data, errors };
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
      workbook.getWorksheet(SHEET_PATIENTS) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');

    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de pacientes.');
    }
    return sheet;
  }

  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(this.cellText(cell.value));
      if (!normalized) return;
      const column = PATIENT_COLUMNS.find(
        (candidate) => normalizeHeader(candidate.header) === normalized,
      );
      if (column && !map.has(column.key)) {
        map.set(column.key, columnNumber);
      }
    });

    return map;
  }

  /** Flattens every shape exceljs can hand back into plain trimmed text —
   *  identical to ExcelImportService/StaffExcelImportService's cellText. */
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
  // Coerción y validación
  // -------------------------------------------------------------------------

  private coerceRow(
    cells: Map<string, string>,
    rowNumber: number,
    errors: PatientImportError[],
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const column of PATIENT_COLUMNS) {
      const raw = cells.get(column.key) ?? '';
      if (raw === '') continue;

      const fail = (message: string) => {
        errors.push({ row: rowNumber, column: column.header, error: message });
      };

      switch (column.kind) {
        case 'text':
        case 'longText':
          output[column.key] = column.key === 'phone' ? this.normalizePhone(raw) : raw;
          break;

        case 'date': {
          const parsed = this.parseFlexibleDate(raw);
          if (!parsed) {
            fail(`"${raw}" no es una fecha válida. Usa AAAA-MM-DD o DD/MM/AAAA.`);
          } else {
            output[column.key] = parsed.toISOString().slice(0, 10);
          }
          break;
        }

        case 'enum': {
          const parsed = this.parseEnum(column, raw);
          if (parsed === undefined) {
            fail(`"${raw}" no es válido. Opciones: ${(column.options ?? []).join(' / ')}.`);
          } else {
            output[column.key] = parsed;
          }
          break;
        }
      }
    }

    // Comma-separated -> String[], same shape CreatePatientDto.tags expects.
    if (typeof output.tags === 'string') {
      output.tags = (output.tags as string)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    return output;
  }

  private parseEnum(column: PatientColumnDef, raw: string): string | undefined {
    const key = normalizeHeader(raw);
    if (column.key === 'documentType') return DOCUMENT_TYPE_INDEX.get(key);
    if (column.key === 'gender') return GENDER_INDEX.get(key);
    if (column.key === 'acquisitionChannel') return ACQUISITION_CHANNEL_INDEX.get(key);
    return undefined;
  }

  /** Same rule as CreatePatientDto's normalizePhone — kept duplicated (see
   *  StaffExcelImportService's parseNumber-style precedent) because
   *  ImportPatientRowDto's inherited @Transform only runs for DTO validation,
   *  not for the raw candidate this service actually writes to the database
   *  (validateRow below discards the transformed instance). The sheet only
   *  asks for the local number: no "+" -> assumed Perú, digits-only. */
  private normalizePhone(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('+')) {
      return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `${DEFAULT_PHONE_COUNTRY_CODE}${digits}` : '';
  }

  /**
   * Tolerant date reader: ISO ("1990-05-12", or the full ISO cellText()
   * produces from a real Excel date cell), "DD/MM/AAAA" / "DD-MM-AAAA", and a
   * bare Excel date serial (what a cell shows as a plain number when its
   * format got lost — e.g. pasted from another sheet). Returns null rather
   * than throwing so the caller can report a row-addressed error.
   */
  private parseFlexibleDate(raw: string): Date | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
    if (dmy) {
      const [, day, month, year] = dmy;
      const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (Number.isNaN(parsed.getTime())) return null;
      // Guards against "31/02/1990" — JS Date rolls that into March 3rd
      // instead of rejecting it, which would silently save the wrong day.
      if (parsed.getUTCDate() !== Number(day) || parsed.getUTCMonth() !== Number(month) - 1) return null;
      return parsed;
    }

    // A bare Excel serial: plausible range only (year ~1970-2100), so a
    // 9-digit documento typed into the wrong column doesn't get misread as a
    // date instead of failing with a clear error.
    if (/^\d{4,6}$/.test(trimmed)) {
      const serial = Number(trimmed);
      if (serial < 25569 || serial > 73050) return null;
      const epoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(epoch + serial * 86400000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  /** Runs the shared DTO decorators over the coerced row. */
  private validateRow(candidate: Record<string, unknown>, rowNumber: number): PatientImportError[] {
    const instance = plainToInstance(ImportPatientRowDto, candidate);
    const failures = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      stopAtFirstError: true,
    });
    return failures.flatMap((failure) => this.toImportErrors(failure, rowNumber));
  }

  private toImportErrors(failure: ValidationError, rowNumber: number): PatientImportError[] {
    const column = COLUMN_BY_KEY.get(failure.property);
    const messages = Object.values(failure.constraints ?? {});
    return messages.map((message) => ({
      row: rowNumber,
      column: column?.header ?? failure.property,
      error: message,
    }));
  }
}
