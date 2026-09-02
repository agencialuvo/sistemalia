import { PartialType } from '@nestjs/mapped-types';
import { CreateClinicalTemplateCategoryDto } from './create-clinical-template-category.dto';

/** PATCH /clinical-templates/categories/:id — rename and/or recolor. System
 *  categories can be recolored but not renamed (the service layer rejects a
 *  name change) — several defaults are looked up by name elsewhere (the
 *  Form Builder's INJECTABLE default, the delete-reassignment fallback), so
 *  renaming one would silently break those. DELETE is blocked outright. */
export class UpdateClinicalTemplateCategoryDto extends PartialType(
  CreateClinicalTemplateCategoryDto,
) {}
