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
import { MAX_IMPORT_FILE_BYTES } from './appointments-excel-import.service';
import { AppointmentsService } from './appointments.service';
import { BulkImportAppointmentsDto } from './dto/bulk-import-appointments.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { QueryAppointmentsGridDto } from './dto/query-appointments-grid.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-status.dto';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'];

/** Compartido por ambas rutas de importación — mismas opciones que
 *  StaffController's staffImportMulterOptions. */
function appointmentsImportMulterOptions() {
  return {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    fileFilter: (
      _request: unknown,
      file: Express.Multer.File,
      callback: (error: Error | null, accept: boolean) => void,
    ) => {
      const extension = extname(file.originalname ?? '').toLowerCase();
      if (!ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
        callback(new BadRequestException('El archivo debe ser .xlsx o .csv.') as unknown as Error, false);
        return;
      }
      callback(null, true);
    },
  };
}

/**
 * Módulo 06 — Engine de Reservas y Agenda Interactiva (spec §4).
 *
 * ROUTE ORDER: /slots, /grid, /rooms, /equipment y las rutas de plantilla/
 * carga masiva van antes de /:id — mismo motivo que /patients/import en
 * PatientsController: aunque ninguno podría coincidir con un ParseUUIDPipe,
 * declararlos primero deja explícito que no compiten con la familia /:id.
 */
@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('slots')
  getSlots(@TenantId() tenantId: string, @Query() query: QuerySlotsDto) {
    return this.appointments.getAvailableSlots(tenantId, query);
  }

  @Get('grid')
  getGrid(@TenantId() tenantId: string, @Query() query: QueryAppointmentsGridDto) {
    return this.appointments.getGrid(tenantId, query);
  }

  @Get('rooms')
  listRooms(@TenantId() tenantId: string) {
    return this.appointments.listRooms(tenantId);
  }

  @Get('equipment')
  listEquipment(@TenantId() tenantId: string) {
    return this.appointments.listEquipment(tenantId);
  }

  @Get('export-template')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="plantilla-citas-lia.xlsx"')
  async downloadTemplate(@TenantId() tenantId: string): Promise<StreamableFile> {
    const buffer = await this.appointments.generateTemplate(tenantId);
    return new StreamableFile(buffer);
  }

  /** POST /appointments/import-preview — multipart/form-data, campo `file`.
   *  Analiza el archivo y no escribe nada (dryRun=true). */
  @Post('import-preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', appointmentsImportMulterOptions()))
  previewImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.appointments.importFromExcel(tenantId, file, true);
  }

  /** POST /appointments/import — multipart/form-data, campo `file`. Procesa
   *  el lote real: filas válidas se reservan, filas inválidas se reportan
   *  igual que en la vista previa. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', appointmentsImportMulterOptions()))
  confirmImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.appointments.importFromExcel(tenantId, file, false);
  }

  /**
   * POST /appointments/bulk-import — JSON body `{ "appointments": [...] }`,
   * pensado para integraciones externas (ej. n8n) que ya arman el arreglo en
   * memoria en vez de subir un archivo. Mismo motor de validación/choque de
   * horario que /import, sin la capa de lectura de Excel — ver
   * AppointmentsService.bulkImport y BulkImportAppointmentsDto.
   */
  @Post('bulk-import')
  @HttpCode(HttpStatus.OK)
  bulkImport(@TenantId() tenantId: string, @Body() dto: BulkImportAppointmentsDto) {
    return this.appointments.bulkImport(tenantId, dto);
  }

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryAppointmentsDto) {
    return this.appointments.findAll(tenantId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.appointments.findOne(tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.updateStatus(tenantId, id, dto);
  }

  @Patch(':id/reschedule')
  reschedule(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointments.reschedule(tenantId, id, dto);
  }

  @Delete(':id')
  cancel(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancel(tenantId, id, dto);
  }
}
