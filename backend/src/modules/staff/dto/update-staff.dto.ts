import { PartialType } from '@nestjs/mapped-types';
import { CreateStaffDto } from './create-staff.dto';

/**
 * PATCH /staff/:id.
 *
 * Every field optional, `serviceIds` and `schedules` included — sending
 * either replaces that whole sub-resource (see CreateStaffDto's doc comment);
 * omitting them leaves the existing rows untouched.
 */
export class UpdateStaffDto extends PartialType(CreateStaffDto) {}
