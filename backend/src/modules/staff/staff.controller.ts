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
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SpecialtiesService } from './specialties.service';
import { MAX_IMPORT_FILE_BYTES } from './staff-excel-import.service';
import { StaffMembersService } from './staff-members.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'];

/** Shared by both import routes below — same options ServicesController
 *  passes inline to its single /import route. */
function staffImportMulterOptions() {
  return {
    // memoryStorage so a rejected file never touches the disk, and so the
    // parser gets the buffer without a temp-file round trip.
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

/** UUID v4 for every :id — same as ServicesController's uuidParam: a
 *  malformed one is a 400 here instead of an opaque Prisma error further down. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Módulo 04 — Doctores, Especialidades y Gestión de Personal (spec §3).
 *
 * Every handler takes @TenantId(), which only resolves after
 * TenantContextInterceptor has verified the caller's membership, so no route
 * here can read or write outside the caller's centro estético.
 *
 * ROUTE ORDER IS LOAD-BEARING (same rule as ServicesController): the fixed
 * paths — /specialties and /absences/:absenceId — must precede /:id, or Nest
 * would match `GET /staff/specialties` as "the staff member whose id is
 * 'specialties'" first.
 */
@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(
    private readonly staff: StaffMembersService,
    private readonly specialties: SpecialtiesService,
  ) {}

  // -------------------------------------------------------------------------
  // Especialidades — rutas fijas, declaradas antes de /:id
  // -------------------------------------------------------------------------

  @Get('specialties')
  findSpecialties(@TenantId() tenantId: string, @Query('isActive') isActive?: string) {
    return this.specialties.findAll(tenantId, this.parseOptionalBoolean(isActive, 'isActive'));
  }

  @Post('specialties')
  @HttpCode(HttpStatus.CREATED)
  createSpecialty(@TenantId() tenantId: string, @Body() dto: CreateSpecialtyDto) {
    return this.specialties.create(tenantId, dto);
  }

  @Patch('specialties/:id')
  updateSpecialty(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateSpecialtyDto,
  ) {
    return this.specialties.update(tenantId, id, dto);
  }

  /** Deactivates when the specialty has staff attached, deletes when empty —
   *  the response says which happened (mirrors CategoriesService.remove). */
  @Delete('specialties/:id')
  removeSpecialty(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.specialties.remove(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Ausencias por id fijo — también antes de /:id
  // -------------------------------------------------------------------------

  @Delete('absences/:absenceId')
  removeAbsence(@TenantId() tenantId: string, @Param('absenceId', uuidParam) absenceId: string) {
    return this.staff.removeAbsence(tenantId, absenceId);
  }

  // -------------------------------------------------------------------------
  // Plantilla y carga masiva — también antes de /:id
  // -------------------------------------------------------------------------

  @Get('export-template')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="plantilla-personal-lia.xlsx"')
  async downloadTemplate(@TenantId() tenantId: string): Promise<StreamableFile> {
    const buffer = await this.staff.generateTemplate(tenantId);
    return new StreamableFile(buffer);
  }

  /**
   * POST /staff/import-preview — multipart/form-data, campo `file`.
   *
   * Analiza el archivo y no escribe nada: es lo que llama el modal de
   * importación antes de que el usuario confirme (mismo contrato que
   * ServicesController.importServices con `dryRun=true`, pero como ruta
   * propia en vez de query param).
   */
  @Post('import-preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', staffImportMulterOptions()))
  previewImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.staff.importFromExcel(tenantId, file, true);
  }

  /** POST /staff/import — multipart/form-data, campo `file`. Procesa el lote
   *  real: filas válidas se insertan, filas inválidas se reportan igual que
   *  en la vista previa. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', staffImportMulterOptions()))
  confirmImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.staff.importFromExcel(tenantId, file, false);
  }

  // -------------------------------------------------------------------------
  // Profesionales
  // -------------------------------------------------------------------------

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryStaffDto) {
    return this.staff.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.staff.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateStaffDto) {
    return this.staff.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(tenantId, id, dto);
  }

  /** Logical deactivation (isActive = false); the row is never removed. */
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.staff.deactivate(tenantId, id);
  }

  /** Genuine hard delete — distinct from `remove` above. Callers must confirm
   *  with the user first; there is no undo (see StaffMembersService.removePermanently). */
  @Delete(':id/permanent')
  removePermanently(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.staff.removePermanently(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Ausencias de un profesional
  // -------------------------------------------------------------------------

  @Get(':id/absences')
  findAbsences(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.staff.findAbsences(tenantId, id);
  }

  @Post(':id/absences')
  @HttpCode(HttpStatus.CREATED)
  createAbsence(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: CreateAbsenceDto,
  ) {
    return this.staff.createAbsence(tenantId, id, dto);
  }

  /**
   * Query-string flags arrive as text. Boolean("false") is `true`, so the
   * literals are matched explicitly and anything else is rejected instead of
   * being read as the opposite of what was asked (same as ServicesController).
   */
  private parseOptionalBoolean(value: string | undefined, field: string): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`El parámetro "${field}" debe ser true o false.`);
  }
}
