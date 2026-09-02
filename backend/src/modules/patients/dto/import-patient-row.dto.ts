import { OmitType } from '@nestjs/mapped-types';
import { CreatePatientDto } from './create-patient.dto';

/**
 * One spreadsheet row, after coercion and before it becomes a Patient.
 *
 * Extends CreatePatientDto minus `status` — a bulk-imported patient always
 * starts ACTIVE (the sheet has no "Estado" column; Prisma's own `@default`
 * applies when the key is absent from the write), same reasoning as
 * ImportServiceRowDto omitting fields the sheet cannot express.
 *
 * Everything else on CreatePatientDto — including `documentType`, `phone`,
 * `birthDate`, `address`, `district`, `acquisitionChannel` and `tags` — is
 * directly sheet-fillable and needs no name-to-id resolution step (unlike
 * Servicios' categoryName or Personal's specialtyName): Patient.tags is
 * already free text, and there is no separate FK for any of these columns.
 *
 * `allergies` — the sheet's "Alergias / Antecedentes" column — is
 * deliberately NOT here: it is not a Patient column at all (it lives on
 * PatientMedicalHistory, a separate 1:1 table), so
 * PatientsExcelImportService pulls it out of the coerced row before this DTO
 * ever sees it, the same way ImportStaffRowDto's specialtyName/serviceNames
 * are pulled out before validation.
 */
export class ImportPatientRowDto extends OmitType(CreatePatientDto, ['status'] as const) {}
