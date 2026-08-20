import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

/**
 * PATCH /services/categories/:id — every field optional, same rules otherwise.
 *
 * PartialType re-applies the parent's decorators as optional, so a validation
 * rule fixed in CreateCategoryDto is fixed here too. Hand-copying the fields
 * is how the two drift apart.
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
