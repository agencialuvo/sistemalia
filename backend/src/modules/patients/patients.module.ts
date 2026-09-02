import { Module } from '@nestjs/common';
import { ClinicalRecordsModule } from './clinical-records/clinical-records.module';
import { PatientsController } from './patients.controller';
import { PatientsExcelImportService } from './patients-excel-import.service';
import { PatientsService } from './patients.service';
import { PatientTagsService } from './tags/patient-tags.service';

/**
 * Módulo 05 — Gestión de Pacientes y CRM Operativo (Fase 1: Backend Core).
 *
 * PrismaModule is global (see PrismaModule), so it is not imported here.
 * PatientsService is exported the same way StaffMembersService is: a future
 * Agenda module will need to resolve/validate patientId too.
 *
 * ClinicalRecordsModule (Fase 4) stays self-contained in its own submódulo
 * (its routes live under a path — /patients/:id/clinical-records — that
 * can't collide with PatientsController's own /:id family). PatientTagsService
 * does NOT get that treatment: its catalog routes (/patients/tags/*) share
 * PatientsController's exact prefix, so its route registration order HAS to
 * be guaranteed relative to /:id — see PatientsController's ROUTE ORDER
 * comment. That only works with a single shared controller, so the tags
 * routes were merged into PatientsController directly instead of living
 * behind their own PatientTagsController/Module.
 */
@Module({
  imports: [ClinicalRecordsModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientTagsService, PatientsExcelImportService],
  exports: [PatientsService],
})
export class PatientsModule {}
