import { Workbook, Worksheet } from 'exceljs';

/**
 * The .xlsx behind GET /clinical-templates/export — the "Descargar Plantilla"
 * button in /plantillas-clinicas. Unlike Services/Staff/Patients/Inventory,
 * this file is not a blank structure to fill from scratch: it is always
 * seeded with the tenant's own active plantillas clínicas (so exporting and
 * re-importing round-trips), with a single example row added only when the
 * tenant has none yet — same "helpful starting point" reasoning the other
 * modules bake into their permanent example row, just conditional here
 * because a synthetic row mixed into a real data export would be misleading.
 *
 * The column catalogue below is shared with ClinicalTemplatesExcelService's
 * parser (mapHeaders/checkRequired) — same "describing columns twice is how
 * a template drifts from its importer" reasoning as every other
 * `*-template.generator.ts` in this codebase.
 */

export interface TemplateColumnDef {
  key: 'name' | 'category' | 'description' | 'hasFaceMapping' | 'fields';
  header: string;
  required: boolean;
  width: number;
  help: string;
}

export const SHEET_TEMPLATES = 'Plantillas';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Mirrors CreateClinicalTemplateDto/ClinicalFormTemplateSchemaDto: `name`,
 *  `fieldsSchema.category` and `fieldsSchema.fields` (min 1 item) are
 *  genuinely required there. `hasFaceMapping` is optional at the DTO level
 *  (silently defaults to NO) but is marked required HERE on purpose — an
 *  explicit SÍ/NO dropdown choice is better UX than a silent default, so the
 *  parser enforces it as a template-level rule even though the DTO does not. */
export const TEMPLATE_COLUMNS: TemplateColumnDef[] = [
  {
    key: 'name',
    header: 'Nombre',
    required: true,
    width: 34,
    help: 'Nombre de la ficha clínica. Ej: "Ficha de Toxina Botulínica".',
  },
  {
    key: 'category',
    header: 'Categoría',
    required: true,
    width: 22,
    help: 'Ej: Inyectables, Facial, Corporal. Si no existe, se crea automáticamente.',
  },
  {
    key: 'description',
    header: 'Descripción',
    required: false,
    width: 44,
    help: 'Breve explicación del uso de la ficha.',
  },
  {
    key: 'hasFaceMapping',
    header: 'Mapeo Facial',
    required: true,
    width: 16,
    help: 'SÍ si la ficha requiere marcar puntos anatómicos sobre el rostro interactivo.',
  },
  {
    key: 'fields',
    header: 'Campos (JSON)',
    required: true,
    width: 70,
    help: 'Array JSON con los campos dinámicos de la ficha. No es necesario incluir "id": se genera automáticamente si lo omites.',
  },
];

export const FACE_MAPPING_OPTIONS = ['SÍ', 'NO'] as const;

/** Beyond the tenant's real rows, formatting/validation still extends this
 *  many rows further so new plantillas can be typed in and still get the
 *  dropdown + required tint — same TEMPLATE_DATA_ROWS trade-off as every
 *  other generator, sized to MAX_IMPORT_ROWS (the parser's own ceiling). */
export const TEMPLATE_BUFFER_ROWS = 200;

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';

const EXAMPLE_ROW = {
  name: 'Ficha de Toxina Botulínica',
  category: 'Inyectables',
  description: 'Registro de zonas tratadas, unidades aplicadas y marca del producto.',
  hasFaceMapping: 'SÍ',
  fields: JSON.stringify([
    { label: 'Marca', type: 'SELECT', options: ['Botox', 'Dysport'], required: true },
    { label: 'Dilución (ml)', type: 'NUMBER', required: true },
    { label: '¿Firmó consentimiento?', type: 'CHECKBOX', required: true },
    { label: 'Observaciones', type: 'TEXTAREA', required: false },
  ]),
};

interface ExportableTemplate {
  name: string;
  description: string | null;
  fieldsSchema: Record<string, unknown>;
}

/** `templates` are the tenant's own active plantillas — real data, not a
 *  blank starting point (see the file's doc comment). */
export async function buildClinicalTemplatesTemplate(templates: ExportableTemplate[]): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_TEMPLATES, { views: [{ state: 'frozen', ySplit: 1 }] });
  writeTemplatesSheet(sheet, templates);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS));

  // exceljs' own module-local `Buffer` type does not match Node's; the
  // runtime value returned IS a Node Buffer, same caveat documented in
  // services-template.generator.ts.
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writeTemplatesSheet(sheet: Worksheet, templates: ExportableTemplate[]): void {
  sheet.columns = TEMPLATE_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  const isEmpty = templates.length === 0;
  if (isEmpty) {
    sheet.addRow(EXAMPLE_ROW);
  } else {
    for (const template of templates) {
      sheet.addRow({
        name: template.name,
        category: String(template.fieldsSchema.category ?? ''),
        description: template.description ?? '',
        hasFaceMapping: template.fieldsSchema.hasFaceMapping ? 'SÍ' : 'NO',
        fields: JSON.stringify(template.fieldsSchema.fields ?? []),
      });
    }
  }

  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = { bottom: { style: 'medium', color: { argb: ACCENT } } };
  });

  const lastRow = Math.max(templates.length, 1) + TEMPLATE_BUFFER_ROWS + 1;
  TEMPLATE_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;
    sheet.getCell(1, columnNumber).note = column.help;

    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);

      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.key === 'hasFaceMapping') {
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`=${SHEET_LISTS}!$A$2:$A$${FACE_MAPPING_OPTIONS.length + 1}`],
          showErrorMessage: true,
          errorTitle: 'Valor no permitido',
          error: `Usa una de las opciones: ${FACE_MAPPING_OPTIONS.join(' / ')}.`,
        };
      }
    }
  });

  if (isEmpty) {
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
  }
}

function writeInstructions(sheet: Worksheet): void {
  sheet.columns = [
    { key: 'a', width: 34 },
    { key: 'b', width: 14 },
    { key: 'c', width: 90 },
  ];

  const title = sheet.addRow(['Plantilla de plantillas clínicas']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const intro = [
    'Llena la hoja "Plantillas". Registra una plantilla clínica por fila.',
    'Las columnas marcadas con * son obligatorias; las demás puedes dejarlas vacías.',
    'No cambies los nombres de las columnas ni borres la fila de encabezados: el sistema las reconoce por su nombre.',
    'Mapeo Facial: selecciona SÍ si la ficha requiere que el profesional marque puntos anatómicos sobre el rostro interactivo. Si no aplica, selecciona NO.',
    'Campos (JSON): define los campos dinámicos de la ficha en formato JSON (ver tabla de tipos abajo). No es necesario incluir la clave "id" — el sistema la genera automáticamente si la omites.',
    'Categoría: si escribes una categoría que no existe todavía, se crea automáticamente.',
    'Un nombre de plantilla ya usado (en el archivo o ya registrado) se reporta como duplicado y no se importa.',
    'Antes de guardar nada, el sistema te mostrará una vista previa con el estado de cada fila.',
  ];
  for (const line of intro) {
    const row = sheet.addRow(['', '•', line]);
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.addRow([]);
  const typesTitle = sheet.addRow(['Tipos de campo permitidos en "Campos (JSON)"']);
  typesTitle.font = { bold: true, size: 13, color: { argb: BRAND } };
  sheet.addRow([]);

  const typesHeader = sheet.addRow(['Tipo', 'Uso', 'Ejemplo JSON']);
  typesHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  typesHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });

  const fieldTypes: [string, string, string][] = [
    ['TEXT', 'Texto corto', '{"type":"TEXT","label":"Alergias conocidas","required":true}'],
    ['TEXTAREA', 'Texto multilínea / Notas', '{"type":"TEXTAREA","label":"Observaciones","required":false}'],
    ['NUMBER', 'Valores numéricos', '{"type":"NUMBER","label":"Dilución (ml)","required":true}'],
    [
      'SELECT',
      'Desplegable de selección única',
      '{"type":"SELECT","label":"Marca","options":["Botox","Dysport"],"required":true}',
    ],
    ['CHECKBOX', 'Casilla de verificación', '{"type":"CHECKBOX","label":"¿Firmó consentimiento?","required":true}'],
  ];
  for (const [type, use, example] of fieldTypes) {
    const row = sheet.addRow([type, use, example]);
    row.getCell(1).font = { bold: true };
    row.getCell(3).font = { name: 'Consolas', size: 10, color: { argb: 'FF334155' } };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  }

  sheet.addRow([]);
  const columnsTitle = sheet.addRow(['Referencia de columnas']);
  columnsTitle.font = { bold: true, size: 13, color: { argb: BRAND } };
  sheet.addRow([]);

  const columnsHeader = sheet.addRow(['Columna', '¿Obligatoria?', 'Cómo llenarla']);
  columnsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  columnsHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });

  for (const column of TEMPLATE_COLUMNS) {
    const row = sheet.addRow([column.header, column.required ? 'Sí' : 'No', column.help]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (column.required) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFB45309' } };
    }
  }
}

function writeLists(sheet: Worksheet): void {
  sheet.columns = [{ header: 'Mapeo Facial', key: 'hasFaceMapping', width: 16 }];
  sheet.getRow(1).font = { bold: true };
  for (const option of FACE_MAPPING_OPTIONS) {
    sheet.addRow([option]);
  }

  // Support data — hidden so it does not read as a sheet the user must fill.
  // Excel still resolves data-validation formulae against a hidden sheet.
  sheet.state = 'veryHidden';
}
