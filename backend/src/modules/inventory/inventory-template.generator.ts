import { Workbook, Worksheet } from 'exceljs';

/**
 * Official bulk-import spreadsheet for GET /inventory/products/template.
 *
 * The column catalogue below is the single source of truth for BOTH the
 * generated template and the parser in InventoryExcelImportService — same
 * "describing columns twice is how a template drifts from its importer"
 * reasoning as services-template.generator.ts, which this file mirrors.
 */

export type ColumnKind = 'text' | 'decimal' | 'money' | 'enum' | 'category' | 'date';

export interface ColumnDef {
  /** Property produced by the parser — matches an ImportProductRowDto field. */
  key: string;
  /** Header text written to row 1 and matched (accent/case-insensitive) on read. */
  header: string;
  kind: ColumnKind;
  required: boolean;
  width: number;
  /** Shown in the "Instrucciones" sheet and as a cell tooltip. */
  help: string;
  /** Accepted labels for `enum` columns, in display order. */
  options?: readonly string[];
}

export const SHEET_PRODUCTS = 'Productos';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Rows pre-formatted with dropdowns. Beyond this the sheet still imports, it
 *  just loses the pick-lists — same trade-off as TEMPLATE_DATA_ROWS in
 *  services-template.generator.ts. */
export const TEMPLATE_DATA_ROWS = 300;

/** Mirrors PRODUCT_TYPE_LABELS in src/lib/validators/inventory.ts, written in
 *  the ALL-CAPS-label convention services-template.generator.ts established
 *  for dropdown options. */
export const PRODUCT_TYPE_LABELS = {
  'INSUMO MÉDICO': 'CONSUMABLE',
  'PRODUCTO DE VENTA': 'RETAIL',
  AMBOS: 'BOTH',
  'EQUIPO/ACCESORIO': 'EQUIPMENT',
} as const;

/** Types that sell directly to the patient — same set as
 *  CreateProductDto.SALE_PRICE_REQUIRED_TYPES, duplicated here purely to
 *  drive the "Precio de Venta" conditional-formatting formula. */
const SALE_TYPE_LABELS = ['PRODUCTO DE VENTA', 'AMBOS'];

export const STATUS_LABELS = { ACTIVO: true, INACTIVO: false } as const;

/** Closed list (spec §1.6): the variety of units in estética is wide, but the
 *  sheet still constrains it to keep Kardex/reporting units consistent. */
export const UNIT_OF_MEASURE_OPTIONS = ['UI', 'ml', 'mg', 'ampolla', 'frasco', 'caja', 'unidad', 'jeringa'] as const;

export const PRODUCT_COLUMNS: ColumnDef[] = [
  {
    key: 'sku',
    header: 'SKU',
    kind: 'text',
    required: true,
    width: 18,
    help: 'Código único del producto o código de barras. No puede repetirse. Máximo 60 caracteres.',
  },
  {
    key: 'name',
    header: 'Nombre del producto',
    kind: 'text',
    required: true,
    width: 34,
    help: 'Nombre tal como aparecerá en el catálogo. Máximo 160 caracteres.',
  },
  {
    key: 'categoryName',
    header: 'Categoría',
    kind: 'category',
    required: false,
    width: 22,
    help: 'Ej: Inyectables, Dermocosmética, Consumibles. Si no existe, se crea automáticamente.',
  },
  {
    key: 'type',
    header: 'Tipo',
    kind: 'enum',
    required: true,
    width: 20,
    help: 'INSUMO MÉDICO se descuenta por lote en atenciones clínicas. PRODUCTO DE VENTA se vende directo. AMBOS hace las dos cosas. EQUIPO/ACCESORIO no se consume por lote.',
    options: Object.keys(PRODUCT_TYPE_LABELS),
  },
  {
    key: 'brand',
    header: 'Marca / Laboratorio',
    kind: 'text',
    required: false,
    width: 24,
    help: 'Ej: Allergan, Galderma, Mesoestetic. Máximo 120 caracteres.',
  },
  {
    key: 'unitOfMeasure',
    header: 'Unidad de Medida',
    kind: 'enum',
    required: true,
    width: 18,
    help: `Elige una: ${UNIT_OF_MEASURE_OPTIONS.join(', ')}.`,
    options: UNIT_OF_MEASURE_OPTIONS,
  },
  {
    key: 'minStock',
    header: 'Stock Mínimo',
    kind: 'decimal',
    required: false,
    width: 15,
    help: 'Umbral que dispara la alerta de stock bajo. Vacío = 0. Solo números.',
  },
  {
    key: 'initialStock',
    header: 'Stock Inicial',
    kind: 'decimal',
    required: false,
    width: 15,
    help: 'Cantidad con la que arranca en el sistema. Si es mayor a 0, completa también N° de Lote y Fecha de Vencimiento.',
  },
  {
    key: 'lotNumber',
    header: 'N° de Lote',
    kind: 'text',
    required: false,
    width: 20,
    help: 'Obligatorio si Stock Inicial es mayor a 0, especialmente para insumos médicos y toxinas.',
  },
  {
    key: 'expirationDate',
    header: 'Fecha de Vencimiento',
    kind: 'date',
    required: false,
    width: 20,
    help: 'Formato AAAA-MM-DD (ej. 2027-06-30). Obligatoria si Stock Inicial es mayor a 0.',
  },
  {
    key: 'costPrice',
    header: 'Precio de Costo (S/)',
    kind: 'money',
    required: true,
    width: 20,
    help: 'Costo unitario. Solo números, usa punto decimal (ej. 45.50).',
  },
  {
    key: 'salePrice',
    header: 'Precio de Venta (S/)',
    kind: 'money',
    required: false,
    width: 20,
    help: 'Obligatorio si el Tipo es PRODUCTO DE VENTA o AMBOS. Vacío si no se vende directo.',
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

/** Header text reduced to a comparable key: accents, case and spacing
 *  dropped — identical to normalizeHeader in services-template.generator.ts,
 *  duplicated rather than imported cross-module (each import pipeline is
 *  kept self-contained, same rationale as StaffExcelImportService). */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';
/** Same amber used for "missing required" highlights elsewhere, but applied
 *  conditionally (spec §2.2) rather than statically like REQUIRED_TINT. */
const CONDITIONAL_TINT = 'FFFEF3C7';

/**
 * Builds the .xlsx returned by GET /inventory/products/template.
 *
 * `existingSkus` seed the "Listas" sheet purely for reference (so a tenant
 * filling the sheet by hand can see what is already taken) — unlike
 * categories, an existing SKU is never a dropdown choice: reusing one is
 * exactly the error the importer flags. `categories` are the tenant's
 * existing category names — a soft dropdown, same as Services' categoryName.
 */
export async function buildInventoryTemplate(existingSkus: string[], categories: string[]): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_PRODUCTS, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  writeProductsSheet(sheet, categories);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS), existingSkus, categories);

  // exceljs declares its own module-local `Buffer extends ArrayBuffer`, which
  // does not line up with Node's. The value returned at runtime is a real
  // Node Buffer, which is what StreamableFile in the controller needs.
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writeProductsSheet(sheet: Worksheet, categories: string[]): void {
  sheet.columns = PRODUCT_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  // Written before the styling loop below: addRow() appends after the last
  // existing row, and getCell() materialises every row it touches — adding
  // the example afterwards would land it past 300 rows of blank formatting.
  sheet.addRow({
    sku: 'TOX-100',
    name: 'Toxina Botulínica 100UI',
    categoryName: 'Inyectables',
    type: 'INSUMO MÉDICO',
    brand: 'Allergan',
    unitOfMeasure: 'UI',
    minStock: 20,
    initialStock: 100,
    lotNumber: 'L-2027-01',
    expirationDate: '2027-06-30',
    costPrice: 450,
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

  PRODUCT_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;
    sheet.getCell(1, columnNumber).note = column.help;

    for (let rowNumber = 2; rowNumber <= TEMPLATE_DATA_ROWS + 1; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);

      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.kind === 'money' || column.kind === 'decimal') {
        cell.numFmt = '0.00';
      }
      if (column.kind === 'date') {
        cell.numFmt = 'yyyy-mm-dd';
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
      if (column.kind === 'category' && categories.length > 0) {
        cell.dataValidation = {
          type: 'list',
          // allowBlank AND showErrorMessage:false on purpose: a brand-new
          // category typed by hand must be accepted, since the importer
          // creates the missing ones. The list is a shortcut, not a fence.
          allowBlank: true,
          formulae: [`=${SHEET_LISTS}!$B$2:$B$${categories.length + 1}`],
          showErrorMessage: false,
        };
      }
    }
  });

  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };

  applySalePriceConditionalFormatting(sheet);
}

/** Highlights the "Precio de Venta" cell in amber whenever the row's Tipo is
 *  PRODUCTO DE VENTA or AMBOS and the cell is still empty — a visual nudge
 *  toward the rule the importer actually enforces (spec §1.4/§2.2), not a
 *  hard block: the cell stays editable either way. */
function applySalePriceConditionalFormatting(sheet: Worksheet): void {
  const typeColLetter = columnLetter(PRODUCT_COLUMNS.findIndex((column) => column.key === 'type') + 1);
  const salePriceColLetter = columnLetter(PRODUCT_COLUMNS.findIndex((column) => column.key === 'salePrice') + 1);
  const lastRow = TEMPLATE_DATA_ROWS + 1;
  const typeOptions = SALE_TYPE_LABELS.map((label) => `$${typeColLetter}2="${label}"`).join(',');

  sheet.addConditionalFormatting({
    ref: `${salePriceColLetter}2:${salePriceColLetter}${lastRow}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`AND(OR(${typeOptions}),$${salePriceColLetter}2="")`],
        style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: CONDITIONAL_TINT } } },
      },
    ],
  });
}

/** 1-based column index -> spreadsheet letter (1 -> A, 27 -> AA). Identical
 *  to services-template.generator.ts's columnLetter. */
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

function writeInstructions(sheet: Worksheet): void {
  sheet.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 14 },
    { key: 'c', width: 86 },
  ];

  const title = sheet.addRow(['Plantilla de carga masiva de productos e inventario']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const intro = [
    'Registra un producto por fila. Las columnas marcadas con * son obligatorias; las demás puedes dejarlas vacías.',
    'No cambies los nombres de las columnas ni borres la fila de encabezados: el sistema las reconoce por su nombre, así que puedes reordenarlas si lo necesitas.',
    'La fila 2 es un ejemplo. Bórrala o reemplázala con tus datos.',
    'SKU: debe ser único por producto. Una fila con un SKU ya usado (en el archivo o ya registrado) se reporta como duplicada y no se importa.',
    'Stock Inicial y Lotes: si ingresas un Stock Inicial mayor a 0, completa también el N° de Lote y la Fecha de Vencimiento (especialmente para insumos médicos y toxinas). Esto crea automáticamente el lote y su primer movimiento de Kardex.',
    'Productos de Venta: todo producto con tipo PRODUCTO DE VENTA o AMBOS debe contar con Precio de Venta (S/) — la celda se resalta en amarillo si falta.',
    'Montos: ingresa solo números con decimales (ej. 120.00). No incluyas el símbolo "S/" ni comas de miles.',
    'Antes de guardar nada, el sistema te mostrará una vista previa con el estado de cada fila.',
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

  for (const column of PRODUCT_COLUMNS) {
    const row = sheet.addRow([column.header, column.required ? 'Sí' : 'No', column.help]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (column.required) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFB45309' } };
    }
  }
}

function writeLists(sheet: Worksheet, existingSkus: string[], categories: string[]): void {
  sheet.columns = [
    { header: 'SKUs ya registrados', key: 'skus', width: 24 },
    { header: 'Categorías existentes', key: 'categories', width: 24 },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Unidad de Medida', key: 'unit', width: 18 },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  const columns: string[][] = [
    existingSkus,
    categories,
    Object.keys(PRODUCT_TYPE_LABELS),
    [...UNIT_OF_MEASURE_OPTIONS],
    Object.keys(STATUS_LABELS),
  ];

  const depth = Math.max(...columns.map((values) => values.length));
  for (let index = 0; index < depth; index += 1) {
    sheet.addRow(columns.map((values) => values[index] ?? null));
  }

  // Support data — hidden so it does not read as a sheet the user must fill.
  sheet.state = 'veryHidden';
}
