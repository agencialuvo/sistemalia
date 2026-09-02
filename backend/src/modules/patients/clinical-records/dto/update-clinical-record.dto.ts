import { IsDateString, IsObject, IsOptional, IsUUID } from 'class-validator';

/**
 * PATCH /patients/:id/clinical-records/:recordId.
 *
 * Deliberately NOT `PartialType(CreateClinicalRecordDto)` — `templateId` is
 * excluded on purpose. Changing the template after the fact would leave
 * `formDataValues` shaped for a schema the record no longer points to; the
 * template a procedure was built against is fixed for its lifetime, only its
 * answers/insumo/mapping can be corrected.
 */
export class UpdateClinicalRecordDto {
  @IsOptional()
  @IsUUID('4', { message: 'El profesional no es válido.' })
  staffId?: string;

  @IsOptional()
  @IsObject({ message: 'Las respuestas del formulario deben ser un objeto.' })
  formDataValues?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'El mapeo facial/corporal debe ser un objeto.' })
  faceMappingData?: Record<string, unknown>;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha del procedimiento no es válida.' })
  performedAt?: string;
}
