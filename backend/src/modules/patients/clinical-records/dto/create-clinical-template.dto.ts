import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ClinicalFormTemplateSchemaDto } from './clinical-form-field.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * POST /clinical-templates (Fase 4, Form Builder). `fieldsSchema` is the
 * dynamic form definition the frontend's Form Builder produces — a category
 * plus a list of field descriptors — so a tenant can design its own fichas
 * (ej. "Ficha de Toxina Botulínica") without a migration.
 */
export class CreateClinicalTemplateDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre de la plantilla es obligatorio.' })
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000, { message: 'La descripción no puede superar los 2000 caracteres.' })
  description?: string;

  @ValidateNested()
  @Type(() => ClinicalFormTemplateSchemaDto)
  fieldsSchema!: ClinicalFormTemplateSchemaDto;
}
