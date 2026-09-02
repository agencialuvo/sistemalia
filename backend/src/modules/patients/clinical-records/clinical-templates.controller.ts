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
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { TenantId } from '../../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ClinicalTemplateCategoriesService } from './clinical-template-categories.service';
import { ACCEPTED_EXTENSIONS, MAX_IMPORT_FILE_BYTES } from './clinical-templates-excel.service';
import { ClinicalRecordsService } from './clinical-records.service';
import { CreateClinicalTemplateCategoryDto } from './dto/create-clinical-template-category.dto';
import { CreateClinicalTemplateDto } from './dto/create-clinical-template.dto';
import { QueryClinicalTemplatesDto } from './dto/query-clinical-templates.dto';
import { UpdateClinicalTemplateCategoryDto } from './dto/update-clinical-template-category.dto';
import { UpdateClinicalTemplateDto } from './dto/update-clinical-template.dto';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

/**
 * Fase 4 — Form Builder (spec Fase 4 §3), enriquecido con: categorías
 * administrables por tenant, exportación/importación masiva y duplicado de
 * plantillas (duplicar vive enteramente en el frontend — un POST normal con
 * el mismo fieldsSchema y un nombre distinto, sin endpoint propio).
 *
 * ROUTE ORDER IS LOAD-BEARING para `categories`, `export` y `bulk-import` —
 * declaradas antes de `:id`, mismo criterio que ServicesController: si algún
 * día se agrega un `GET :id` aquí, sin este orden `/clinical-templates/export`
 * resolvería como "la plantilla cuyo id es 'export'".
 */
@Controller('clinical-templates')
@UseGuards(JwtAuthGuard)
export class ClinicalTemplatesController {
  constructor(
    private readonly clinicalRecords: ClinicalRecordsService,
    private readonly categories: ClinicalTemplateCategoriesService,
  ) {}

  // -------------------------------------------------------------------------
  // Categorías — rutas fijas, declaradas antes de /:id
  // -------------------------------------------------------------------------

  @Get('categories')
  findCategories(@TenantId() tenantId: string) {
    return this.categories.findAll(tenantId);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@TenantId() tenantId: string, @Body() dto: CreateClinicalTemplateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateClinicalTemplateCategoryDto,
  ) {
    return this.categories.update(tenantId, id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.categories.remove(tenantId, id);
  }

  // -------------------------------------------------------------------------
  // Exportación / Importación masiva — rutas fijas, declaradas antes de /:id
  // -------------------------------------------------------------------------

  @Get('export')
  async exportTemplates(
    @TenantId() tenantId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.clinicalRecords.exportTemplates(tenantId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantillas-clinicas-lia.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  /**
   * POST /clinical-templates/bulk-import — multipart/form-data, campo `file`.
   *
   * `?dryRun=true` analiza el archivo y no escribe nada: lo que llama el
   * modal de vista previa antes de que el usuario confirme.
   */
  @Post('bulk-import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        const extension = extname(file.originalname ?? '').toLowerCase();
        if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
          callback(
            new BadRequestException('El archivo debe ser .xlsx, .csv o .json.') as unknown as Error,
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  bulkImportTemplates(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.clinicalRecords.bulkImportTemplates(
      tenantId,
      file,
      this.parseOptionalBoolean(dryRun, 'dryRun') === true,
    );
  }

  // -------------------------------------------------------------------------
  // Plantillas
  // -------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateClinicalTemplateDto) {
    return this.clinicalRecords.createTemplate(tenantId, dto);
  }

  @Get()
  findAll(@TenantId() tenantId: string, @Query() query: QueryClinicalTemplatesDto) {
    return this.clinicalRecords.listTemplates(tenantId, query);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateClinicalTemplateDto,
  ) {
    return this.clinicalRecords.updateTemplate(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id', uuidParam) id: string) {
    return this.clinicalRecords.removeTemplate(tenantId, id);
  }

  private parseOptionalBoolean(value: string | undefined, field: string): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`El parámetro "${field}" debe ser true o false.`);
  }
}
