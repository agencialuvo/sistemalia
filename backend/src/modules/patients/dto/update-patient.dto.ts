import { PartialType } from '@nestjs/mapped-types';
import { CreatePatientDto } from './create-patient.dto';

/** PATCH /patients/:id — every field optional, `status` included (spec §3:
 *  "Actualizar datos personales o estado"). */
export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
