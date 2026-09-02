import { Type } from 'class-transformer';
import { IsDateString, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ConsumedInsumoDto } from './consumed-insumo.dto';

/**
 * POST /patients/:id/clinical-records (Fase 4, plan §3). One executed
 * procedure against a ClinicalFormTemplate — `formDataValues` carries the
 * answers to that template's dynamic fields, `faceMappingData` the optional
 * facial/body mapping annotations from the interactive canvas (Fase 4,
 * plan.md "Mapeo Facial/Corporal"). Both are stored as-is: the DTO only
 * guarantees an object arrived, the meaning of its keys is a frontend/
 * template concern.
 */
export class CreateClinicalRecordDto {
  @IsUUID('4', { message: 'La plantilla no es válida.' })
  templateId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffId?: string;

  /** Cita que originó este procedimiento (Módulo 06 Fase 3, Task 3.2) —
   *  llega precargada cuando el registro se abre desde "Registrar Atención
   *  Clínica" en el detalle de una cita COMPLETED; opcional para el resto de
   *  los flujos (walk-in, carga histórica). */
  @IsOptional()
  @IsUUID('4', { message: 'La cita no es válida.' })
  appointmentId?: string;

  @IsObject({ message: 'Las respuestas del formulario deben ser un objeto.' })
  formDataValues!: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'El mapeo facial/corporal debe ser un objeto.' })
  faceMappingData?: Record<string, unknown>;

  /** Consumo real de un InventoryBatch (Módulo 07 Fase 3, Task 3.3) — al
   *  guardar, ClinicalRecordsService descuenta el stock y deja la fila de
   *  Kardex CLINICAL_CONSUMPTION en la misma transacción. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConsumedInsumoDto)
  consumedInsumo?: ConsumedInsumoDto;

  /** ISO datetime — cuándo se ejecutó el procedimiento, no cuándo se registró
   *  (puede cargarse después). Default now() en el servicio si se omite. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha del procedimiento no es válida.' })
  performedAt?: string;
}
