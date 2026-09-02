import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import { Readable } from 'stream';
import { ImportProductRowDto } from './dto/import-product-row.dto';
import {
  ColumnDef,
  normalizeHeader,
  PRODUCT_COLUMNS,
  PRODUCT_TYPE_LABELS,
  SHEET_PRODUCTS,
  STATUS_LABELS,
  buildInventoryTemplate,
} from './inventory-template.generator';

/** One problem, addressed to a specific cell so the user can go fix it. */
export interface ImportError {
  /** 1-based row number as shown in Excel. 1 = the header row. */
  row: number;
  /** Column header as printed in the template, or '' for whole-row problems. */
  column: string;
  error: string;
}

export type ImportRowStatus = 'valid' | 'duplicate' | 'error';

/** One row of the frontend's preview table — every row the file contained,
 *  valid or not, so the dialog can render one badge per row (spec: "Tabla de
 *  vista previa de filas detectadas con badges de validación"). Values are
 *  the raw cell text, not the coerced/typed value, so a row that failed to
 *  parse can still be displayed instead of showing blanks. */
export interface ImportPreviewRow {
  row: number;
  sku: string;
  name: string;
  type: string;
  unitOfMeasure: string;
  minStock: string;
  costPrice: string;
  salePrice: string;
  status: ImportRowStatus;
  errors: string[];
}

/** A row that passed every check, ready to become a Product (and, if
 *  `initialStock` is set, its opening InventoryBatch + Kardex row too). */
export interface ParsedProductRow {
  row: number;
  product: ImportProductRowDto;
}

export interface ParseResult {
  successCount: number;
  duplicateCount: number;
  errors: ImportError[];
  data: ParsedProductRow[];
  rows: ImportPreviewRow[];
  /** Data rows examined, blank ones excluded. */
  totalRows: number;
  /** Category names not yet in the catalogue — InventoryService creates
   *  these before writing the products that reference them (same "resolve
   *  by name, auto-create the rest" contract as Services/Staff). */
  newCategoryNames: string[];
}

/** Beyond this the import is refused outright — same reasoning as
 *  MAX_IMPORT_ROWS in services/excel-import.service.ts. */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv'] as const;

function labelIndex<T>(labels: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(labels).map(([label, value]) => [normalizeHeader(label), value]));
}

const TYPE_INDEX = labelIndex<string>(PRODUCT_TYPE_LABELS);
const STATUS_INDEX = labelIndex<boolean>(STATUS_LABELS);

const COLUMN_BY_KEY = new Map(PRODUCT_COLUMNS.map((column) => [column.key, column]));

@Injectable()
export class InventoryExcelImportService {
  private readonly logger = new Logger(InventoryExcelImportService.name);

  /** GET /inventory/products/template. `existingSkus`/`categories` seed the
   *  "Listas" reference sheet (see inventory-template.generator.ts's doc
   *  comment). */
  generateTemplate(existingSkus: string[], categories: string[]): Promise<Buffer> {
    return buildInventoryTemplate(existingSkus, categories);
  }

  /**
   * POST /inventory/products/bulk-import — reads an uploaded .xlsx/.csv and
   * reports it row by row.
   *
   * Pure: it validates and returns, it does not write anything — persisting
   * is InventoryService's job, which is what lets the same call power both
   * the dry-run preview and the real import.
   */
  async parseAndValidateExcel(
    buffer: Buffer,
    options: { existingSkus?: string[]; existingCategories?: string[]; filename?: string } = {},
  ): Promise<ParseResult> {
    const sheet = await this.readSheet(buffer, options.filename);
    const errors: ImportError[] = [];
    const data: ParsedProductRow[] = [];
    const rows: ImportPreviewRow[] = [];

    const headerMap = this.mapHeaders(sheet);
    const missingRequired = PRODUCT_COLUMNS.filter(
      (column) => column.required && !headerMap.has(column.key),
    );
    if (missingRequired.length > 0) {
      return {
        successCount: 0,
        duplicateCount: 0,
        totalRows: 0,
        data: [],
        rows: [],
        newCategoryNames: [],
        errors: missingRequired.map((column) => ({
          row: 1,
          column: column.header,
          error: `Falta la columna obligatoria "${column.header}" en el archivo.`,
        })),
      };
    }

    const knownSkus = new Set((options.existingSkus ?? []).map((sku) => sku.trim().toLowerCase()));
    const knownCategories = new Set(
      (options.existingCategories ?? []).map((name) => normalizeHeader(name)),
    );
    const newCategories = new Map<string, string>();
    const seen = new Set<string>();
    let totalRows = 0;
    let duplicateCount = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells = new Map<string, string>();
      for (const [key, columnNumber] of headerMap) {
        cells.set(key, this.cellText(row.getCell(columnNumber).value));
      }

      // Excel readily reports thousands of "rows" that only ever held
      // formatting. Anything with no content at all is skipped rather than
      // reported as a wall of missing fields.
      if ([...cells.values()].every((value) => value === '')) {
        continue;
      }

      totalRows += 1;
      if (totalRows > MAX_IMPORT_ROWS) {
        errors.push({
          row: rowNumber,
          column: '',
          error: `El archivo supera el máximo de ${MAX_IMPORT_ROWS} productos por carga.`,
        });
        break;
      }

      const preview: ImportPreviewRow = {
        row: rowNumber,
        sku: cells.get('sku') ?? '',
        name: cells.get('name') ?? '',
        type: cells.get('type') ?? '',
        unitOfMeasure: cells.get('unitOfMeasure') ?? '',
        minStock: cells.get('minStock') ?? '',
        costPrice: cells.get('costPrice') ?? '',
        salePrice: cells.get('salePrice') ?? '',
        status: 'valid',
        errors: [],
      };

      const rowErrors: ImportError[] = [];
      const candidate = this.coerceRow(cells, rowNumber, rowErrors);

      // Checked before the DTO runs, same reasoning as ExcelImportService's
      // checkRequired: an empty required cell should say "columna es
      // obligatoria" in Spanish, not whichever numeric constraint
      // class-validator happens to report first for `undefined`.
      if (rowErrors.length === 0) {
        rowErrors.push(...this.checkRequired(cells, rowNumber));
      }
      // Cross-field: an opening lote needs both its number and expiry, and
      // only makes sense once there is stock to put in it (spec §1.3/§3).
      if (rowErrors.length === 0) {
        rowErrors.push(...this.checkBatchConsistency(candidate, rowNumber));
      }
      if (rowErrors.length === 0) {
        rowErrors.push(...this.validateRow(candidate, rowNumber));
      }

      // A repeated SKU is reported distinctly from a formatting error so the
      // preview table can badge it "SKU duplicado" instead of a generic
      // error (spec: "badges de validación... errores de formato o SKU
      // duplicado"). Checked only once the row is otherwise clean, so a
      // malformed SKU cell reports its format problem first.
      let isDuplicate = false;
      if (rowErrors.length === 0) {
        const sku = String(candidate.sku ?? '');
        const skuKey = sku.trim().toLowerCase();
        if (seen.has(skuKey) || knownSkus.has(skuKey)) {
          isDuplicate = true;
          duplicateCount += 1;
          rowErrors.push({
            row: rowNumber,
            column: COLUMN_BY_KEY.get('sku')?.header ?? 'SKU',
            error: `El SKU "${sku}" ya está en uso — se omitirá esta fila.`,
          });
        } else {
          seen.add(skuKey);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        preview.status = isDuplicate ? 'duplicate' : 'error';
        preview.errors = rowErrors.map((error) => error.error);
        rows.push(preview);
        continue;
      }

      // Tracked once the row is otherwise clean — same "resolve by name,
      // dedupe across the whole file" contract as Staff's specialtyName.
      const categoryName = typeof candidate.categoryName === 'string' ? candidate.categoryName.trim() : '';
      if (categoryName) {
        const categoryKey = normalizeHeader(categoryName);
        if (!knownCategories.has(categoryKey) && !newCategories.has(categoryKey)) {
          newCategories.set(categoryKey, categoryName);
        }
      }

      // Safe by construction: the row only reaches here after validateRow()
      // ran the DTO's decorators over it and reported nothing.
      const product = candidate as unknown as ImportProductRowDto;
      data.push({ row: rowNumber, product });
      rows.push(preview);
    }

    this.logger.log(
      `Importación de inventario analizada: ${data.length} fila(s) válida(s), ` +
        `${duplicateCount} duplicada(s), ${errors.length} error(es).`,
    );

    return {
      successCount: data.length,
      duplicateCount,
      totalRows,
      data,
      rows,
      errors,
      newCategoryNames: [...newCategories.values()],
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
        // which does not line up with Node's. The value passed at runtime is
        // a real Node Buffer, which is what exceljs actually expects.
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      }
    } catch {
      throw new BadRequestException(
        `No se pudo leer el archivo. Asegúrate de que sea ${ACCEPTED_EXTENSIONS.join(' o ')} y de haberlo guardado desde Excel.`,
      );
    }

    const sheet =
      workbook.getWorksheet(SHEET_PRODUCTS) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');

    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de productos.');
    }
    return sheet;
  }

  /** Matches by normalised header text, never by position — same contract as
   *  ExcelImportService.mapHeaders. */
  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);

    headerRow.eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(this.cellText(cell.value));
      if (!normalized) return;
      const column = PRODUCT_COLUMNS.find(
        (candidate) => normalizeHeader(candidate.header) === normalized,
      );
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
    errors: ImportError[],
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const column of PRODUCT_COLUMNS) {
      const raw = cells.get(column.key) ?? '';
      if (raw === '') continue;

      const fail = (message: string) => {
        errors.push({ row: rowNumber, column: column.header, error: message });
      };

      switch (column.kind) {
        case 'text':
        case 'category':
          output[column.key] = raw;
          break;

        case 'money':
        case 'decimal': {
          const parsed = this.parseNumber(raw);
          if (parsed === null) {
            fail(`"${raw}" no es un número válido. Usa solo números (ej. 45.50).`);
          } else if (parsed < 0) {
            fail('El valor no puede ser negativo.');
          } else {
            // Excel hands back 45.499999999999996 for a cell showing 45.50.
            // Rounding here keeps @IsNumber({maxDecimalPlaces: 2}) from
            // rejecting a value the user typed correctly.
            output[column.key] = Math.round(parsed * 100) / 100;
          }
          break;
        }

        case 'date': {
          const parsed = this.parseFlexibleDate(raw);
          if (!parsed) {
            fail(`"${raw}" no es una fecha válida. Usa AAAA-MM-DD.`);
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

    return output;
  }

  /** Empty cells this row cannot do without — the ones the template marks
   *  with `*`. Checked against the RAW cells, not the coerced row, so a
   *  missing value is never masked by a default. */
  private checkRequired(cells: Map<string, string>, rowNumber: number): ImportError[] {
    const errors: ImportError[] = [];
    for (const column of PRODUCT_COLUMNS) {
      if (column.required && (cells.get(column.key) ?? '') === '') {
        errors.push({
          row: rowNumber,
          column: column.header,
          error: `La columna "${column.header}" es obligatoria.`,
        });
      }
    }
    return errors;
  }

  /** Stock Inicial > 0 needs a lote to land in — N° de Lote and Fecha de
   *  Vencimiento are NOT NULL on InventoryBatch, so this is enforced here
   *  rather than left as the "recomendado" wording in the sheet (spec §1.3:
   *  "creará automáticamente el lote y el primer movimiento de kardex"). */
  private checkBatchConsistency(candidate: Record<string, unknown>, rowNumber: number): ImportError[] {
    const initialStock = typeof candidate.initialStock === 'number' ? candidate.initialStock : 0;
    if (initialStock <= 0) return [];

    const errors: ImportError[] = [];
    if (!candidate.lotNumber) {
      errors.push({
        row: rowNumber,
        column: COLUMN_BY_KEY.get('lotNumber')?.header ?? 'N° de Lote',
        error: 'El N° de Lote es obligatorio cuando el Stock Inicial es mayor a 0.',
      });
    }
    if (!candidate.expirationDate) {
      errors.push({
        row: rowNumber,
        column: COLUMN_BY_KEY.get('expirationDate')?.header ?? 'Fecha de Vencimiento',
        error: 'La Fecha de Vencimiento es obligatoria cuando el Stock Inicial es mayor a 0.',
      });
    }
    return errors;
  }

  private parseEnum(column: ColumnDef, raw: string): string | boolean | undefined {
    const key = normalizeHeader(raw);
    if (column.key === 'type') return TYPE_INDEX.get(key);
    if (column.key === 'unitOfMeasure') {
      return (column.options ?? []).find((option) => normalizeHeader(option) === key);
    }
    if (column.key === 'isActive') return STATUS_INDEX.get(key);
    return undefined;
  }

  /** Reads a number the way a person writes one in a Peruvian spreadsheet —
   *  identical logic to ExcelImportService.parseNumber. */
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

  /** Tolerant date reader — identical logic to
   *  PatientsExcelImportService.parseFlexibleDate, duplicated rather than
   *  imported cross-module (each import pipeline stays self-contained, same
   *  rationale as StaffExcelImportService's parseNumber). Unlike Patients'
   *  version, DD/MM/AAAA is not offered here: the template's own dropdown-
   *  adjacent cell format only ever produces AAAA-MM-DD or an Excel serial. */
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

    // A bare Excel serial: plausible range only (year ~1970-2100).
    if (/^\d{4,6}$/.test(trimmed)) {
      const serial = Number(trimmed);
      if (serial < 25569 || serial > 73050) return null;
      const epoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(epoch + serial * 86400000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  /** Runs the shared DTO decorators over the coerced row. Also covers the
   *  conditional "Precio de Venta obligatorio si Tipo vende" rule, since
   *  ImportProductRowDto inherits CreateProductDto's @ValidateIf on
   *  `salePrice`. */
  private validateRow(candidate: Record<string, unknown>, rowNumber: number): ImportError[] {
    const instance = plainToInstance(ImportProductRowDto, candidate);
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
