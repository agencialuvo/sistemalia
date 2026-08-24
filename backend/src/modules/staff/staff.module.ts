import { Module } from '@nestjs/common';
import { SpecialtiesService } from './specialties.service';
import { StaffController } from './staff.controller';
import { StaffExcelImportService } from './staff-excel-import.service';
import { StaffMembersService } from './staff-members.service';

/**
 * Módulo 04 — Doctores, Especialidades y Gestión de Personal.
 *
 * PrismaModule is global (see PrismaModule), so it is not imported here.
 * SpecialtiesService is exported the same way CategoriesService is: future
 * modules (Agenda) will need to resolve/validate specialtyId too.
 */
@Module({
  controllers: [StaffController],
  providers: [StaffMembersService, SpecialtiesService, StaffExcelImportService],
  exports: [StaffMembersService, SpecialtiesService],
})
export class StaffModule {}
