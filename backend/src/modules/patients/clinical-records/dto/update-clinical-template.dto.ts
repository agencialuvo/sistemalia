import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateClinicalTemplateDto } from './create-clinical-template.dto';

/** PATCH /clinical-templates/:id. `isActive` lives only here (not on create):
 *  a brand-new template always starts active, same convention as
 *  CreatePatientDto/UpdatePatientDto's `status`. Deactivating is the only
 *  form of "delete" this resource has — its historical
 *  ClinicalProcedureRecords must never lose the template they point to. */
export class UpdateClinicalTemplateDto extends PartialType(CreateClinicalTemplateDto) {
  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser verdadero o falso.' })
  isActive?: boolean;
}
