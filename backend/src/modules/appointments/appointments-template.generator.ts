import { Workbook, Worksheet } from 'exceljs';
import { normalizeHeader } from '../services/services-template.generator';

/**
 * Carga masiva de citas (Módulo 06), mismo patrón que
 * staff-template.generator.ts / services-template.generator.ts: el catálogo
 * de columnas de abajo es la única fuente de verdad, compartida por el
 * generador y por AppointmentsExcelImportService.
 *
 * A diferencia de Personal/Servicios, ninguna entidad se crea desde esta
 * plantilla — paciente, profesional, servicio, sala y equipo deben existir
 * YA en el sistema; la fila solo los referencia por teléfono/nombre. Por
 * eso no hay columnas "kind: enum/category/money" ni auto-creación: son
 * simples referencias de texto (mismo motivo por el que un `serviceIds`
 * o `patientId` en crudo no tendría sentido en una plantilla que llena una
 * persona a mano).
 */

export type AppointmentColumnKind = 'text' | 'date' | 'time' | 'number';

export interface AppointmentColumnDef {
  /** Property produced by el parser. */
  key: string;
  /** Header text escrito en la fila 1 y matcheado (acento/mayúscula-insensible) al leer. */
  header: string;
  kind: AppointmentColumnKind;
  required: boolean;
  width: number;
  /** Mostrado en la pestaña "Instrucciones" y como tooltip de celda. */
  help: string;
}

export const SHEET_APPOINTMENTS = 'Citas';
export const SHEET_INSTRUCTIONS = 'Instrucciones';
export const SHEET_LISTS = 'Listas';

/** Filas pre-formateadas — igual criterio que TEMPLATE_DATA_ROWS en
 *  staff-template.generator.ts. */
export const TEMPLATE_DATA_ROWS = 300;

export const APPOINTMENT_COLUMNS: AppointmentColumnDef[] = [
  {
    key: 'patientPhone',
    header: 'Teléfono del Paciente',
    kind: 'text',
    required: true,
    width: 22,
    help: 'El paciente se busca por este teléfono — debe estar YA registrado en el módulo de Pacientes. Acepta el número local (ej. 987654321) o con código de país (+51987654321).',
  },
  {
    key: 'patientName',
    header: 'Nombre del Paciente',
    kind: 'text',
    required: false,
    width: 26,
    help: 'Solo de referencia para que reconozcas la fila — el sistema busca al paciente por teléfono, no por este nombre.',
  },
  {
    key: 'professionalName',
    header: 'Profesional',
    kind: 'text',
    required: true,
    width: 28,
    help: 'Nombre y apellido EXACTOS de un profesional ya activo en el sistema (ej. "Ana Pérez").',
  },
  {
    key: 'serviceName',
    header: 'Servicio',
    kind: 'text',
    required: true,
    width: 28,
    help: 'Nombre EXACTO de un servicio ya activo en tu catálogo.',
  },
  {
    key: 'date',
    header: 'Fecha (AAAA-MM-DD)',
    kind: 'date',
    required: true,
    width: 20,
    help: 'Formato AAAA-MM-DD, ej. 2026-09-15. También acepta una celda con formato de fecha de Excel.',
  },
  {
    key: 'time',
    header: 'Hora (HH:mm)',
    kind: 'time',
    required: true,
    width: 14,
    help: 'Formato de 24 horas, ej. 15:30 para las 3:30 PM.',
  },
  {
    key: 'durationMinutes',
    header: 'Duración (min)',
    kind: 'number',
    required: false,
    width: 16,
    help: 'Opcional, número entero de minutos (ej. 45 o 60). Déjalo vacío para usar la duración configurada del servicio.',
  },
  {
    key: 'roomName',
    header: 'Sala / Cabina',
    kind: 'text',
    required: false,
    width: 22,
    help: 'Opcional. Nombre EXACTO de una sala/cabina ya registrada. Déjalo vacío si no aplica.',
  },
  {
    key: 'equipmentName',
    header: 'Equipo',
    kind: 'text',
    required: false,
    width: 22,
    help: 'Opcional. Nombre EXACTO de un equipo/aparatología ya registrado. Déjalo vacío si no aplica.',
  },
  {
    key: 'notes',
    header: 'Notas',
    kind: 'text',
    required: false,
    width: 40,
    help: 'Opcional. Indicaciones adicionales para esta cita. Máximo 2000 caracteres.',
  },
];

const BRAND = 'FF0F172A';
const REQUIRED_TINT = 'FFFEF3C7';
const ACCENT = 'FF7C3AED';

/**
 * Builds the .xlsx behind GET /appointments/export-template.
 *
 * `professionalNames`/`serviceNames`/`roomNames`/`equipmentNames` son los
 * catálogos activos del tenant — se listan en la pestaña "Listas" como
 * referencia (no como dropdown obligatorio: a diferencia de Especialidad en
 * Personal, aquí un nombre que no coincida es un ERROR bloqueante, no algo
 * que la importación cree sobre la marcha).
 */
export async function buildAppointmentsTemplate(catalog: {
  professionalNames: string[];
  serviceNames: string[];
  roomNames: string[];
  equipmentNames: string[];
}): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Sistema LIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_APPOINTMENTS, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  writeAppointmentsSheet(sheet, catalog);

  writeInstructions(workbook.addWorksheet(SHEET_INSTRUCTIONS));
  writeLists(workbook.addWorksheet(SHEET_LISTS), catalog);

  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

function writeAppointmentsSheet(
  sheet: Worksheet,
  catalog: { professionalNames: string[]; serviceNames: string[]; roomNames: string[]; equipmentNames: string[] },
): void {
  sheet.columns = APPOINTMENT_COLUMNS.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));

  sheet.addRow({
    patientPhone: '987654321',
    patientName: 'María López',
    professionalName: catalog.professionalNames[0] ?? 'Ana Pérez',
    serviceName: catalog.serviceNames[0] ?? 'Limpieza Facial',
    date: '2026-09-15',
    time: '15:30',
    durationMinutes: '',
    roomName: catalog.roomNames[0] ?? '',
    equipmentName: catalog.equipmentNames[0] ?? '',
    notes: '',
  });

  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.border = { bottom: { style: 'medium', color: { argb: ACCENT } } };
  });

  /** Rango de la hoja Listas que alimenta el dropdown de cada columna
   *  referenciable — mismo patrón que la columna Especialidad en
   *  staff-template.generator.ts (`=Listas!$A$2:$A$${n+1}`). */
  const LIST_COLUMN_BY_KEY: Partial<Record<string, { column: 'A' | 'B' | 'C' | 'D'; count: number }>> = {
    professionalName: { column: 'A', count: catalog.professionalNames.length },
    serviceName: { column: 'B', count: catalog.serviceNames.length },
    roomName: { column: 'C', count: catalog.roomNames.length },
    equipmentName: { column: 'D', count: catalog.equipmentNames.length },
  };

  APPOINTMENT_COLUMNS.forEach((column, index) => {
    const columnNumber = index + 1;
    sheet.getCell(1, columnNumber).note = column.help;
    const listSource = LIST_COLUMN_BY_KEY[column.key];

    for (let rowNumber = 2; rowNumber <= TEMPLATE_DATA_ROWS + 1; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, columnNumber);
      if (column.required) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_TINT } };
      }
      if (column.kind === 'date') {
        cell.numFmt = 'yyyy-mm-dd';
      }
      if (column.kind === 'time') {
        cell.numFmt = 'hh:mm';
      }
      if (column.kind === 'number') {
        cell.numFmt = '0';
      }
      // Desplegable real apuntando a la hoja Listas — evita errores
      // tipográficos al llenar Profesional/Servicio/Sala/Equipo a mano.
      // Si el catálogo respectivo está vacío no hay rango válido que
      // referenciar, así que se omite (la celda queda como texto libre).
      if (listSource && listSource.count > 0) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: !column.required,
          formulae: [`=${SHEET_LISTS}!$${listSource.column}$2:$${listSource.column}$${listSource.count + 1}`],
          showErrorMessage: true,
          errorTitle: 'Valor no permitido',
          error: 'Elige un valor de la lista o revisa la pestaña "Listas".',
        };
      }
    }
  });

  sheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
}

const INSTRUCTION_EXAMPLES: Partial<Record<string, string>> = {
  patientPhone: 'Teléfono del paciente YA registrado. Ej: "987654321".',
  patientName: 'Solo referencia visual — la búsqueda real es por teléfono.',
  professionalName: 'Nombre y apellido exactos de un profesional activo. Ej: "Ana Pérez".',
  serviceName: 'Nombre exacto de un servicio activo del catálogo.',
  date: 'Formato AAAA-MM-DD. Ej: "2026-09-15".',
  time: 'Formato de 24 horas. Ej: "15:30".',
  durationMinutes: 'Opcional. Ej: "45". Vacío = usa la duración configurada del servicio.',
  roomName: 'Opcional. Nombre exacto de una sala/cabina activa.',
  equipmentName: 'Opcional. Nombre exacto de un equipo activo.',
  notes: 'Opcional, máximo 2000 caracteres.',
};

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

  const title = sheet.addRow(['Plantilla de carga masiva de citas']);
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  sheet.addRow([]);

  const subtitle = sheet.addRow(['Reglas generales de llenado']);
  subtitle.font = { bold: true, size: 12, color: { argb: ACCENT } };
  sheet.addRow([]);

  const rules: Array<[string, string]> = [
    [
      'Filas y Datos',
      'Llena la hoja "Citas". Registra una cita por fila. No elimines ni modifiques la fila de encabezados (Fila 1), que además queda inmovilizada al desplazarte.',
    ],
    [
      'Campos Obligatorios',
      'Las columnas marcadas con un asterisco (*) son requeridas. Las demás son opcionales.',
    ],
    [
      'Nada se crea automáticamente',
      'Paciente, Profesional, Servicio, Sala y Equipo deben existir YA en el sistema. Esta plantilla solo los referencia — no da de alta pacientes ni profesionales nuevos.',
    ],
    [
      'Paciente',
      'Se busca por Teléfono, no por nombre. Si el teléfono no coincide con ningún paciente registrado, la fila se rechaza.',
    ],
    [
      'Profesional, Servicio, Sala y Equipo',
      'Escribe el nombre exacto tal como aparece en el sistema — al hacer clic en la celda aparece un desplegable con los valores válidos, tomados de la pestaña "Listas".',
    ],
    [
      'Fecha y Hora',
      'Fecha en formato AAAA-MM-DD y Hora en formato de 24 horas (HH:mm). No se permiten citas en el pasado.',
    ],
    [
      'Duración',
      'Opcional. Si la dejas vacía, la cita usa la duración configurada del servicio elegido; si escribes un número de minutos, ese valor manda.',
    ],
    [
      'Choques de horario',
      'Si la fecha/hora elegida ya está ocupada para ese profesional (o esa sala/equipo, si los indicaste), la fila se rechaza con el detalle del choque — igual que al reservar una cita manualmente.',
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

  for (const column of APPOINTMENT_COLUMNS) {
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

function writeLists(
  sheet: Worksheet,
  catalog: { professionalNames: string[]; serviceNames: string[]; roomNames: string[]; equipmentNames: string[] },
): void {
  sheet.columns = [
    { header: 'Profesionales', key: 'professionals', width: 28 },
    { header: 'Servicios', key: 'services', width: 30 },
    { header: 'Salas / Cabinas', key: 'rooms', width: 24 },
    { header: 'Equipos', key: 'equipment', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  const columns: string[][] = [
    catalog.professionalNames,
    catalog.serviceNames,
    catalog.roomNames,
    catalog.equipmentNames,
  ];

  const depth = Math.max(1, ...columns.map((values) => values.length));
  for (let index = 0; index < depth; index += 1) {
    sheet.addRow(columns.map((values) => values[index] ?? null));
  }

  // Referencia visible — a diferencia de Personal/Servicios (que la ocultan
  // porque solo alimenta fórmulas), aquí conviene que el usuario también la
  // pueda leer directamente, aunque ahora SÍ esté atada a los desplegables
  // de la hoja Citas (Profesional/Servicio/Sala/Equipo).
  sheet.state = 'visible';
}

export { normalizeHeader };
