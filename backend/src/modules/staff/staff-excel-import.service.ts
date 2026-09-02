import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import { STATUS_LABELS } from '../services/services-template.generator';
import { ImportStaffRowDto } from './dto/import-staff-row.dto';
import {
  buildStaffTemplate,
  DOCUMENT_TYPE_LABELS,
  normalizeHeader,
  SERVICES_WILDCARD_ALL,
  SHEET_STAFF,
  STAFF_COLUMNS,
  StaffColumnDef,
} from './staff-template.generator';

/** One problem, addressed to a specific cell so the user can go fix it. Same
 *  shape as ExcelImportService's ImportError (services module). */
export interface StaffImportError {
  /** 1-based row number as shown in Excel. 1 = the header row. */
  row: number;
  /** Column header as printed in the template, or '' for whole-row problems. */
  column: string;
  error: string;
}

/** A row that passed every check, ready to become a StaffMember. */
export interface ParsedStaffRow {
  row: number;
  /** '' = sin especialidad. */
  specialtyName: string;
  /** Names already checked against the existing service catalogue. Empty
   *  when `allServicesRequested` is true — the sheet said "TODOS" instead of
   *  naming them. */
  serviceNames: string[];
  /** The row wrote the `SERVICES_WILDCARD_ALL` keyword in "Servicios
   *  habilitados": StaffMembersService.importFromExcel resolves this to every
   *  active service at write time, inside the same transaction that creates
   *  the row, rather than here — see ImportStaffRowDto's doc comment. */
  allServicesRequested: boolean;
  staff: Omit<ImportStaffRowDto, 'specialtyName' | 'serviceNames'>;
}

export interface StaffParseResult {
  successCount: number;
  errors: StaffImportError[];
  /** Same shape as `errors`, but non-blocking: the row above still imports.
   *  Today the only source is "Servicios habilitados" naming a service that
   *  does not exist — that service is skipped, not the whole professional. */
  warnings: StaffImportError[];
  data: ParsedStaffRow[];
  /** Especialidades named in the file that the tenant does not have yet. */
  newSpecialtyNames: string[];
  /** Data rows examined, blank ones excluded. */
  totalRows: number;
}

/** Same caps as ExcelImportService (services module) — one transaction
 *  holding thousands of inserts is almost always a mistake. */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'] as const;

/** Same assumption as CreateStaffDto's DEFAULT_PHONE_COUNTRY_CODE. */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';

const STATUS_INDEX = new Map(
  Object.entries(STATUS_LABELS).map(([label, value]) => [normalizeHeader(label), value]),
);
const DOCUMENT_TYPE_INDEX = new Map(
  Object.entries(DOCUMENT_TYPE_LABELS).map(([label, value]) => [normalizeHeader(label), value]),
);

const COLUMN_BY_KEY = new Map(STAFF_COLUMNS.map((column) => [column.key, column]));

@Injectable()
export class StaffExcelImportService {
  private readonly logger = new Logger(StaffExcelImportService.name);

  /** GET /staff/export-template — takes the tenant's especialidad and
   *  servicio names so the sheet offers what the centre already has. */
  generateTemplate(specialtyNames: string[], serviceNames: string[]): Promise<Buffer> {
    return buildStaffTemplate(specialtyNames, serviceNames);
  }

  /**
   * Reads an uploaded .xlsx/.csv and reports it row by row.
   *
   * Pure: it validates and returns, it does not write anything — same
   * contract as ExcelImportService.parseAndValidateExcel, which is what lets
   * one call power both /staff/import-preview and /staff/import.
   */
  async parseAndValidateExcel(
    buffer: Buffer,
    options: {
      existingSpecialties?: string[];
      existingServiceNames?: string[];
      filename?: string;
    } = {},
  ): Promise<StaffParseResult> {
    const sheet = await this.readSheet(buffer, options.filename);
    const errors: StaffImportError[] = [];
    const warnings: StaffImportError[] = [];
    const data: ParsedStaffRow[] = [];

    const headerMap = this.mapHeaders(sheet);
    const missingRequired = STAFF_COLUMNS.filter(
      (column) => column.required && !headerMap.has(column.key),
    );
    if (missingRequired.length > 0) {
      return {
        successCount: 0,
        totalRows: 0,
        newSpecialtyNames: [],
        data: [],
        warnings: [],
        errors: missingRequired.map((column) => ({
          row: 1,
          column: column.header,
          error: `Falta la columna obligatoria "${column.header}" en el archivo.`,
        })),
      };
    }

    const knownSpecialties = new Set(
      (options.existingSpecialties ?? []).map((name) => normalizeHeader(name)),
    );
    const knownServiceNames = new Set(
      (options.existingServiceNames ?? []).map((name) => normalizeHeader(name)),
    );
    const newSpecialties = new Map<string, string>();
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
          error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} profesionales por carga.`,
        });
        break;
      }

      const rowErrors: StaffImportError[] = [];
      const candidate = this.coerceRow(cells, rowNumber, rowErrors);

      // Presence first, same reasoning as ExcelImportService: an empty cell
      // reaching class-validator produces an English constraint message
      // instead of "esta columna es obligatoria".
      if (rowErrors.length === 0) {
        for (const column of STAFF_COLUMNS) {
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
        rowErrors.push(...this.validateRow(candidate, rowNumber));
      }

      // Servicios habilitados must already exist — the bulk path does not
      // create them (see ImportStaffRowDto's doc comment). Blank OR the TODOS
      // wildcard both mean "every active service", sidestepping the name
      // check entirely; a name that does not match is a WARNING, not a row
      // error — that one service is skipped, the professional is still
      // imported with whichever names did match.
      let serviceNames: string[] = [];
      let allServicesRequested = false;
      if (rowErrors.length === 0) {
        const raw = (candidate.serviceNames as string | undefined) ?? '';
        if (!raw.trim() || normalizeHeader(raw) === normalizeHeader(SERVICES_WILDCARD_ALL)) {
          allServicesRequested = true;
        } else {
          const requested = raw
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
          serviceNames = requested.filter((name) => knownServiceNames.has(normalizeHeader(name)));
          const unknown = requested.filter((name) => !knownServiceNames.has(normalizeHeader(name)));
          if (unknown.length > 0) {
            warnings.push({
              row: rowNumber,
              column: COLUMN_BY_KEY.get('serviceNames')?.header ?? 'Servicios habilitados',
              error: `Estos servicios no existen en tu catálogo y fueron omitidos: ${unknown.join(', ')}.`,
            });
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      // Safe by construction: the row only reaches here after validateRow()
      // ran the DTO's decorators over it and reported nothing. `serviceNames`
      // was already consumed above (into the typed `serviceNames` array), so
      // only `specialtyName` needs pulling out of the write-ready `staff` shape.
      const { specialtyName, ...staff } = candidate as unknown as Omit<
        ImportStaffRowDto,
        'serviceNames'
      >;
      const trimmedSpecialty = (specialtyName ?? '').trim();
      if (trimmedSpecialty) {
        const specialtyKey = normalizeHeader(trimmedSpecialty);
        if (!knownSpecialties.has(specialtyKey) && !newSpecialties.has(specialtyKey)) {
          newSpecialties.set(specialtyKey, trimmedSpecialty);
        }
      }

      data.push({
        row: rowNumber,
        specialtyName: trimmedSpecialty,
        serviceNames,
        allServicesRequested,
        staff,
      });
    }

    this.logger.log(
      `Importación de personal analizada: ${data.length} fila(s) válida(s), ${errors.length} error(es), ${warnings.length} advertencia(s).`,
    );

    return {
      successCount: data.length,
      totalRows,
      newSpecialtyNames: [...newSpecialties.values()],
      data,
      errors,
      warnings,
    };
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
      workbook.getWorksheet(SHEET_STAFF) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');

    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de personal.');
    }
    return sheet;
  }

  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(this.cellText(cell.value));
      if (!normalized) return;
      const column = STAFF_COLUMNS.find(
        (candidate) => normalizeHeader(candidate.header) === normalized,
      );
      if (column && !map.has(column.key)) {
        map.set(column.key, columnNumber);
      }
    });

    return map;
  }

  /** Flattens every shape exceljs can hand back into plain trimmed text —
   *  identical to ExcelImportService's cellText (services module). */
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
    errors: StaffImportError[],
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const column of STAFF_COLUMNS) {
      const raw = cells.get(column.key) ?? '';
      if (raw === '') continue;

      const fail = (message: string) => {
        errors.push({ row: rowNumber, column: column.header, error: message });
      };

      switch (column.kind) {
        case 'text':
        case 'category':
          output[column.key] = column.key === 'phone' ? this.normalizePhone(raw) : raw;
          break;

        case 'money': {
          const parsed = this.parseNumber(raw);
          if (parsed === null) {
            fail(`"${raw}" no es un número válido. Usa solo números (ej. 15.50).`);
          } else if (parsed < 0) {
            fail('La comisión no puede ser negativa.');
          } else {
            output[column.key] = Math.round(parsed * 100) / 100;
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

    return output;
  }

  private parseEnum(column: StaffColumnDef, raw: string): boolean | string | undefined {
    if (column.key === 'isActive') return STATUS_INDEX.get(normalizeHeader(raw));
    if (column.key === 'documentType') return DOCUMENT_TYPE_INDEX.get(normalizeHeader(raw));
    return undefined;
  }

  /** Same rule as CreateStaffDto's normalizePhone (staff module) — kept
   *  duplicated (see parseNumber's doc comment above) because ImportStaffRowDto
   *  applies its inherited @Transform only for DTO validation, not for the
   *  raw candidate this service actually writes to the database (see
   *  validateRow below). The sheet only asks for the local number: no "+" ->
   *  assumed Perú and DEFAULT_PHONE_COUNTRY_CODE is prepended digits-only. */
  private normalizePhone(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('+')) {
      return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `${DEFAULT_PHONE_COUNTRY_CODE}${digits}` : '';
  }

  /** Same Peruvian-spreadsheet-friendly parsing as ExcelImportService's
   *  parseNumber (services module) — kept duplicated rather than shared so
   *  the working, already-shipped Services import stays untouched. */
  private parseNumber(raw: string): number | null {
    let text = raw
      .replace(/S\/\.?/gi, '')
      .replace(/\s/g, '')
      .replace(/%/g, '');

    if (text === '') return null;

    const hasDot = text.includes('.');
    const hasComma = text.includes(',');

    if (hasDot && hasComma) {
      const decimalIsComma = text.lastIndexOf(',') > text.lastIndexOf('.');
      text = decimalIsComma
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
    } else if (hasComma) {
      const [, decimals] = text.split(',');
      text = decimals !== undefined && decimals.length !== 3 ? text.replace(',', '.') : text.replace(/,/g, '');
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Runs the shared DTO decorators over the coerced row. */
  private validateRow(candidate: Record<string, unknown>, rowNumber: number): StaffImportError[] {
    const instance = plainToInstance(ImportStaffRowDto, candidate);
    const failures = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      stopAtFirstError: true,
    });
    return failures.flatMap((failure) => this.toImportErrors(failure, rowNumber));
  }

  private toImportErrors(failure: ValidationError, rowNumber: number): StaffImportError[] {
    const column = COLUMN_BY_KEY.get(failure.property);
    const messages = Object.values(failure.constraints ?? {});
    return messages.map((message) => ({
      row: rowNumber,
      column: column?.header ?? failure.property,
      error: message,
    }));
  }
}
