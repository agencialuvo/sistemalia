import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TenantId } from '../../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ClinicalRecordsService } from './clinical-records.service';
import { CreateClinicalRecordDto } from './dto/create-clinical-record.dto';
import { UpdateClinicalRecordDto } from './dto/update-clinical-record.dto';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Fase 4 — registro de procedimientos por paciente (spec Fase 4 §3). Vive en
 * un controller separado (mismo prefijo `/patients` que PatientsController,
 * Nest permite varios controllers compartiendo prefijo mientras no repitan
 * ruta+método) para mantener el submódulo clinical-records autocontenido en
 * vez de mezclar sus imports dentro de patients.controller.ts.
 */
@Controller('patients')
@UseGuards(JwtAuthGuard)
export class ClinicalPatientRecordsController {
  constructor(private readonly clinicalRecords: ClinicalRecordsService) {}

  @Post(':id/clinical-records')
  @HttpCode(HttpStatus.CREATED)
  create(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) patientId: string,
    @Body() dto: CreateClinicalRecordDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.clinicalRecords.createProcedureRecord(tenantId, patientId, dto, userId);
  }

  @Get(':id/clinical-records')
  findAll(@TenantId() tenantId: string, @Param('id', uuidParam) patientId: string) {
    return this.clinicalRecords.listProcedureRecords(tenantId, patientId);
  }

  @Patch(':id/clinical-records/:recordId')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) patientId: string,
    @Param('recordId', uuidParam) recordId: string,
    @Body() dto: UpdateClinicalRecordDto,
  ) {
    return this.clinicalRecords.updateProcedureRecord(tenantId, patientId, recordId, dto);
  }

  @Delete(':id/clinical-records/:recordId')
  remove(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) patientId: string,
    @Param('recordId', uuidParam) recordId: string,
  ) {
    return this.clinicalRecords.deleteProcedureRecord(tenantId, patientId, recordId);
  }
}
