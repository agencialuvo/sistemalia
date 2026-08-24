import { PartialType } from '@nestjs/mapped-types';
import { CreateSpecialtyDto } from './create-specialty.dto';

/** PATCH /staff/specialties/:id — every field optional, same rules otherwise. */
export class UpdateSpecialtyDto extends PartialType(CreateSpecialtyDto) {}
