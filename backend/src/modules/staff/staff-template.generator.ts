import { Workbook, Worksheet } from 'exceljs';
import { normalizeHeader, STATUS_LABELS } from '../services/services-template.generator';

/**
 * Carga masiva de personal (Módulo 04, siguiendo el mismo patrón que
 * services-template.generator.ts para el Módulo 03).
 *
 * The column catalogue below is the single source of truth for BOTH the
 * generated template and the parser in StaffExcelImportService — same
 * reasoning as SERVICE_COLUMNS: describing the columns twice is how a
 * template stops matching the importer that reads it.
 */

export type StaffColumnKind = 'text' | 'money' | 'enum' | 'category';

export interface StaffColumnDef {
  /** Property produced by the parser. */
  key: string;
  /** Header text written to row 1 and matched (accent/case-insensitive) on read. */
  header: string;
  kind: StaffColumnKind;
  required: boolean;
  width: number;
  /** Shown in the "Instrucciones" sheet and as a cell tooltip. */
  help: string;
  /** Accepted labels for `enum` columns, in display order. */
  options?: readonly string[];
}

export const SHEET_STAFF = 'Personal';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Rows pre-formatted with dropdowns. Beyond this the sheet still imports, it
 *  just loses the pick-lists — same trade-off as TEMPLATE_DATA_ROWS in
 *  services-template.generator.ts. */
export const TEMPLATE_DATA_ROWS = 300;

export const STAFF_COLUMNS: StaffColumnDef[] = [
  {
    key: 'firstName',
    header: 'Nombres',
    kind: 'text',
    required: true,
    width: 24,
    help: 'Nombre(s) del profesional. Máximo 100 caracteres.',
  },
  {
    key: 'lastName',
    header: 'Apellidos',
    kind: 'text',
    required: true,
    width: 24,
    help: 'Apellido(s) del profesional. Máximo 100 caracteres.',
  },
  {
    key: 'specialtyName',
    header: 'Especialidad',
    kind: 'category',
    required: false,
    width: 26,
    help: 'Elige una de la lista o escribe una nueva: si no existe, se creará automáticamente. Déjalo vacío si no aplica.',
  },
  {
    key: 'medicalLicense',
    header: 'N° de colegiatura / licencia',
    kind: 'text',
    required: false,
    width: 28,
    help: 'Ej. CMP-12345. Máximo 50 caracteres.',
  },
  {
    key: 'commissionPercentage',
    header: 'Comisión (%)',
    kind: 'money',
    required: false,
    width: 16,
    help: 'Porcentaje que recibe el profesional por cada servicio. Solo números, ej. 15 o 15.50.',
  },
  {
    key: 'serviceNames',
    header: 'Servicios habilitados',
    kind: 'text',
    required: false,
    width: 50,
    help: 'Nombres de servicios YA EXISTENTES en tu catálogo, separados por coma. Deben coincidir exactamente con "Servicios". Los servicios en sí no se crean desde aquí.',
  },
  {
    key: 'isActive',
    header: 'Estado',
    kind: 'enum',
    required: false,
    width: 13,
    help: 'ACTIVO (por defecto) o INACTIVO para cargarlo sin publicarlo todavía.',
    options: Object.keys(STATUS_LABELS),
  },
];

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';

/**
 * Builds the .xlsx returned by GET /staff/export-template.
 *
 * `specialties` and `serviceNames` are the tenant's existing names: they
 * become the dropdown for "Especialidad" (new ones are created on import,
 * same as Servicios' categoría) and the reference list shown for "Servicios
 * habilitados" (those must already exist — see the column's help text).
 */
export async function buildStaffTemplate(
  specialties: string[],
  serviceNames: string[],
): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_STAFF, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  writeStaffSheet(sheet, specialties);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS), specialties, serviceNames);

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writeStaffSheet(sheet: Worksheet, specialties: string[]): void {
  sheet.columns = STAFF_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  // Example row written BEFORE the styling loop — addRow() appends after the
  // last existing row, and getCell() below materialises every row it
  // touches (same ordering note as services-template.generator.ts).
  sheet.addRow({
    firstName: 'Ana',
    lastName: 'Pérez',
    specialtyName: specialties[0] ?? 'Dermatología',
    medicalLicense: 'CMP-12345',
    commissionPercentage: 15,
    serviceNames: '',
    isActive: 'ACTIVO',
  });

  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = { bottom: { style: 'medium', color: { argb: ACCENT } } };
  });

  STAFF_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;
    sheet.getCell(1, columnNumber).note = column.help;

    for (let rowNumber = 2; rowNumber <= TEMPLATE_DATA_ROWS + 1; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);

      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.kind === 'money') {
        cell.numFmt = '0.00';
      }
      if (column.options) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: !column.required,
          formulae: [`"${column.options.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Valor no permitido',
          error: `Usa una de las opciones: ${column.options.join(' / ')}`,
        };
      }
      if (column.key === 'specialtyName' && specialties.length > 0) {
        cell.dataValidation = {
          type: 'list',
          // allowBlank AND showErrorMessage:false on purpose: a brand-new
          // especialidad typed by hand must be accepted, since the importer
          // creates the missing ones — same as Servicios' Categoría.
          allowBlank: true,
          formulae: [`=${SHEET_LISTS}!$A$2:$A$${specialties.length + 1}`],
          showErrorMessage: false,
        };
      }
    }
  });

  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
}

function writeInstructions(sheet: Worksheet): void {
  sheet.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 14 },
    { key: 'c', width: 86 },
  ];

  const title = sheet.addRow(['Plantilla de carga masiva de personal']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const intro = [
    'Llena la hoja "Personal". Una fila por profesional.',
    'Las columnas marcadas con * son obligatorias; las demás puedes dejarlas vacías.',
    'No cambies los nombres de las columnas ni borres la fila de encabezados: el sistema las reconoce por su nombre, así que puedes reordenarlas si lo necesitas.',
    'La fila 2 es un ejemplo. Bórrala o reemplázala con tus datos.',
    'Si escribes una especialidad que aún no existe, se creará automáticamente al importar.',
    'La columna "Servicios habilitados" solo acepta servicios que YA existen en tu catálogo (Módulo de Servicios). Sepáralos con coma, ej: "Limpieza facial, Masaje relajante".',
    'El horario semanal y la foto de perfil no se cargan desde esta plantilla: se configuran después, desde el perfil del profesional.',
    'Antes de guardar nada, el sistema te mostrará una vista previa con los errores fila por fila.',
  ];
  for (const line of intro) {
    const row = sheet.addRow(['', '•', line]);
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.addRow([]);
  const header = sheet.addRow(['Columna', '¿Obligatoria?', 'Cómo llenarla']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });

  for (const column of STAFF_COLUMNS) {
    const row = sheet.addRow([column.header, column.required ? 'Sí' : 'No', column.help]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (column.required) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFB45309' } };
    }
  }
}

function writeLists(sheet: Worksheet, specialties: string[], serviceNames: string[]): void {
  sheet.columns = [
    { header: 'Especialidades', key: 'specialties', width: 30 },
    { header: 'Servicios existentes', key: 'services', width: 40 },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  const columns: string[][] = [specialties, serviceNames, Object.keys(STATUS_LABELS)];

  const depth = Math.max(...columns.map((values) => values.length));
  for (let index = 0; index < depth; index += 1) {
    sheet.addRow(columns.map((values) => values[index] ?? null));
  }

  // Support data — hidden so it does not read as a sheet the user must fill.
  sheet.state = 'veryHidden';
}

export { normalizeHeader };
