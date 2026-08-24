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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { QueryServicesDto } from './dto/query-services.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { MAX_IMPORT_FILE_BYTES } from './excel-import.service';
import { ServicesService } from './services.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'];

/** UUID v4 for every :id — a malformed one is a 400 here instead of an opaque
 *  Prisma error further down. */
const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Módulo 03 — catálogo de servicios (spec §3).
 *
 * Every handler takes @TenantId(), which only resolves after
 * TenantContextInterceptor has verified the caller's membership, so no route
 * here can read or write outside the caller's centro estético.
 *
 * ROUTE ORDER IS LOAD-BEARING. Nest matches in declaration order, so the fixed
 * paths — /categories and /template — must precede /:id. Move @Get(':id') above
 * them and a request for /services/template resolves as "the service whose id
 * is 'template'", which is a 400 the user cannot make sense of.
 */
@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(
    private readonly services: ServicesService,
    private readonly categories: CategoriesService,
  ) {}

  // -------------------------------------------------------------------------
  // Categorías — rutas fijas, declaradas antes de /:id
  // -------------------------------------------------------------------------

  @Get('categories')
  findCategories(@TenantId() tenantId: string, @Query('isActive') isActive?: string) {
    return this.categories.findAll(tenantId, this.parseOptionalBoolean(isActive, 'isActive'));
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(tenantId, id, dto);
  }

  /** Deactivates when the category has services, deletes when it is empty —
   *  the response says which happened. */
  @Delete('categories/:id')
  removeCategory(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.categories.remove(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Plantilla y carga masiva — también antes de /:id
  // -------------------------------------------------------------------------

  @Get('template')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="plantilla-servicios-lia.xlsx"')
  async downloadTemplate(@TenantId() tenantId: string): Promise<StreamableFile> {
    const buffer = await this.services.generateTemplate(tenantId);
    return new StreamableFile(buffer);
  }

  /**
   * POST /services/import — multipart/form-data, campo `file`.
   *
   * `?dryRun=true` analyses the file and writes nothing: that is what the
   * preview modal calls so the user sees the row-by-row report before
   * committing (spec §4.4). The default is a real import.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      // memoryStorage so a rejected file never touches the disk, and so the
      // parser gets the buffer without a temp-file round trip.
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        const extension = extname(file.originalname ?? '').toLowerCase();
        if (!ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
          callback(
            new BadRequestException('El archivo debe ser .xlsx o .csv.') as unknown as Error,
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  importServices(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.services.importFromExcel(
      tenantId,
      file,
      this.parseOptionalBoolean(dryRun, 'dryRun') === true,
    );
  }

  // -------------------------------------------------------------------------
  // Servicios
  // -------------------------------------------------------------------------

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryServicesDto) {
    return this.services.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.services.findOne(tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateServiceDto) {
    return this.services.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(tenantId, id, dto);
  }

  /** Logical deactivation (isActive = false); the row is never removed. */
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.services.deactivate(tenantId, id);
  }

  /** Genuine hard delete — see ServicesService.removePermanently for the
   *  cascade/nullify consequences the frontend must warn about first. */
  @Delete(':id/permanent')
  removePermanently(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.services.removePermanently(tenantId, id);
  }

  /**
   * Query-string flags arrive as text. Boolean("false") is `true`, so the
   * literals are matched explicitly and anything else is rejected instead of
   * being read as the opposite of what was asked.
   */
  private parseOptionalBoolean(value: string | undefined, field: string): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`El parámetro "${field}" debe ser true o false.`);
  }
}
