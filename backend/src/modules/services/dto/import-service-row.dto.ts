import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';

/**
 * One spreadsheet row, after coercion and before it becomes a Service.
 *
 * Extends CreateServiceDto minus two fields a spreadsheet cannot express, and
 * adds `categoryName` in place of the first:
 *
 *   - `categoryId` — the sheet names categories in words, and some of them do
 *     not exist yet at the moment the row is read.
 *   - `evaluationServiceId` — it points at another Service by id, which nobody
 *     can type into a cell. A row may therefore say "requiere valoración"
 *     without naming which service that is; the link is made afterwards from
 *     the UI, and the template's instructions sheet says so. This is the one
 *     rule the bulk path relaxes relative to the form, and it is relaxed
 *     because the alternative is refusing to import any service that needs a
 *     prior consult at all.
 *
 * Everything else is validated by exactly the same decorators as a row created
 * through the form. Deriving instead of restating them is what keeps the bulk
 * import from quietly becoming the way to get data past rules the form
 * enforces.
 */
export class ImportServiceRowDto extends OmitType(CreateServiceDto, [
  'categoryId',
  'evaluationServiceId',
] as const) {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'La categoría es obligatoria.' })
  @MaxLength(80)
  categoryName!: string;
}
