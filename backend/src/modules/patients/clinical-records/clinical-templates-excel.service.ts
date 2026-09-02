import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Workbook, Worksheet } from 'exceljs';
import { CreateClinicalTemplateDto } from './dto/create-clinical-template.dto';
import { FORM_FIELD_TYPES } from './dto/clinical-form-field.dto';
import {
  buildClinicalTemplatesTemplate,
  SHEET_TEMPLATES,
  TEMPLATE_COLUMNS,
} from './clinical-templates-template.generator';

/** Values that read as "SÍ" when typed by hand — deliberately more generous
 *  than the template's own dropdown (SÍ/NO): a hand-edited cell, a .csv, or a
 *  hand-authored .json commonly uses "SI", "YES", "TRUE" or "1" instead.
 *  Anything else (including empty/null) reads as NO — Mapeo Facial has no
 *  invalid state, only true or false, mirroring `hasFaceMapping`'s optional,
 *  defaults-to-false contract on ClinicalFormTemplateSchemaDto. */
const FACE_MAPPING_TRUE_VALUES = new Set(['SI', 'SÍ', 'S', 'YES', 'TRUE', '1', 'X']);

function parseFaceMapping(raw: string): boolean {
  return FACE_MAPPING_TRUE_VALUES.has(raw.trim().toUpperCase());
}

export interface ImportError {
  /** 1-based row number as shown in Excel (or the array index for a .json
   *  upload, 1-based the same way so the preview table reads consistently). */
  row: number;
  column: string;
  error: string;
}

export type ImportRowStatus = 'valid' | 'duplicate' | 'error';

/** One row of the frontend's preview table — every template the file
 *  contained, valid or not (spec: "Tabla de vista previa de filas detectadas
 *  con badges de validación"), same contract as ImportPreviewRow in
 *  inventory-excel-import.service.ts. */
export interface ImportPreviewRow {
  row: number;
  name: string;
  category: string;
  fieldCount: number;
  status: ImportRowStatus;
  errors: string[];
}

export interface ParsedTemplateRow {
  row: number;
  template: CreateClinicalTemplateDto;
}

export interface ParseResult {
  successCount: number;
  duplicateCount: number;
  errors: ImportError[];
  data: ParsedTemplateRow[];
  rows: ImportPreviewRow[];
  totalRows: number;
}

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.xlsx', '.csv', '.json'] as const;

const COLUMN_BY_KEY = new Map(TEMPLATE_COLUMNS.map((column) => [column.key, column]));

/**
 * Exportación e Importación Masiva de Plantillas Clínicas (enriquecimiento de
 * Fase 4). A diferencia de excel-import.service.ts / inventory-excel-import.service.ts,
 * la unidad importada/exportada no es una fila plana: cada plantilla carga un
 * array `fields` de forma variable, que un spreadsheet no puede expresar en
 * columnas — se resuelve con una fila por plantilla, cargando la columna
 * "Campos (JSON)" con el array `fields` serializado. La escritura del .xlsx
 * (Plantillas + Instrucciones + Listas) vive en
 * clinical-templates-template.generator.ts; este archivo solo la invoca.
 *
 * La exportación (GET /clinical-templates/export) solo genera .xlsx — un
 * único formato es más simple para el usuario que elegir entre dos. La
 * importación sigue aceptando .json además de .xlsx/.csv (ACCEPTED_EXTENSIONS)
 * porque es un formato de entrada legítimo para quien arma el archivo a mano
 * o con otra herramienta, no solo el resultado de una exportación previa.
 */
@Injectable()
export class ClinicalTemplatesExcelService {
  private readonly logger = new Logger(ClinicalTemplatesExcelService.name);

  // -------------------------------------------------------------------------
  // Exportación
  // -------------------------------------------------------------------------

  /** GET /clinical-templates/export. */
  exportAsExcel(
    templates: { name: string; description: string | null; fieldsSchema: Record<string, unknown> }[],
  ): Promise<Buffer> {
    return buildClinicalTemplatesTemplate(templates);
  }

  // -------------------------------------------------------------------------
  // Importación
  // -------------------------------------------------------------------------

  /**
   * POST /clinical-templates/bulk-import — reads an uploaded .xlsx/.csv/.json
   * and reports it row by row. Pure: it validates and returns, it does not
   * write anything — persisting (and auto-creating missing categories) is
   * ClinicalRecordsService's job, so the same call powers both the dry-run
   * preview and the real import.
   */
  async parseAndValidate(
    buffer: Buffer,
    options: { existingNames?: string[]; filename?: string } = {},
  ): Promise<ParseResult> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (buffer.length > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 5 MB.');
    }

    const filename = (options.filename ?? '').toLowerCase();
    const candidates = filename.endsWith('.json')
      ? this.readJson(buffer)
      : await this.readSpreadsheet(buffer, filename);

    return this.validateCandidates(candidates, options.existingNames ?? []);
  }

  private readJson(buffer: Buffer): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('El archivo JSON no es válido.');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('El archivo JSON debe contener un arreglo de plantillas.');
    }
    // "No es necesario incluir la clave id" applies here too, not just to the
    // Excel path — a hand-authored .json is exactly the kind of file missing
    // ids most often.
    return parsed.map((candidate) => this.normalizeCandidateFields(candidate));
  }

  private async readSpreadsheet(buffer: Buffer, filename: string): Promise<unknown[]> {
    const isCsv = filename.endsWith('.csv');
    const workbook = new Workbook();
    try {
      if (isCsv) {
        const { Readable } = await import('stream');
        await workbook.csv.read(Readable.from(buffer));
      } else {
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      }
    } catch {
      throw new BadRequestException(
        `No se pudo leer el archivo. Asegúrate de que sea ${ACCEPTED_EXTENSIONS.join(', ')} y de haberlo guardado desde Excel.`,
      );
    }

    const sheet: Worksheet | undefined =
      workbook.getWorksheet(SHEET_TEMPLATES) ??
      workbook.worksheets.find((candidate) => candidate.state !== 'veryHidden');
    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('El archivo no contiene filas de plantillas.');
    }

    const headerMap = this.mapHeaders(sheet);
    const candidates: unknown[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const name = this.cellText(row.getCell(headerMap.get('name') ?? 1).value);
      const category = this.cellText(row.getCell(headerMap.get('category') ?? 2).value);
      const description = this.cellText(row.getCell(headerMap.get('description') ?? 3).value);
      const hasFaceMappingRaw = this.cellText(row.getCell(headerMap.get('hasFaceMapping') ?? 4).value);
      const fieldsRaw = this.cellText(row.getCell(headerMap.get('fields') ?? 5).value);

      if (!name && !category && !description && !hasFaceMappingRaw && !fieldsRaw) continue;

      // Pre-DTO checks reported ahead of validateCandidates' generic pass, so
      // a missing cell reads as "columna obligatoria" in Spanish rather than
      // whichever constraint class-validator happens to hit first for
      // `undefined` — same reasoning as checkRequired in
      // inventory-excel-import.service.ts. Mapeo Facial is deliberately NOT
      // checked here: it has no invalid/missing state, see
      // parseFaceMapping's doc comment.
      const preErrors: string[] = [];
      if (!name) preErrors.push(`La columna "${COLUMN_BY_KEY.get('name')?.header}" es obligatoria.`);
      if (!category) preErrors.push(`La columna "${COLUMN_BY_KEY.get('category')?.header}" es obligatoria.`);
      if (!fieldsRaw) preErrors.push(`La columna "${COLUMN_BY_KEY.get('fields')?.header}" es obligatoria.`);

      let fields: unknown = [];
      if (fieldsRaw) {
        try {
          fields = this.normalizeFields(JSON.parse(fieldsRaw));
        } catch {
          preErrors.push("El formato JSON de la columna 'Campos' no es válido. Revisa corchetes y comillas.");
        }
      }

      candidates.push({
        __row: rowNumber,
        __preErrors: preErrors,
        name,
        description: description || undefined,
        fieldsSchema: {
          category,
          hasFaceMapping: parseFaceMapping(hasFaceMappingRaw),
          fields,
        },
      });
    }
    return candidates;
  }

  private mapHeaders(sheet: Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, columnNumber) => {
      const text = this.normalizeHeader(this.cellText(cell.value));
      if (!text) return;
      const column = TEMPLATE_COLUMNS.find((candidate) => this.normalizeHeader(candidate.header) === text);
      if (column && !map.has(column.key)) {
        map.set(column.key, columnNumber);
      }
    });
    return map;
  }

  /** Accent/case-insensitive header key — same normalisation every other
   *  `*-excel-import.service.ts` in the codebase uses, duplicated rather than
   *  imported cross-module (each import pipeline stays self-contained). */
  private normalizeHeader(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  /** Tolerant pass over a parsed "Campos (JSON)" array, run before DTO
   *  validation so a hand-written cell doesn't need to be pixel-perfect:
   *    - assigns a fresh id to any field object missing one, mirroring the
   *      frontend Form Builder's own `crypto.randomUUID()` default
   *      (createEmptyClinicalFormField in validators/clinical-template.ts);
   *    - uppercases `type` when it matches one of FORM_FIELD_TYPES case-
   *      insensitively (ej. "text" -> "TEXT"), so the DTO's case-sensitive
   *      `@IsIn(FORM_FIELD_TYPES)` doesn't reject a lowercase type someone
   *      typed by hand. A `type` that still doesn't match anything is left
   *      as-is — ClinicalFormFieldDto's own validation reports that clearly.
   *  Presence of `label`/`type` themselves is NOT duplicated here: the DTO
   *  already reports "La etiqueta del campo es obligatoria." / "El tipo de
   *  campo no es válido." for those, same messages either way. */
  private normalizeFields(fields: unknown): unknown {
    if (!Array.isArray(fields)) return fields;
    const knownTypes = new Map(FORM_FIELD_TYPES.map((type) => [type.toUpperCase(), type]));

    return fields.map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return field;
      const obj = { ...(field as Record<string, unknown>) };

      if (typeof obj.id !== 'string' || obj.id.trim() === '') {
        obj.id = randomUUID();
      }
      if (typeof obj.type === 'string') {
        const matched = knownTypes.get(obj.type.trim().toUpperCase());
        if (matched) obj.type = matched;
      }

      return obj;
    });
  }

  private normalizeCandidateFields(candidate: unknown): unknown {
    if (!candidate || typeof candidate !== 'object') return candidate;
    const obj = candidate as Record<string, unknown>;
    const schema = obj.fieldsSchema;
    if (!schema || typeof schema !== 'object') return candidate;
    const schemaObj = schema as Record<string, unknown>;
    if (!Array.isArray(schemaObj.fields)) return candidate;
    return { ...obj, fieldsSchema: { ...schemaObj, fields: this.normalizeFields(schemaObj.fields) } };
  }

  private cellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('richText' in obj && Array.isArray(obj.richText)) {
        return (obj.richText as { text: string }[]).map((part) => part.text).join('').trim();
      }
      if ('result' in obj) return this.cellText(obj.result);
      if ('text' in obj) return String(obj.text).trim();
      if ('error' in obj) return '';
    }
    return String(value).trim();
  }

  // -------------------------------------------------------------------------
  // Validación
  // -------------------------------------------------------------------------

  private validateCandidates(candidates: unknown[], existingNames: string[]): ParseResult {
    if (candidates.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `El archivo supera el máximo de ${MAX_IMPORT_ROWS} plantillas por carga.`,
      );
    }

    const errors: ImportError[] = [];
    const data: ParsedTemplateRow[] = [];
    const rows: ImportPreviewRow[] = [];
    const knownNames = new Set(existingNames.map((name) => name.trim().toLowerCase()));
    const seen = new Set<string>();
    let duplicateCount = 0;

    candidates.forEach((raw, index) => {
      const candidate = raw as Record<string, unknown> & { __row?: number; __preErrors?: string[] };
      const rowNumber = candidate.__row ?? index + 1;

      const preview: ImportPreviewRow = {
        row: rowNumber,
        name: typeof candidate.name === 'string' ? candidate.name : '',
        category:
          typeof candidate.fieldsSchema === 'object' && candidate.fieldsSchema !== null
            ? String((candidate.fieldsSchema as Record<string, unknown>).category ?? '')
            : '',
        fieldCount: Array.isArray((candidate.fieldsSchema as Record<string, unknown> | undefined)?.fields)
          ? ((candidate.fieldsSchema as Record<string, unknown>).fields as unknown[]).length
          : 0,
        status: 'valid',
        errors: [],
      };

      const rowErrors: string[] = [...(candidate.__preErrors ?? [])];

      const plain = { name: candidate.name, description: candidate.description, fieldsSchema: candidate.fieldsSchema };
      const instance = plainToInstance(CreateClinicalTemplateDto, plain);
      const failures = validateSync(instance, {
        whitelist: true,
        forbidNonWhitelisted: false,
        stopAtFirstError: true,
      });
      rowErrors.push(...this.flattenValidationErrors(failures));

      let isDuplicate = false;
      if (rowErrors.length === 0) {
        const nameKey = String(candidate.name).trim().toLowerCase();
        if (seen.has(nameKey) || knownNames.has(nameKey)) {
          isDuplicate = true;
          duplicateCount += 1;
          rowErrors.push(`Ya existe una plantilla llamada "${candidate.name}" — se omitirá esta fila.`);
        } else {
          seen.add(nameKey);
        }
      }

      if (rowErrors.length > 0) {
        for (const message of rowErrors) {
          errors.push({ row: rowNumber, column: '', error: message });
        }
        preview.status = isDuplicate ? 'duplicate' : 'error';
        preview.errors = rowErrors;
        rows.push(preview);
        return;
      }

      data.push({ row: rowNumber, template: instance });
      rows.push(preview);
    });

    this.logger.log(
      `Importación de plantillas clínicas analizada: ${data.length} fila(s) válida(s), ` +
        `${duplicateCount} duplicada(s), ${errors.length} error(es).`,
    );

    return { successCount: data.length, duplicateCount, errors, data, rows, totalRows: candidates.length };
  }

  private flattenValidationErrors(failures: ValidationError[], prefix = ''): string[] {
    const messages: string[] = [];
    for (const failure of failures) {
      if (failure.constraints) {
        messages.push(...Object.values(failure.constraints));
      }
      if (failure.children && failure.children.length > 0) {
        messages.push(...this.flattenValidationErrors(failure.children, `${prefix}${failure.property}.`));
      }
    }
    return messages;
  }
}
