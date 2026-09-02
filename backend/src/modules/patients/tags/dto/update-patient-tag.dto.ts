import { PartialType } from '@nestjs/mapped-types';
import { CreatePatientTagDto } from './create-patient-tag.dto';

/** PATCH /patients/tags/:id — every field optional, same rules otherwise. */
export class UpdatePatientTagDto extends PartialType(CreatePatientTagDto) {}
