import { Workbook, Worksheet } from 'exceljs';
import { normalizeHeader } from '../services/services-template.generator';

/**
 * Carga masiva de pacientes (Módulo 05), siguiendo el mismo patrón que
 * services-template.generator.ts (Módulo 03) y staff-template.generator.ts
 * (Módulo 04).
 *
 * The column catalogue below is the single source of truth for BOTH the
 * generated template and the parser in PatientsExcelImportService — same
 * reasoning as SERVICE_COLUMNS/STAFF_COLUMNS: describing the columns twice is
 * how a template stops matching the importer that reads it.
 */

export type PatientColumnKind = 'text' | 'longText' | 'enum' | 'date';

export interface PatientColumnDef {
  /** Property produced by the parser. */
  key: string;
  /** Header text written to row 1 and matched (accent/case-insensitive) on read. */
  header: string;
  kind: PatientColumnKind;
  required: boolean;
  width: number;
  /** Shown in the "Instrucciones" sheet and as a cell tooltip. */
  help: string;
  /** Accepted labels for `enum` columns, in display order. */
  options?: readonly string[];
  /** Forces the column to Excel's Text format (`@`) so a value like
   *  "007654" keeps its leading zeros instead of Excel silently reading it as
   *  a number the moment the user types into an unformatted cell. */
  forceText?: boolean;
}

export const SHEET_PATIENTS = 'Pacientes';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Rows pre-formatted with dropdowns — same trade-off as TEMPLATE_DATA_ROWS in
 *  services-template.generator.ts. */
export const TEMPLATE_DATA_ROWS = 300;

export const DOCUMENT_TYPE_LABELS = { DNI: 'DNI', CE: 'CE', PASAPORTE: 'PASSPORT' } as const;
export const GENDER_LABELS = { Femenino: 'FEMALE', Masculino: 'MALE', Otro: 'OTHER' } as const;
export const ACQUISITION_CHANNEL_LABELS = {
  Instagram: 'INSTAGRAM',
  Facebook: 'FACEBOOK',
  Google: 'GOOGLE',
  Recomendación: 'REFERRAL',
  TikTok: 'TIKTOK',
  Otro: 'OTHER',
} as const;

export const PATIENT_COLUMNS: PatientColumnDef[] = [
  {
    key: 'firstName',
    header: 'Nombre',
    kind: 'text',
    required: true,
    width: 22,
    help: 'Nombre(s) del paciente. Máximo 100 caracteres.',
  },
  {
    key: 'lastName',
    header: 'Apellido',
    kind: 'text',
    required: true,
    width: 22,
    help: 'Apellido(s) del paciente. Máximo 100 caracteres.',
  },
  {
    key: 'documentType',
    header: 'Tipo de documento',
    kind: 'enum',
    required: false,
    width: 18,
    help: 'Elige DNI, CE (Carné de Extranjería) o PASAPORTE. Vacío = DNI.',
    options: Object.keys(DOCUMENT_TYPE_LABELS),
  },
  {
    key: 'documentNumber',
    header: 'Documento',
    kind: 'text',
    required: true,
    width: 18,
    help: 'Número de documento. La columna está en formato Texto para conservar ceros a la izquierda.',
    forceText: true,
  },
  {
    key: 'phone',
    header: 'Teléfono / WhatsApp',
    kind: 'text',
    required: true,
    width: 20,
    help: 'Solo el número local, sin +51 (ej. 987654321): el sistema agrega el código de país automáticamente. También acepta el formato internacional completo (+51987654321).',
    forceText: true,
  },
  {
    key: 'email',
    header: 'Correo',
    kind: 'text',
    required: false,
    width: 28,
    help: 'Correo electrónico del paciente, si lo tiene.',
  },
  {
    key: 'birthDate',
    header: 'Fecha de nacimiento',
    kind: 'date',
    required: false,
    width: 20,
    help: 'Formato AAAA-MM-DD (ej. 1990-05-12) o DD/MM/AAAA (ej. 12/05/1990).',
  },
  {
    key: 'gender',
    header: 'Género',
    kind: 'enum',
    required: false,
    width: 14,
    help: 'Elige Femenino, Masculino u Otro.',
    options: Object.keys(GENDER_LABELS),
  },
  {
    key: 'allergies',
    header: 'Alergias / Antecedentes',
    kind: 'longText',
    required: false,
    width: 40,
    help: 'Alertas médicas/clínicas separadas por coma (ej. Penicilina, Látex). Se guardan en la ficha de Antecedentes Médicos del paciente.',
  },
  {
    key: 'address',
    header: 'Dirección',
    kind: 'text',
    required: false,
    width: 32,
    help: 'Dirección del paciente, si la tienes.',
  },
  {
    key: 'district',
    header: 'Distrito / Ciudad',
    kind: 'text',
    required: false,
    width: 22,
    help: 'Distrito o ciudad donde vive el paciente.',
  },
  {
    key: 'acquisitionChannel',
    header: 'Medio de captación',
    kind: 'enum',
    required: false,
    width: 20,
    help: 'Cómo llegó el paciente al centro. Alimenta los reportes de origen de clientes en Analítica.',
    options: Object.keys(ACQUISITION_CHANNEL_LABELS),
  },
  {
    key: 'tags',
    header: 'Etiquetas',
    kind: 'text',
    required: false,
    width: 30,
    help: 'Nombres separados por coma (ej. VIP, Frecuente). Una etiqueta que no exista se crea automáticamente.',
  },
  {
    key: 'notes',
    header: 'Notas',
    kind: 'longText',
    required: false,
    width: 40,
    help: 'Preferencias u observaciones generales del paciente.',
  },
];

/** Header text reduced to a comparable key — same helper as
 *  services-template.generator.ts's normalizeHeader, re-exported so the
 *  parser doesn't need to reach into a sibling module directly. */
export { normalizeHeader };

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';

/**
 * Builds the .xlsx returned by GET /patients/export-template.
 *
 * `tags` are the tenant's existing PatientTag names: offered as a reference
 * list in "Listas" (free text, not a strict dropdown — a brand-new tag typed
 * by hand is accepted and materializes into the catalogue on import, same as
 * PatientTagsService.ensureCatalogCoversPatientTags already does today).
 */
export async function buildPatientsTemplate(tags: string[]): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_PATIENTS, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  writePatientsSheet(sheet);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS), tags);

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writePatientsSheet(sheet: Worksheet): void {
  sheet.columns = PATIENT_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  sheet.addRow({
    firstName: 'María',
    lastName: 'Torres',
    documentType: 'DNI',
    documentNumber: '45678912',
    phone: '987654321',
    email: 'maria.torres@example.com',
    birthDate: '1990-05-12',
    gender: 'Femenino',
    allergies: 'Penicilina',
    address: 'Av. Siempre Viva 123',
    district: 'Miraflores',
    acquisitionChannel: 'Instagram',
    tags: 'VIP',
    notes: 'Prefiere citas por la tarde.',
  });

  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = { bottom: { style: 'medium', color: { argb: ACCENT } } };
  });

  PATIENT_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;
    sheet.getCell(1, columnNumber).note = column.help;
    if (column.forceText) {
      sheet.getCell(1, columnNumber).numFmt = '@';
    }

    for (let rowNumber = 2; rowNumber <= TEMPLATE_DATA_ROWS + 1; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);

      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.forceText) {
        cell.numFmt = '@';
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
    }
  });

  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
}

/** Friendlier, example-rich text for the reference table below — overrides
 *  the column's `help` for the columns the spec calls out by name. Columns
 *  not listed here fall back to `column.help`. Same pattern as
 *  services-template.generator.ts's INSTRUCTION_EXAMPLES. */
const INSTRUCTION_EXAMPLES: Partial<Record<string, string>> = {
  firstName: 'Nombre(s) del paciente. Ej: "María".',
  lastName: 'Apellido(s) del paciente. Ej: "Torres".',
  documentType: 'Elige DNI, CE o PASAPORTE desde la lista. Vacío = DNI.',
  documentNumber: 'Guarda la celda como Texto para no perder ceros a la izquierda. Ej: "45678912".',
  phone: 'Solo el número local, sin +51. Ej: "987654321".',
  email: 'Correo del paciente, si lo tiene. Ej: "maria.torres@correo.com".',
  birthDate: 'Formato AAAA-MM-DD o DD/MM/AAAA. Ej: "1990-05-12" o "12/05/1990".',
  gender: 'Elige Femenino, Masculino u Otro.',
  allergies: 'Separadas por coma. Ej: "Penicilina, Látex".',
  address: 'Ej: "Av. Siempre Viva 123".',
  district: 'Ej: "Miraflores".',
  acquisitionChannel: 'Elige Instagram, Facebook, Google, Recomendación, TikTok u Otro.',
  tags: 'Separadas por coma. Ej: "VIP, Frecuente". Una que no exista se crea sola.',
  notes: 'Preferencias u observaciones. Ej: "Prefiere citas por la tarde".',
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

  const title = sheet.addRow(['Plantilla de carga masiva de pacientes']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const subtitle = sheet.addRow(['Reglas de llenado']);
  subtitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
  sheet.addRow([]);

  const rules: Array<[string, string]> = [
    [
      'Filas y Datos',
      'Registra un paciente por fila en la hoja "Pacientes". Las columnas marcadas con asterisco (*) son obligatorias. No elimines ni modifiques la fila de encabezados (Fila 1), que además queda inmovilizada al desplazarte.',
    ],
    [
      'Teléfono',
      'Puedes escribir directamente el número celular de 9 dígitos (ej. 987654321). El sistema agregará el código de país por defecto (+51) automáticamente, sin que tengas que escribirlo tú.',
    ],
    [
      'Documento',
      'Si tu número tiene ceros a la izquierda, asegúrate de que la celda esté guardada en formato Texto (la columna ya viene así en esta plantilla oficial).',
    ],
    [
      'Fechas',
      'Usa preferentemente el formato AAAA-MM-DD (ej. 1990-05-12) o DD/MM/AAAA (ej. 12/05/1990).',
    ],
    [
      'Medio de captación y Alergias',
      'Completar estos campos ayuda al equipo médico y permite generar reportes de origen de clientes en el módulo de Analítica.',
    ],
    [
      'Etiquetas',
      'Nombres separados por coma. Una etiqueta que no exista todavía en tu centro se crea automáticamente al importar.',
    ],
  ];
  rules.forEach(([lead, rest], index) => {
    const row = sheet.addRow(['', leadInText(index + 1, lead, rest), '']);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    sheet.mergeCells(row.number, 2, row.number, 3);
  });

  sheet.addRow([]);
  const tableHeader = sheet.addRow(['Columna', '¿Obligatorio?', 'Ejemplo / Instrucción']);
  tableHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tableHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });

  for (const column of PATIENT_COLUMNS) {
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

function writeLists(sheet: Worksheet, tags: string[]): void {
  sheet.columns = [
    { header: 'Tipo de documento', key: 'documentType', width: 18 },
    { header: 'Género', key: 'gender', width: 14 },
    { header: 'Medio de captación', key: 'acquisitionChannel', width: 20 },
    { header: 'Etiquetas existentes', key: 'tags', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };

  const columns: string[][] = [
    Object.keys(DOCUMENT_TYPE_LABELS),
    Object.keys(GENDER_LABELS),
    Object.keys(ACQUISITION_CHANNEL_LABELS),
    tags,
  ];

  const depth = Math.max(...columns.map((values) => values.length));
  for (let index = 0; index < depth; index += 1) {
    sheet.addRow(columns.map((values) => values[index] ?? null));
  }

  // Support data — hidden so it does not read as a sheet the user must fill.
  sheet.state = 'veryHidden';
}
