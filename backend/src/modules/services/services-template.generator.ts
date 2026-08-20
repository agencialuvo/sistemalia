import { Workbook, Worksheet } from 'exceljs';

/**
 * Official bulk-import spreadsheet (spec §2.3).
 *
 * The column catalogue below is the single source of truth for BOTH the
 * generated template and the parser in ExcelImportService. Describing the
 * columns twice is how a template stops matching the importer that reads it —
 * the failure is silent (every row reports "columna faltante") and lands on
 * the user, not on us.
 */

export type ColumnKind = 'text' | 'longText' | 'int' | 'money' | 'boolean' | 'enum' | 'category';

export interface ColumnDef {
  /** Property produced by the parser. */
  key: string;
  /** Header text written to row 1 and matched (accent/case-insensitive) on read. */
  header: string;
  kind: ColumnKind;
  required: boolean;
  width: number;
  /** Shown in the "Instrucciones" sheet and as a cell tooltip. */
  help: string;
  /** Accepted labels for `enum` / `boolean` columns, in display order. */
  options?: readonly string[];
}

export const SHEET_SERVICES = 'Servicios';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Rows pre-formatted with dropdowns. Beyond this the sheet still imports, it
 *  just loses the pick-lists — a fair trade against a 10MB empty template. */
export const TEMPLATE_DATA_ROWS = 300;

export const STRUCTURE_LABELS = { ÚNICO: 'SINGLE', SESIONES: 'SESSIONS' } as const;
export const PAYMENT_LABELS = {
  'EN CAJA': 'IN_PERSON',
  ONLINE: 'ONLINE',
  ANTICIPO: 'DEPOSIT',
} as const;
export const BOOLEAN_LABELS = { SÍ: true, NO: false } as const;
export const STATUS_LABELS = { ACTIVO: true, INACTIVO: false } as const;

export const SERVICE_COLUMNS: ColumnDef[] = [
  {
    key: 'name',
    header: 'Nombre del servicio',
    kind: 'text',
    required: true,
    width: 34,
    help: 'Nombre comercial tal como lo verá el paciente. Máximo 150 caracteres.',
  },
  {
    key: 'categoryName',
    header: 'Categoría',
    kind: 'category',
    required: true,
    width: 24,
    help: 'Elige una de la lista o escribe una nueva: si no existe, se creará automáticamente.',
  },
  {
    key: 'commercialDescription',
    header: 'Descripción comercial',
    kind: 'longText',
    required: true,
    width: 50,
    help: 'Texto de venta. Lo usa la IA para responder consultas, mientras más claro mejor.',
  },
  {
    key: 'structureType',
    header: 'Tipo',
    kind: 'enum',
    required: true,
    width: 14,
    help: 'ÚNICO para una sola cita. SESIONES para un paquete de varias.',
    options: Object.keys(STRUCTURE_LABELS),
  },
  {
    key: 'sessionCount',
    header: 'N° de sesiones',
    kind: 'int',
    required: false,
    width: 15,
    help: 'Solo para SESIONES. Mínimo 2.',
  },
  {
    key: 'frequencyDays',
    header: 'Días entre sesiones',
    kind: 'int',
    required: false,
    width: 19,
    help: 'Solo para SESIONES. Días mínimos que deben pasar entre una sesión y la siguiente.',
  },
  {
    key: 'singlePrice',
    header: 'Precio unitario (S/)',
    kind: 'money',
    required: true,
    width: 18,
    help: 'Precio de una sesión suelta. Solo números, usa punto decimal (ej. 199.90).',
  },
  {
    key: 'packagePrice',
    header: 'Precio del paquete (S/)',
    kind: 'money',
    required: false,
    width: 21,
    help: 'Solo para SESIONES. Precio total del paquete completo.',
  },
  {
    key: 'durationMinutes',
    header: 'Duración (min)',
    kind: 'int',
    required: true,
    width: 15,
    help: 'Minutos que ocupa el tratamiento en la agenda. Entre 1 y 720.',
  },
  {
    key: 'bufferMinutes',
    header: 'Limpieza (min)',
    kind: 'int',
    required: false,
    width: 15,
    help: 'Minutos de preparación o limpieza de cabina después de la cita. 0 si no aplica.',
  },
  {
    key: 'requiresEvaluation',
    header: '¿Requiere valoración?',
    kind: 'boolean',
    required: false,
    width: 20,
    help: 'SÍ si el paciente necesita una consulta previa antes de agendar.',
    options: Object.keys(BOOLEAN_LABELS),
  },
  {
    key: 'evaluationCost',
    header: 'Costo de valoración (S/)',
    kind: 'money',
    required: false,
    width: 22,
    help: 'Deja vacío o 0 si la valoración es gratuita.',
  },
  {
    key: 'isEvaluationDeductible',
    header: '¿Valoración descontable?',
    kind: 'boolean',
    required: false,
    width: 23,
    help: 'SÍ si lo pagado por la valoración se descuenta del tratamiento.',
    options: Object.keys(BOOLEAN_LABELS),
  },
  {
    key: 'deductibleExpirationDays',
    header: 'Vigencia del descuento (días)',
    kind: 'int',
    required: false,
    width: 27,
    help: 'Días que el paciente tiene para usar el descuento. Vacío = no vence.',
  },
  {
    key: 'contraindications',
    header: 'Contraindicaciones',
    kind: 'text',
    required: false,
    width: 34,
    help: 'Separadas por coma. Ej: EMBARAZO, MARCAPASOS, CÁNCER ACTIVO.',
  },
  {
    key: 'prePostCare',
    header: 'Cuidados previos y posteriores',
    kind: 'longText',
    required: false,
    width: 44,
    help: 'Instrucciones que la IA enviará al paciente antes y después de la cita.',
  },
  {
    key: 'paymentMethod',
    header: 'Método de pago',
    kind: 'enum',
    required: false,
    width: 17,
    help: 'EN CAJA (por defecto), ONLINE (pago total anticipado) o ANTICIPO (pago parcial).',
    options: Object.keys(PAYMENT_LABELS),
  },
  {
    key: 'depositAmount',
    header: 'Anticipo',
    kind: 'money',
    required: false,
    width: 13,
    help: 'Solo para ANTICIPO. Monto en soles, o el número del porcentaje (ej. 30).',
  },
  {
    key: 'depositIsPercentage',
    header: '¿El anticipo es %?',
    kind: 'boolean',
    required: false,
    width: 18,
    help: 'SÍ si la columna anterior es un porcentaje. NO si es un monto en soles.',
    options: Object.keys(BOOLEAN_LABELS),
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

/** Header text reduced to a comparable key: accents, case and spacing dropped.
 *  Lets a user rename "N° de sesiones" to "N de Sesiones" without breaking the
 *  import, and is what makes column order irrelevant on read. */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    // Strips the combining accent marks NFD just split off. Matched by Unicode
    // property rather than by a literal character range, which would depend on
    // this file's encoding surviving every editor it passes through.
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';

/**
 * Builds the .xlsx returned by GET /services/template.
 *
 * `categories` are the tenant's existing category names: they become the
 * dropdown of the "Categoría" column so a bulk load reuses the categories the
 * centre already has instead of creating near-duplicates ("Facial" vs
 * "Faciales") that then have to be merged by hand.
 */
export async function buildServicesTemplate(categories: string[]): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  // Sheets are emitted in creation order, so "Servicios" is built first to be
  // the tab the file opens on — reordering workbook.worksheets afterwards does
  // not change what Excel shows.
  const sheet = workbook.addWorksheet(SHEET_SERVICES, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  writeServicesSheet(sheet, categories);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS), categories);

  // exceljs declares a module-local `Buffer extends ArrayBuffer` that does not
  // match Node's Buffer, but what writeBuffer() returns at runtime IS a Node
  // Buffer — which is what StreamableFile in the controller needs.
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writeServicesSheet(sheet: Worksheet, categories: string[]): void {
  sheet.columns = SERVICE_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  // The example row is written BEFORE the styling loop below. addRow() appends
  // after the last existing row, and getCell() materialises every row it
  // touches — so adding it afterwards would land it on row 302, past 300 rows
  // of blank formatting, where the user would never find it.
  sheet.addRow({
    name: 'Limpieza facial profunda',
    categoryName: categories[0] ?? 'Facial',
    commercialDescription:
      'Higiene facial con extracción de impurezas, vapor ozono y mascarilla calmante.',
    structureType: 'ÚNICO',
    singlePrice: 120,
    durationMinutes: 60,
    bufferMinutes: 10,
    requiresEvaluation: 'NO',
    contraindications: 'EMBARAZO, ROSÁCEA ACTIVA',
    paymentMethod: 'EN CAJA',
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

  SERVICE_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;

    // The help text as a hover note on the header, so the rules are reachable
    // without leaving the sheet.
    sheet.getCell(1, columnNumber).note = column.help;

    for (let rowNumber = 2; rowNumber <= TEMPLATE_DATA_ROWS + 1; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);

      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.kind === 'money') {
        cell.numFmt = '#,##0.00';
      }
      if (column.kind === 'int') {
        cell.numFmt = '0';
      }
      if (column.options) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: !column.required,
          // Inline lists are capped at 255 characters by Excel; these labels
          // are short enough to stay well inside it.
          formulae: [`"${column.options.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Valor no permitido',
          error: `Usa una de las opciones: ${column.options.join(' / ')}`,
        };
      }
      if (column.kind === 'category' && categories.length > 0) {
        cell.dataValidation = {
          type: 'list',
          // allowBlank AND showErrorMessage:false on purpose: a brand-new
          // category typed by hand must be accepted, since the importer
          // creates the missing ones. The list is a shortcut, not a fence.
          allowBlank: true,
          formulae: [`=${SHEET_LISTS}!$A$2:$A$${categories.length + 1}`],
          showErrorMessage: false,
        };
      }
    }
  });

  // The example row reads as a hint, not as data to keep.
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
}

function writeInstructions(sheet: Worksheet): void {
  sheet.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 14 },
    { key: 'c', width: 86 },
  ];

  const title = sheet.addRow(['Plantilla de carga masiva de servicios']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const intro = [
    'Llena la hoja "Servicios". Una fila por servicio.',
    'Las columnas marcadas con * son obligatorias; las demás puedes dejarlas vacías.',
    'No cambies los nombres de las columnas ni borres la fila de encabezados: el sistema las reconoce por su nombre, así que puedes reordenarlas si lo necesitas.',
    'La fila 2 es un ejemplo. Bórrala o reemplázala con tus datos.',
    'Los precios van solo con números y punto decimal (199.90). No escribas "S/" ni separadores de miles.',
    'Si escribes una categoría que aún no existe, se creará automáticamente al importar.',
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

  for (const column of SERVICE_COLUMNS) {
    const row = sheet.addRow([column.header, column.required ? 'Sí' : 'No', column.help]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (column.required) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFB45309' } };
    }
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    '',
    '',
    'El servicio de valoración asociado (qué cita previa se agenda) se configura desde el sistema, no desde esta plantilla.',
  ]);
  note.getCell(3).font = { italic: true, color: { argb: 'FF64748B' } };
  note.getCell(3).alignment = { wrapText: true, vertical: 'top' };
}

function writeLists(sheet: Worksheet, categories: string[]): void {
  sheet.columns = [
    { header: 'Categorías', key: 'categories', width: 30 },
    { header: 'Tipo', key: 'structure', width: 16 },
    { header: 'Método de pago', key: 'payment', width: 18 },
    { header: 'Sí / No', key: 'boolean', width: 12 },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  const columns: string[][] = [
    categories,
    Object.keys(STRUCTURE_LABELS),
    Object.keys(PAYMENT_LABELS),
    Object.keys(BOOLEAN_LABELS),
    Object.keys(STATUS_LABELS),
  ];

  const depth = Math.max(...columns.map((values) => values.length));
  for (let index = 0; index < depth; index += 1) {
    sheet.addRow(columns.map((values) => values[index] ?? null));
  }

  // Support data — hidden so it does not read as a sheet the user must fill.
  sheet.state = 'veryHidden';
}
