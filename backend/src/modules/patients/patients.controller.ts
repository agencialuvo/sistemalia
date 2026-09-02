import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { CreateGalleryImageDto } from './dto/create-gallery-image.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpsertMedicalHistoryDto } from './dto/upsert-medical-history.dto';
import { MAX_IMPORT_FILE_BYTES } from './patients-excel-import.service';
import { PatientsService } from './patients.service';
import { CreatePatientTagDto } from './tags/dto/create-patient-tag.dto';
import { UpdatePatientTagDto } from './tags/dto/update-patient-tag.dto';
import { PatientTagsService } from './tags/patient-tags.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'];

/** Same options StaffController passes to its own import routes. */
function patientsImportMulterOptions() {
  return {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    fileFilter: (_request: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
      const extension = extname(file.originalname ?? '').toLowerCase();
      if (!ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
        callback(new BadRequestException('El archivo debe ser .xlsx o .csv.') as unknown as Error, false);
        return;
      }
      callback(null, true);
    },
  };
}

/** UUID v4 for every :id — same as ServicesController/StaffController's
 *  uuidParam: a malformed one is a 400 here instead of an opaque Prisma error
 *  further down. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Módulo 05 — Gestión de Pacientes y CRM Operativo (spec §3).
 *
 * Every handler takes @TenantId(), which only resolves after
 * TenantContextInterceptor has verified the caller's membership, so no route
 * here can read or write outside the caller's centro estético.
 *
 * ROUTE ORDER: /export-template, /import-preview, /bulk-import and /tags
 * precede the /:id family — same reason
 * StaffController documents for /specialties and ServicesController for
 * /categories: Nest/Express match routes in registration order, so
 * `GET /patients/:id` registered first would swallow `GET /patients/tags`,
 * treating "tags" as the patient id and failing UUID validation. The tag
 * catalog's CRUD used to live in its own PatientTagsController/Module (a
 * separate `/patients/tags` prefix) — that's exactly what triggered the bug:
 * cross-module registration order isn't something you can pin reliably, only
 * routes declared in the SAME controller are guaranteed to register in
 * source order. Merged in here, with PatientTagsService injected directly,
 * for that guarantee.
 */
@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly tags: PatientTagsService,
  ) {}

  // -------------------------------------------------------------------------
  // Plantilla y carga masiva — antes de /:id
  // -------------------------------------------------------------------------

  @Get('export-template')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="plantilla-pacientes-lia.xlsx"')
  async downloadTemplate(@TenantId() tenantId: string): Promise<StreamableFile> {
    const buffer = await this.patients.generateTemplate(tenantId);
    return new StreamableFile(buffer);
  }

  /** POST /patients/import-preview — multipart/form-data, campo `file`.
   *  Analiza el archivo y no escribe nada (mismo contrato que
   *  StaffController.previewImport). */
  @Post('import-preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', patientsImportMulterOptions()))
  previewImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.patients.importFromExcel(tenantId, file, true);
  }

  /** POST /patients/bulk-import — multipart/form-data, campo `file`. Procesa
   *  el lote real: filas válidas se insertan, filas inválidas se reportan
   *  igual que en la vista previa. */
  @Post('bulk-import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', patientsImportMulterOptions()))
  confirmImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.patients.importFromExcel(tenantId, file, false);
  }

  // -------------------------------------------------------------------------
  // Catálogo de etiquetas — antes de /:id (ver ROUTE ORDER arriba)
  // -------------------------------------------------------------------------

  @Get('tags')
  findAllTags(@TenantId() tenantId: string) {
    return this.tags.findAll(tenantId);
  }

  @Post('tags')
  @HttpCode(HttpStatus.CREATED)
  createTag(@TenantId() tenantId: string, @Body() dto: CreatePatientTagDto) {
    return this.tags.create(tenantId, dto);
  }

  @Patch('tags/:id')
  updateTag(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdatePatientTagDto,
  ) {
    return this.tags.update(tenantId, id, dto);
  }

  @Delete('tags/:id')
  removeTag(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.tags.remove(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Pacientes
  // -------------------------------------------------------------------------

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: PatientQueryDto) {
    return this.patients.findAll(tenantId, query);
  }

  /** GET /patients/stats — antes de /:id (ver ROUTE ORDER arriba: si no,
   *  "stats" se intentaría parsear como UUID de paciente). */
  @Get('stats')
  getStats(@TenantId() tenantId: string) {
    return this.patients.getStats(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreatePatientDto) {
    return this.patients.create(tenantId, dto);
  }

  /** Ficha 360° completa (spec §3: "Obtener la Ficha 360° completa"). */
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.patients.getPatientProfile360(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(tenantId, id, dto);
  }

  /** Inactivado/archivado lógico (spec §3) — el registro nunca se borra. */
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.patients.remove(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Antecedentes médicos
  // -------------------------------------------------------------------------

  @Get(':id/medical-history')
  getMedicalHistory(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.patients.getMedicalHistory(tenantId, id);
  }

  @Put(':id/medical-history')
  upsertMedicalHistory(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpsertMedicalHistoryDto,
  ) {
    return this.patients.upsertMedicalHistory(tenantId, id, dto);
  }

  // -------------------------------------------------------------------------
  // Notas clínicas
  // -------------------------------------------------------------------------

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  createClinicalNote(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: CreateClinicalNoteDto,
  ) {
    return this.patients.createClinicalNote(tenantId, id, dto);
  }

  // -------------------------------------------------------------------------
  // Galería antes/después
  // -------------------------------------------------------------------------

  @Post(':id/gallery')
  @HttpCode(HttpStatus.CREATED)
  addGalleryImage(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: CreateGalleryImageDto,
  ) {
    return this.patients.addGalleryImage(tenantId, id, dto);
  }

  @Delete(':id/gallery/:imageId')
  removeGalleryImage(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Param('imageId', uuidParam) imageId: string,
  ) {
    return this.patients.removeGalleryImage(tenantId, id, imageId);
  }
}
