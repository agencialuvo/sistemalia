import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ServiceAvailabilityType,
  ServicePaymentMethod,
  ServiceStructureType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import { ImportServiceRowDto } from './dto/import-service-row.dto';
import {
  BOOLEAN_LABELS,
  ColumnDef,
  normalizeHeader,
  PAYMENT_LABELS,
  SERVICE_COLUMNS,
  SHEET_SERVICES,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  buildServicesTemplate,
} from './services-template.generator';

/** One problem, addressed to a specific cell so the user can go fix it. */
export interface ImportError {
  /** 1-based row number as shown in Excel. 1 = the header row. */
  row: number;
  /** Column header as printed in the template, or '' for whole-row problems. */
  column: string;
  error: string;
}

/** A row that passed every check, ready to become a Service. */
export interface ParsedServiceRow {
  row: number;
  categoryName: string;
  service: Omit<ImportServiceRowDto, 'categoryName'>;
}

export interface ParseResult {
  successCount: number;
  errors: ImportError[];
  data: ParsedServiceRow[];
  /** Categories named in the file that the tenant does not have yet. */
  newCategoryNames: string[];
  /** Data rows examined, blank ones excluded. */
  totalRows: number;
}

/** Beyond this the import is refused outright: it would mean one transaction
 *  holding thousands of inserts, and a spreadsheet that large is almost always
 *  a mistake (a whole sheet pasted in, an export from another system). */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'] as const;

/** Case- and accent-insensitive lookup for the Spanish labels of an enum. */
function labelIndex<T>(labels: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(labels).map(([label, value]) => [normalizeHeader(label), value]));
}

const STRUCTURE_INDEX = labelIndex<string>(STRUCTURE_LABELS);
const PAYMENT_INDEX = labelIndex<string>(PAYMENT_LABELS);
const STATUS_INDEX = labelIndex<boolean>(STATUS_LABELS);
/** Deliberately more generous than the template's dropdown: people type "SI",
 *  "S", "X", "TRUE" and "1" when filling a sheet by hand. */
const BOOLEAN_INDEX = new Map<string, boolean>([
  ...labelIndex<boolean>(BOOLEAN_LABELS),
  ['si', true],
  ['s', true],
  ['x', true],
  ['true', true],
  ['1', true],
  ['n', false],
  ['false', false],
  ['0', false],
]);

const COLUMN_BY_KEY = new Map(SERVICE_COLUMNS.map((column) => [column.key, column]));

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  /**
   * Task 2.4 — the downloadable template.
   *
   * Takes the tenant's category names so the "Categoría" column offers what
   * the centre already uses instead of inviting near-duplicates.
   */
  generateTemplate(categoryNames: string[]): Promise<Buffer> {
    return buildServicesTemplate(categoryNames);
  }

  /**
   * Task 2.4 — reads an uploaded .xlsx/.csv and reports it row by row.
   *
   * Pure: it validates and returns, it does not write anything. Persisting
   * (and creating the missing categories) is ServicesService's job, which is
   * what lets the same call power both the preview the user confirms and the
   * import itself.
   */
  async parseAndValidateExcel(
    buffer: Buffer,
    options: { existingCategories?: string[]; filename?: string } = {},
  ): Promise<ParseResult> {
    const sheet = await this.readSheet(buffer, options.filename);
    const errors: ImportError[] = [];
    const data: ParsedServiceRow[] = [];

    const headerMap = this.mapHeaders(sheet);
    const missingRequired = SERVICE_COLUMNS.filter(
      (column) => column.required && !headerMap.has(column.key),
    );
    if (missingRequired.length > 0) {
      // A missing required column makes every row fail for the same reason.
      // Reporting it once, against the header row, is the difference between
      // one actionable message and 300 copies of it.
      return {
        successCount: 0,
        totalRows: 0,
        newCategoryNames: [],
        data: [],
        errors: missingRequired.map((column) => ({
          row: 1,
          column: column.header,
          error: `Falta la columna obligatoria "${column.header}" en el archivo.`,
        })),
      };
    }

    const knownCategories = new Set(
      (options.existingCategories ?? []).map((name) => name.trim().toLowerCase()),
    );
    const newCategories = new Map<string, string>();
    const seen = new Set<string>();
    let totalRows = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells = new Map<string, string>();
      for (const [key, columnNumber] of headerMap) {
        cells.set(key, this.cellText(row.getCell(columnNumber).value));
      }

      // Excel readily reports thousands of "rows" that only ever held
      // formatting. Anything with no content at all is not a row the user
      // wrote, so it is skipped rather than reported as 20 missing fields.
      if ([...cells.values()].every((value) => value === '')) {
        continue;
      }

      totalRows += 1;
      if (totalRows > MAX_IMPORT_ROWS) {
        errors.push({
          row: rowNumber,
          column: '',
          error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} servicios por carga.`,
        });
        break;
      }

      const rowErrors: ImportError[] = [];
      const candidate = this.coerceRow(cells, rowNumber, rowErrors);

      // Presence is checked here, before the DTO runs, and the order matters.
      // A missing value reaching a numeric validator produces whichever
      // constraint class-validator happens to report first — "sessionCount
      // must not be greater than 100" for an EMPTY cell, in English. Catching
      // the absence first means the user is told which column to fill, in the
      // language the rest of the product speaks.
      if (rowErrors.length === 0) {
        rowErrors.push(...this.checkRequired(cells, candidate, rowNumber));
      }

      if (rowErrors.length === 0) {
        // The sheet still has one flat "N° de sesiones" / "Precio del
        // paquete" column each — a spreadsheet has no sensible way to
        // express the multi-paquete list the form now supports (same
        // reasoning as evaluationServiceId, see ImportServiceRowDto's doc
        // comment) — so an imported SESSIONS row always becomes exactly one
        // ServicePackageDto. Extra packages are added afterwards from the UI.
        this.applyPackageShape(candidate);
        this.applyPaymentMethodShape(candidate);
        rowErrors.push(...this.validateRow(candidate, rowNumber));
      }

      // Two rows naming the same service in the same category is a duplicated
      // paste, not two services. Different categories is legitimate — a
      // "Consulta" can exist under Facial and under Corporal.
      const fingerprint = `${normalizeHeader(String(candidate.name ?? ''))}|${normalizeHeader(
        String(candidate.categoryName ?? ''),
      )}`;
      if (rowErrors.length === 0) {
        if (seen.has(fingerprint)) {
          rowErrors.push({
            row: rowNumber,
            column: COLUMN_BY_KEY.get('name')?.header ?? 'Nombre del servicio',
            error: `"${String(candidate.name)}" ya aparece en otra fila con la misma categoría.`,
          });
        } else {
          seen.add(fingerprint);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      // Safe by construction: the row only reaches here after validateRow()
      // ran the DTO's decorators over it and reported nothing.
      const { categoryName, ...service } = candidate as unknown as ImportServiceRowDto;
      const categoryKey = categoryName.trim().toLowerCase();
      if (!knownCategories.has(categoryKey) && !newCategories.has(categoryKey)) {
        newCategories.set(categoryKey, categoryName.trim());
      }

      data.push({ row: rowNumber, categoryName: categoryName.trim(), service });
    }

    this.logger.log(
      `Importación analizada: ${data.length} fila(s) válida(s), ${errors.length} error(es).`,
    );

    return {
      successCount: data.length,
      totalRows,
      newCategoryNames: [...newCategories.values()],
      data,
      errors,
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
        // exceljs declares its own module-local `Buffer extends ArrayBuffer`,
        // which does not line up with Node's. The value passed at runtime is a
        // real Node Buffer, which is what exceljs actually expects.
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      }
    } catch {
      // A corrupt zip, an .xls saved from an ancient Excel, a PDF renamed.
      throw new BadRequestException(
        `No se pudo leer el archivo. Asegúrate de que sea ${ACCEPTED_EXTENSIONS.join(' o ')} y de haberlo guardado desde Excel.`,
      );
    }

    // Named sheet when the official template was used; first sheet otherwise,
    // so an export from another system still works.
    const sheet =
      workbook.getWorksheet(SHEET_SERVICES) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');

    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de servicios.');
    }
    return sheet;
  }

  /**
   * Maps each known column to the position it occupies in THIS file.
   *
   * Matching is by normalised header text, never by position, so a user who
   * reordered or renamed-with-accents the columns still imports cleanly. The
   * trailing " *" the template prints on required columns is stripped by the
   * same normalisation.
   */
  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(this.cellText(cell.value));
      if (!normalized) return;
      const column = SERVICE_COLUMNS.find(
        (candidate) => normalizeHeader(candidate.header) === normalized,
      );
      // First occurrence wins: a duplicated column is ignored rather than
      // silently overriding the one the user actually filled in.
      if (column && !map.has(column.key)) {
        map.set(column.key, columnNumber);
      }
    });

    return map;
  }

  /** Flattens every shape exceljs can hand back into plain trimmed text. */
  private cellText(value: CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();

    if (typeof value === 'object') {
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text).join('').trim();
      }
      // A formula cell carries its last computed result; the formula itself is
      // useless to us. Excel writes `result: undefined` when the file was
      // never recalculated, which correctly reads as an empty cell.
      if ('result' in value) return this.cellText(value.result as CellValue);
      if ('text' in value) return String(value.text).trim();
      if ('error' in value) return '';
    }

    return String(value).trim();
  }

  // -------------------------------------------------------------------------
  // Coerción y validación
  // -------------------------------------------------------------------------

  /** Turns the row's text into the types ImportServiceRowDto expects, pushing a
   *  cell-addressed error for anything that cannot be converted. */
  private coerceRow(
    cells: Map<string, string>,
    rowNumber: number,
    errors: ImportError[],
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const column of SERVICE_COLUMNS) {
      const raw = cells.get(column.key) ?? '';
      if (raw === '') continue;

      const fail = (message: string) => {
        errors.push({ row: rowNumber, column: column.header, error: message });
      };

      switch (column.kind) {
        case 'text':
        case 'longText':
        case 'category':
          output[column.key] = raw;
          break;

        case 'int': {
          const parsed = this.parseNumber(raw);
          if (parsed === null || !Number.isInteger(parsed)) {
            fail(`"${raw}" no es un número entero válido.`);
          } else {
            output[column.key] = parsed;
          }
          break;
        }

        case 'money': {
          const parsed = this.parseNumber(raw);
          if (parsed === null) {
            fail(`"${raw}" no es un monto válido. Usa solo números (ej. 199.90).`);
          } else if (parsed < 0) {
            fail('El monto no puede ser negativo.');
          } else {
            // Excel hands back 199.89999999999998 for a cell showing 199.90.
            // Rounding here keeps @IsNumber({maxDecimalPlaces: 2}) from
            // rejecting a price the user typed correctly.
            output[column.key] = Math.round(parsed * 100) / 100;
          }
          break;
        }

        case 'boolean': {
          const parsed = BOOLEAN_INDEX.get(normalizeHeader(raw));
          if (parsed === undefined) {
            fail(`"${raw}" no es válido. Escribe SÍ o NO.`);
          } else {
            output[column.key] = parsed;
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

    // Comma-separated tags become the String[] the model stores.
    if (typeof output.contraindications === 'string') {
      output.contraindications = output.contraindications
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    // Defaults that mirror the model's, so a sparsely filled row still lands
    // in a coherent state instead of relying on the DTO being lenient.
    output.structureType ??= ServiceStructureType.SINGLE;
    output.paymentMethod ??= ServicePaymentMethod.IN_PERSON;
    // Forced, not defaulted: a per-service schedule matrix has no sensible
    // spreadsheet representation, so every imported service follows the
    // branch's hours and can be switched to CUSTOM afterwards from the UI.
    output.availabilityType = ServiceAvailabilityType.GENERAL;

    return output;
  }

  /**
   * Empty cells that this row cannot do without: the ones the template marks
   * with `*`, plus the ones the chosen mode makes mandatory.
   *
   * Checked against the RAW cells for the always-required columns, so a
   * default applied during coercion cannot mask a blank the user was asked to
   * fill; and against the coerced row for the conditional ones, which depend
   * on values that may themselves have been defaulted.
   */
  private checkRequired(
    cells: Map<string, string>,
    candidate: Record<string, unknown>,
    rowNumber: number,
  ): ImportError[] {
    const errors: ImportError[] = [];
    const report = (key: string, message: string) => {
      errors.push({ row: rowNumber, column: COLUMN_BY_KEY.get(key)?.header ?? key, error: message });
    };

    for (const column of SERVICE_COLUMNS) {
      if (column.required && (cells.get(column.key) ?? '') === '') {
        report(column.key, `La columna "${column.header}" es obligatoria.`);
      }
    }
    if (errors.length > 0) return errors;

    if (candidate.structureType === ServiceStructureType.SESSIONS) {
      if (candidate.sessionCount === undefined) {
        report('sessionCount', 'Un paquete debe indicar cuántas sesiones incluye.');
      }
      if (candidate.packagePrice === undefined) {
        report('packagePrice', 'Un paquete debe indicar su precio total.');
      }
    }
    if (
      candidate.paymentMethod === ServicePaymentMethod.DEPOSIT &&
      candidate.depositAmount === undefined
    ) {
      report('depositAmount', 'Un servicio con anticipo debe indicar el monto a cobrar.');
    }

    return errors;
  }

  private parseEnum(column: ColumnDef, raw: string): string | boolean | undefined {
    const key = normalizeHeader(raw);
    if (column.key === 'structureType') return STRUCTURE_INDEX.get(key);
    if (column.key === 'paymentMethod') return PAYMENT_INDEX.get(key);
    if (column.key === 'isActive') return STATUS_INDEX.get(key);
    return undefined;
  }

  /**
   * Reads a number the way a person writes one in a Peruvian spreadsheet:
   * "S/ 1,299.90", "1299.9", "1.299,90".
   *
   * The ambiguous case is a lone comma. "1,50" is read as a decimal (Peru
   * writes 1.50, but the comma is a common slip and 1 vs 150 is a costly
   * difference), while "1,500" keeps its thousands reading.
   */
  private parseNumber(raw: string): number | null {
    let text = raw
      .replace(/S\/\.?/gi, '')
      .replace(/\s/g, '')
      .replace(/%/g, '');

    if (text === '') return null;

    const hasDot = text.includes('.');
    const hasComma = text.includes(',');

    if (hasDot && hasComma) {
      // Whichever separator comes last is the decimal one.
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

  /** Folds the row's flat sessionCount/frequencyDays/packagePrice cells into
   *  the single-element `packages` array ImportServiceRowDto now expects.
   *  Called only after checkRequired has confirmed those cells are present
   *  for a SESSIONS row, so the values being read here are never undefined. */
  private applyPackageShape(candidate: Record<string, unknown>): void {
    if (candidate.structureType === ServiceStructureType.SESSIONS) {
      candidate.packages = [
        {
          sessionCount: candidate.sessionCount,
          frequencyDays: candidate.frequencyDays,
          price: candidate.packagePrice,
        },
      ];
    }
    delete candidate.sessionCount;
    delete candidate.frequencyDays;
    delete candidate.packagePrice;
  }

  /** A spreadsheet cell can only name one payment method per row — the form
   *  is where a second one gets added afterwards, same reasoning as
   *  applyPackageShape above. */
  private applyPaymentMethodShape(candidate: Record<string, unknown>): void {
    candidate.paymentMethods = [candidate.paymentMethod ?? ServicePaymentMethod.IN_PERSON];
    delete candidate.paymentMethod;
  }

  /** Runs the shared DTO decorators over the coerced row. */
  private validateRow(candidate: Record<string, unknown>, rowNumber: number): ImportError[] {
    const instance = plainToInstance(ImportServiceRowDto, candidate);
    const failures = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      stopAtFirstError: true,
    });
    return failures.flatMap((failure) => this.toImportErrors(failure, rowNumber));
  }

  private toImportErrors(failure: ValidationError, rowNumber: number): ImportError[] {
    const column = COLUMN_BY_KEY.get(failure.property);
    const messages = Object.values(failure.constraints ?? {});
    return messages.map((message) => ({
      row: rowNumber,
      column: column?.header ?? failure.property,
      error: message,
    }));
  }
}
