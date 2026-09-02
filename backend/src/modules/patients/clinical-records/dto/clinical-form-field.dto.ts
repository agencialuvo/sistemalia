import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Mirrors FORM_FIELD_TYPES in src/lib/validators/clinical-template.ts —
 *  kept as a plain string union (not a Prisma enum) since `fieldsSchema` is
 *  a Json column: adding a field type never needs a migration. */
export const FORM_FIELD_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'CHECKBOX', 'TEXTAREA'] as const;

/** One field descriptor inside `fieldsSchema.fields` (Form Builder, spec Fase
 *  4 §1: "id, label, type, options (opcional), required"). */
export class ClinicalFormFieldDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El id del campo es obligatorio.' })
  @MaxLength(80, { message: 'El id del campo no puede superar los 80 caracteres.' })
  id!: string;

  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'La etiqueta del campo es obligatoria.' })
  @MaxLength(150, { message: 'La etiqueta no puede superar los 150 caracteres.' })
  label!: string;

  @IsIn(FORM_FIELD_TYPES, { message: 'El tipo de campo no es válido.' })
  type!: (typeof FORM_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray({ message: 'Las opciones deben ser una lista.' })
  @ArrayMaxSize(50, { message: 'Máximo 50 opciones por campo.' })
  @IsString({ each: true, message: 'Cada opción debe ser texto.' })
  @MaxLength(120, { each: true, message: 'Cada opción admite máximo 120 caracteres.' })
  options?: string[];

  @IsBoolean({ message: 'El campo obligatorio debe ser verdadero o falso.' })
  required!: boolean;
}

/** The full `fieldsSchema` JSON value (spec Fase 4 §1). The FaceMapping visor
 *  in clinical-record-form-dialog shows whenever `hasFaceMapping` is true OR
 *  `category === 'INJECTABLE'` — a template builder defaults the switch on
 *  for INJECTABLE but the user can override it either way for any category
 *  (ej. una ficha CORPORAL que también aplica toxina en zonas puntuales). */
export class ClinicalFormTemplateSchemaDto {
  /** Free text, not a closed enum: categories are now a per-tenant catalogue
   *  (ClinicalTemplateCategoriesService) the tenant administers from
   *  "Gestionar Categorías", same "name is the value, catalogue is
   *  resolved/auto-created at write time" contract as categoryName in
   *  services/dto/import-service-row.dto.ts. */
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'La categoría de la plantilla es obligatoria.' })
  @MaxLength(60, { message: 'La categoría no puede superar los 60 caracteres.' })
  category!: string;

  @IsOptional()
  @IsBoolean({ message: 'El mapeo facial debe ser verdadero o falso.' })
  hasFaceMapping?: boolean;

  @IsArray({ message: 'La estructura de campos debe ser una lista.' })
  @ArrayMinSize(1, { message: 'La plantilla debe tener al menos un campo.' })
  @ValidateNested({ each: true })
  @Type(() => ClinicalFormFieldDto)
  fields!: ClinicalFormFieldDto[];
}
