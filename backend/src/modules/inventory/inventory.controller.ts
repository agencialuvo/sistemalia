import {
  BadRequestException,
  Body,
  Controller,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryBatchesDto } from './dto/query-batches.dto';
import { QueryKardexDto } from './dto/query-kardex.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MAX_IMPORT_FILE_BYTES } from './inventory-excel-import.service';
import { InventoryService } from './inventory.service';

const uuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('El identificador no es válido.'),
});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_IMPORT_EXTENSIONS = ['.xlsx', '.csv'];

/**
 * Módulo 07 — Inventario y Control de Stock (spec §4: 6 endpoints, más carga
 * masiva de productos).
 *
 * ROUTE ORDER IS LOAD-BEARING for the fixed `products/template` and
 * `products/bulk-import` paths — same reasoning as ServicesController's doc
 * comment: they must be declared before any future `products/:id` GET, or a
 * request for one would resolve as "the product whose id is 'template'".
 * `products/:id` today is PATCH-only, so there is no live collision yet, but
 * the ordering is kept correct in case a GET :id is added later.
 */
@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('products')
  listProducts(@TenantId() tenantId: string, @Query() query: QueryProductsDto) {
    return this.inventory.listProducts(tenantId, query);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  createProduct(@TenantId() tenantId: string, @Body() dto: CreateProductDto) {
    return this.inventory.createProduct(tenantId, dto);
  }

  @Get('products/template')
  @Header('Content-Type', XLSX_MIME)
  @Header('Content-Disposition', 'attachment; filename="plantilla-productos-lia.xlsx"')
  async downloadProductsTemplate(@TenantId() tenantId: string): Promise<StreamableFile> {
    const buffer = await this.inventory.generateProductsTemplate(tenantId);
    return new StreamableFile(buffer);
  }

  /**
   * POST /inventory/products/bulk-import — multipart/form-data, campo `file`.
   *
   * `?dryRun=true` analiza el archivo y no escribe nada: es lo que llama el
   * modal de vista previa antes de que el usuario confirme. Por defecto
   * importa de verdad.
   */
  @Post('products/bulk-import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      // memoryStorage so a rejected file never touches disk, and so the
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
  bulkImportProducts(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.inventory.importProductsFromExcel(
      tenantId,
      file,
      this.parseOptionalBoolean(dryRun, 'dryRun') === true,
    );
  }

  @Patch('products/:id')
  updateProduct(
    @TenantId() tenantId: string,
    @Param('id', uuidParam) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventory.updateProduct(tenantId, id, dto);
  }

  @Get('batches')
  listBatches(@TenantId() tenantId: string, @Query() query: QueryBatchesDto) {
    return this.inventory.listBatches(tenantId, query);
  }

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  createBatch(@TenantId() tenantId: string, @Body() dto: CreateBatchDto) {
    return this.inventory.createBatch(tenantId, dto);
  }

  @Get('kardex')
  listKardex(@TenantId() tenantId: string, @Query() query: QueryKardexDto) {
    return this.inventory.listKardex(tenantId, query);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  createMovement(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMovementDto,
  ) {
    return this.inventory.createMovement(tenantId, userId, dto);
  }

  private parseOptionalBoolean(value: string | undefined, field: string): boolean | undefined {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException(`El parámetro "${field}" debe ser true o false.`);
  }
}
