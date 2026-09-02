import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * POST /appointments/bulk-import — carga masiva vía JSON, para integraciones
 * externas (ej. n8n, otro sistema) que ya arman el arreglo en memoria en vez
 * de subir un archivo. Mismo motor de resolución/validación que el import
 * Excel (AppointmentsExcelImportService) — ver
 * AppointmentsService.bulkImport — pero sin la capa de lectura de hoja de
 * cálculo, ya que el llamador entrega los campos ya tipados.
 *
 * Diferencias deliberadas frente a la fila de Excel:
 *   - `staffMemberId`, `roomId` y `equipmentId` aceptan un UUID real O el
 *     nombre completo/exacto ("Ana Pérez", "Sala 2") — se resuelven en el
 *     servicio según si el valor matchea el patrón de UUID v4, así el mismo
 *     endpoint sirve tanto a un llamador programático (que ya tiene los ids
 *     de GET /appointments/rooms|equipment) como al wizard de importación
 *     desde Excel (que solo tiene el nombre que la persona escribió).
 *   - `endAt` es opcional: si viene, se usa tal cual (permite una duración
 *     distinta a la configurada, ej. una cita ya negociada con el
 *     paciente); si se omite, el servicio calcula el fin sumando
 *     `service.durationMinutes` a `startAt`, igual que hace `create()`.
 */
export class BulkImportAppointmentItemDto {
  @IsString({ message: 'El teléfono del paciente es obligatorio.' })
  patientPhone!: string;

  /** Solo de referencia — la búsqueda real es por `patientPhone`, igual que
   *  en la plantilla Excel. */
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El nombre del paciente no puede superar los 200 caracteres.' })
  patientName?: string;

  @IsString({ message: 'El nombre del servicio es obligatorio.' })
  @MaxLength(150, { message: 'El nombre del servicio no puede superar los 150 caracteres.' })
  serviceName!: string;

  /** UUID del profesional O su nombre completo — ver doc comment de la clase. */
  @IsString({ message: 'El profesional (id o nombre) es obligatorio.' })
  staffMemberId!: string;

  /** UUID de la sala/cabina O su nombre completo — ver doc comment de la clase. */
  @IsOptional()
  @IsString({ message: 'La sala/cabina (id o nombre) no es válida.' })
  roomId?: string;

  /** UUID del equipo O su nombre completo — ver doc comment de la clase. */
  @IsOptional()
  @IsString({ message: 'El equipo (id o nombre) no es válido.' })
  equipmentId?: string;

  @IsDateString({}, { message: 'La fecha/hora de inicio no es válida.' })
  startAt!: string;

  /** Opcional — ver doc comment de la clase. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha/hora de fin no es válida.' })
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las notas no pueden superar los 2000 caracteres.' })
  notes?: string;
}

export class BulkImportAppointmentsDto {
  @IsArray({ message: 'Envía un arreglo "appointments".' })
  @ArrayMinSize(1, { message: 'El arreglo "appointments" no puede estar vacío.' })
  @ArrayMaxSize(500, { message: 'No se pueden importar más de 500 citas por llamada.' })
  @ValidateNested({ each: true })
  @Type(() => BulkImportAppointmentItemDto)
  appointments!: BulkImportAppointmentItemDto[];

  /** false (por defecto) = mejor esfuerzo: las filas válidas se reservan
   *  aunque otras fallen, igual que /appointments/import. true = todo o
   *  nada: si CUALQUIER fila falla su validación, ninguna se escribe —
   *  se valida el lote completo primero y solo se escribe si no hubo
   *  ningún error. */
  @IsOptional()
  @IsBoolean({ message: '"failOnError" debe ser true o false.' })
  failOnError?: boolean;
}
