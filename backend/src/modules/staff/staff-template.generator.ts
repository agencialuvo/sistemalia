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

/** Spanish label shown in the sheet -> Prisma StaffDocumentType. Same
 *  label-map convention as STRUCTURE_LABELS/COMMISSION_LABELS in
 *  services-template.generator.ts. */
export const DOCUMENT_TYPE_LABELS = { DNI: 'DNI', CE: 'CE', PASAPORTE: 'PASSPORT' } as const;

/** Typed into "Servicios habilitados" to mean "every service currently
 *  active in the catalogue", instead of listing them all by name. Resolved
 *  at write time (StaffMembersService.importFromExcel), not by the parser,
 *  because "which services are active" can change between the dry-run
 *  preview and the confirm click. */
export const SERVICES_WILDCARD_ALL = 'TODOS';

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
    key: 'documentType',
    header: 'Tipo de Documento',
    kind: 'enum',
    required: false,
    width: 18,
    help: 'Elige DNI, CE (Carné de Extranjería) o PASAPORTE. Déjalo vacío si no aplica.',
    options: Object.keys(DOCUMENT_TYPE_LABELS),
  },
  {
    key: 'documentNumber',
    header: 'N° de Documento',
    kind: 'text',
    required: false,
    width: 20,
    help: 'Número del documento elegido en la columna anterior. Máximo 20 caracteres.',
  },
  {
    key: 'medicalLicense',
    header: 'N° colegiatura / licencia',
    kind: 'text',
    required: false,
    width: 26,
    help: 'Ej. CMP-12345. Máximo 50 caracteres.',
  },
  {
    key: 'googleEmail',
    header: 'Correo de Google / Email',
    kind: 'text',
    required: false,
    width: 30,
    help: 'Correo del profesional. Se usa para vincular su agenda de Google Calendar y para notificaciones relacionadas a sus citas.',
  },
  {
    key: 'phone',
    header: 'Teléfono / WhatsApp',
    kind: 'text',
    required: false,
    width: 22,
    help: 'Solo el número local, sin +51 (ej. 987654321): el sistema agrega el código de país automáticamente. Se usa para enviarle su agenda diaria por WhatsApp.',
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
    key: 'avatarUrl',
    header: 'Foto de perfil (link)',
    kind: 'text',
    required: false,
    width: 40,
    help: 'Pega aquí el link de una imagen ya subida en el menú "Medios": ábrela, copia su link y pégalo en esta columna. Debe ser una URL completa (empieza con http:// o https://).',
  },
  {
    key: 'commissionPercentage',
    header: 'Comisión base (%)',
    kind: 'money',
    required: false,
    width: 18,
    help: 'Porcentaje que recibe el profesional por cada servicio. Solo números, ej. 15 o 15.50.',
  },
  {
    key: 'serviceNames',
    header: 'Servicios habilitados',
    kind: 'text',
    required: false,
    width: 50,
    help: `Nombres de servicios YA EXISTENTES en tu catálogo, separados por coma. Déjalo vacío o escribe "${SERVICES_WILDCARD_ALL}" para habilitar automáticamente todos los servicios activos del catálogo, sin escribirlos uno a uno. Los servicios en sí no se crean desde aquí; un nombre que no coincida se reporta como advertencia y se omite, sin bloquear al resto de la fila.`,
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
    documentType: 'DNI',
    documentNumber: '45678912',
    medicalLicense: 'CMP-12345',
    googleEmail: 'ana.perez@example.com',
    phone: '987654321',
    specialtyName: specialties[0] ?? 'Dermatología',
    avatarUrl: '',
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
      if (column.key === 'avatarUrl') {
        const cellRef = `${columnLetter(columnNumber)}${rowNumber}`;
        cell.dataValidation = {
          type: 'custom',
          allowBlank: true,
          formulae: [`=OR(${cellRef}="",LEFT(${cellRef},4)="http")`],
          showErrorMessage: true,
          errorTitle: 'Link no válido',
          error: 'El link debe empezar con http:// o https:// (cópialo desde el menú "Medios").',
        };
      }
    }
  });

  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
}

/** 1-based column index -> spreadsheet letter (1 -> A, 27 -> AA). Same helper
 *  as services-template.generator.ts, duplicated rather than shared. */
function columnLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Friendlier, example-rich text for the reference table below — overrides
 *  the column's `help` (written primarily as an in-sheet cell tooltip) for
 *  the columns the spec calls out by name. Columns not listed here fall back
 *  to `column.help`. Same pattern as INSTRUCTION_EXAMPLES in
 *  services-template.generator.ts. */
const INSTRUCTION_EXAMPLES: Partial<Record<string, string>> = {
  firstName: 'Nombre(s) del profesional. Ej: "Ana".',
  lastName: 'Apellido(s) del profesional. Ej: "Pérez".',
  documentType: 'Elige DNI, CE o PASAPORTE desde la lista.',
  documentNumber: 'Número del documento elegido. Ej: "45678912".',
  medicalLicense: 'N° de colegiatura o licencia profesional, si aplica. Ej: "CMP-12345".',
  googleEmail: 'Correo del profesional. Ej: "ana.perez@centro.com".',
  phone: 'Solo el número local, sin +51 — el sistema lo agrega solo. Ej: "987654321".',
  specialtyName: 'Selecciona o escribe la especialidad. Ej: "Dermatología". Si no existe, se crea automáticamente.',
  avatarUrl: 'Link público de la foto, copiado desde el menú Medios. Debe empezar con http:// o https://.',
  commissionPercentage: 'Porcentaje de comisión, hasta 2 decimales. Ej: "15.00".',
  serviceNames: `Nombres de servicios existentes separados por coma. Vacío o "${SERVICES_WILDCARD_ALL}" habilita todos los activos.`,
  isActive: 'Selecciona ACTIVO o INACTIVO.',
};

/** Bold lead-in + plain continuation in a single cell — same helper as
 *  services-template.generator.ts's leadInText. */
function leadInText(number: number, lead: string, rest: string) {
  return {
    richText: [
      { font: { bold: true, color: { argb: BRAND } }, text: `${number}. ${lead}: ` },
      { text: rest },
    ],
  };
}

function writeInstructions(sheet: Worksheet): void {
  sheet.columns = [
    { key: 'a', width: 8 },
    { key: 'b', width: 26 },
    { key: 'c', width: 92 },
  ];

  const title = sheet.addRow(['Plantilla de carga masiva de personal']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const subtitle = sheet.addRow(['Reglas generales de llenado']);
  subtitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
  sheet.addRow([]);

  const rules: Array<[string, string]> = [
    [
      'Filas y Datos',
      'Llena la hoja "Personal". Registra un profesional por fila. No elimines ni modifiques la fila de encabezados (Fila 1), que además queda inmovilizada al desplazarte.',
    ],
    [
      'Campos Obligatorios',
      'Las columnas marcadas con un asterisco (*) son requeridas. Las demás son opcionales.',
    ],
    [
      'Documento de Identidad',
      'Elige el Tipo de Documento (DNI, CE o PASAPORTE) desde la lista desplegable y escribe el número en la columna siguiente.',
    ],
    [
      'Listas Desplegables',
      'Usa los desplegables habilitados en las celdas para Tipo de Documento y Estado.',
    ],
    [
      'Foto de perfil',
      'La URL debe ser un enlace web público (http:// o https://) obtenido desde el Módulo de Medios: ábrela, copia su link y pégalo en esa columna. El sistema te avisará si el link no empieza con http.',
    ],
    [
      'Comisión base (%)',
      'Ingresa solo números con hasta 2 decimales (ej. 15.00). No incluyas el símbolo "%".',
    ],
    [
      'Teléfono / WhatsApp',
      'Escribe solo el número local, sin +51 (ej. 987654321): el sistema agrega el código de país automáticamente.',
    ],
    [
      'Servicios habilitados',
      `Escribe los nombres de servicios YA EXISTENTES en tu catálogo, separados por coma. Déjalo vacío o escribe la palabra "${SERVICES_WILDCARD_ALL}" para habilitar automáticamente todos los servicios activos del catálogo, sin tener que escribirlos uno a uno. Un nombre que no coincida se reporta como advertencia y se omite — no bloquea al profesional.`,
    ],
    [
      'Especialidad',
      'Si escribes una especialidad que aún no existe, se creará automáticamente al importar.',
    ],
    [
      'Horario',
      'El horario semanal no se carga desde esta plantilla: se configura después, desde el perfil del profesional.',
    ],
  ];
  rules.forEach(([lead, rest], index) => {
    const row = sheet.addRow(['', leadInText(index + 1, lead, rest), '']);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    sheet.mergeCells(row.number, 2, row.number, 3);
  });

  sheet.addRow([]);
  const tableHeader = sheet.addRow(['Columna', '¿Obligatorio?', 'Instrucción / Ejemplo']);
  tableHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tableHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });

  for (const column of STAFF_COLUMNS) {
    const label = column.required ? `${column.header} *` : column.header;
    const instruction = INSTRUCTION_EXAMPLES[column.key] ?? column.help;
    const row = sheet.addRow([label, column.required ? 'SÍ' : 'OPCIONAL', instruction]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(2).font = column.required
      ? { bold: true, color: { argb: 'FFB45309' } }
      : { color: { argb: 'FF64748B' } };
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    '',
    '',
    'Antes de guardar nada, el sistema te mostrará una vista previa con los errores fila por fila.',
  ]);
  note.getCell(3).font = { italic: true, color: { argb: 'FF64748B' } };
  note.getCell(3).alignment = { wrapText: true, vertical: 'top' };
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
