import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryBatchesDto } from './dto/query-batches.dto';
import { QueryKardexDto } from './dto/query-kardex.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InventoryExcelImportService, ParseResult } from './inventory-excel-import.service';
import { serializeBatch, serializeMovement, serializeProduct } from './serializers/inventory.serializer';

export interface ImportProductsResult extends ParseResult {
  /** Rows actually written — 0 on a dry run. */
  imported: number;
  dryRun: boolean;
}

const PRODUCT_REF_SELECT = { id: true, name: true, sku: true, unitOfMeasure: true } satisfies Prisma.ProductSelect;
const BATCH_REF_SELECT = {
  id: true,
  lotNumber: true,
  expirationDate: true,
} satisfies Prisma.InventoryBatchSelect;
const PERFORMED_BY_SELECT = { id: true, fullName: true } satisfies Prisma.UserSelect;

const MOVEMENT_INCLUDE = {
  product: { select: PRODUCT_REF_SELECT },
  batch: { select: BATCH_REF_SELECT },
  performedBy: { select: PERFORMED_BY_SELECT },
} satisfies Prisma.StockMovementInclude;

/**
 * Módulo 07 — Inventario y Control de Stock (Fase 1: Backend Core).
 *
 * El stock vivo de un producto es SIEMPRE la suma de InventoryBatch.currentQuantity
 * entre sus lotes activos — Product no lleva un contador propio. Toda
 * escritura que mueve stock (entrada de lote, ajuste, merma, baja) actualiza
 * el lote y crea su fila de Kardex (StockMovement) dentro de la misma
 * transacción Prisma, para que el saldo del lote y el historial nunca
 * puedan desincronizarse.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: InventoryExcelImportService,
  ) {}

  // -------------------------------------------------------------------------
  // Productos
  // -------------------------------------------------------------------------

  /** GET /inventory/products. */
  async listProducts(tenantId: string, query: QueryProductsDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;

    const where: Prisma.ProductWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { batches: { where: { isActive: true }, select: { currentQuantity: true } } },
        orderBy: { name: 'asc' },
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.product.count({ where }),
    ]);

    const data = products.map(({ batches, ...product }) => {
      const totalStock = batches.reduce(
        (sum, batch) => sum.plus(batch.currentQuantity),
        new Prisma.Decimal(0),
      );
      return serializeProduct(product, totalStock);
    });

    return {
      data,
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  /** POST /inventory/products. */
  async createProduct(tenantId: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, sku: dto.sku },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe un producto con ese SKU en tu centro estético.');
    }

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        sku: dto.sku,
        type: dto.type,
        categoryId: dto.categoryId ?? null,
        brand: dto.brand ?? null,
        unitOfMeasure: dto.unitOfMeasure,
        minStock: dto.minStock ?? 0,
        costPrice: dto.costPrice,
        salePrice: dto.salePrice ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    this.logger.log(`Producto ${product.id} creado en el centro ${tenantId}.`);
    return serializeProduct(product, new Prisma.Decimal(0));
  }

  /** PATCH /inventory/products/:id — edición y activar/desactivar (no hay
   *  borrado físico, ver doc comment de UpdateProductDto). */
  async updateProduct(tenantId: string, id: string, dto: UpdateProductDto) {
    const current = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El producto no existe o no pertenece a tu centro estético.');
    }

    if (dto.sku && dto.sku !== current.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Ya existe un producto con ese SKU en tu centro estético.');
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku,
        type: dto.type,
        categoryId: dto.categoryId === undefined ? undefined : (dto.categoryId ?? null),
        brand: dto.brand === undefined ? undefined : (dto.brand ?? null),
        unitOfMeasure: dto.unitOfMeasure,
        minStock: dto.minStock,
        costPrice: dto.costPrice,
        salePrice: dto.salePrice === undefined ? undefined : (dto.salePrice ?? null),
        isActive: dto.isActive,
      },
      include: { batches: { where: { isActive: true }, select: { currentQuantity: true } } },
    });

    const totalStock = product.batches.reduce(
      (sum, batch) => sum.plus(batch.currentQuantity),
      new Prisma.Decimal(0),
    );
    this.logger.log(`Producto ${product.id} actualizado en el centro ${tenantId}.`);
    const { batches: _batches, ...rest } = product;
    return serializeProduct(rest, totalStock);
  }

  // -------------------------------------------------------------------------
  // Carga masiva
  // -------------------------------------------------------------------------

  /** The .xlsx behind GET /inventory/products/template, seeded with this
   *  tenant's existing SKUs (reference only — see the generator's doc
   *  comment on why they are not a dropdown) and category names (a soft
   *  dropdown, same as Services' categoryName). */
  async generateProductsTemplate(tenantId: string): Promise<Buffer> {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId }, select: { sku: true }, orderBy: { sku: 'asc' } }),
      this.prisma.productCategory.findMany({ where: { tenantId }, select: { name: true }, orderBy: { name: 'asc' } }),
    ]);
    return this.excel.generateTemplate(
      products.map((product) => product.sku),
      categories.map((category) => category.name),
    );
  }

  /**
   * POST /inventory/products/bulk-import.
   *
   * Valid, non-duplicate rows are imported and every other row is reported;
   * a single bad or duplicate SKU does not sink the rest of the file.
   * `dryRun` runs the exact same analysis without writing anything — the
   * preview table calls this first, then the same endpoint again with
   * `dryRun=false` once the user confirms.
   */
  async importProductsFromExcel(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<ImportProductsResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta un archivo .xlsx o .csv en el campo "file".');
    }

    const [existing, existingCategories] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId }, select: { sku: true } }),
      this.prisma.productCategory.findMany({ where: { tenantId }, select: { name: true } }),
    ]);

    const parsed = await this.excel.parseAndValidateExcel(file.buffer, {
      existingSkus: existing.map((product) => product.sku),
      existingCategories: existingCategories.map((category) => category.name),
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      // Missing categories are created up front — same "resolve by name,
      // autocreate the rest" contract as Services' categoryName, done once
      // per name rather than once per row.
      for (const name of parsed.newCategoryNames) {
        await tx.productCategory.create({ data: { tenantId, name } });
      }
      const categoryIdByName = new Map<string, string>();
      for (const category of await tx.productCategory.findMany({ where: { tenantId } })) {
        categoryIdByName.set(normalizeCategoryKey(category.name), category.id);
      }

      let count = 0;
      for (const row of parsed.data) {
        const categoryName = row.product.categoryName?.trim();
        const categoryId = categoryName ? (categoryIdByName.get(normalizeCategoryKey(categoryName)) ?? null) : null;

        const product = await tx.product.create({
          data: {
            tenantId,
            name: row.product.name,
            sku: row.product.sku,
            type: row.product.type,
            categoryId,
            brand: row.product.brand ?? null,
            unitOfMeasure: row.product.unitOfMeasure,
            minStock: row.product.minStock ?? 0,
            costPrice: row.product.costPrice,
            salePrice: row.product.salePrice ?? null,
            isActive: row.product.isActive ?? true,
          },
        });

        // "Stock Inicial" > 0: open its first lote and the INITIAL_STOCK
        // kardex row that records it — a distinct StockMovementType from
        // PURCHASE_INPUT (used by the manual "Ingresar Lote" flow) so the
        // Kardex can tell a bulk-import opening balance apart from an actual
        // purchase entered later. InventoryExcelImportService's
        // checkBatchConsistency already guaranteed lotNumber/expirationDate
        // are present whenever initialStock is (spec §1.3).
        if (row.product.initialStock && row.product.initialStock > 0) {
          const batch = await tx.inventoryBatch.create({
            data: {
              tenantId,
              productId: product.id,
              lotNumber: row.product.lotNumber!,
              expirationDate: new Date(row.product.expirationDate!),
              initialQuantity: row.product.initialStock,
              currentQuantity: row.product.initialStock,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: product.id,
              batchId: batch.id,
              type: 'INITIAL_STOCK',
              quantity: row.product.initialStock,
              costUnitPrice: row.product.costPrice,
              notes: 'Stock inicial cargado desde plantilla Excel.',
            },
          });
        }

        count += 1;
      }
      return count;
    });

    this.logger.log(
      `Importación de inventario en el centro ${tenantId}: ${imported} producto(s), ` +
        `${parsed.duplicateCount} SKU(s) duplicado(s), ${parsed.errors.length} error(es).`,
    );

    return { ...parsed, imported, dryRun: false };
  }

  // -------------------------------------------------------------------------
  // Lotes
  // -------------------------------------------------------------------------

  /** GET /inventory/batches. */
  async listBatches(tenantId: string, query: QueryBatchesDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;

    const where: Prisma.InventoryBatchWhereInput = {
      tenantId,
      isActive: true,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.expiringWithinDays !== undefined
        ? { expirationDate: { lte: addDays(new Date(), query.expiringWithinDays) } }
        : {}),
    };

    const [batches, total] = await Promise.all([
      this.prisma.inventoryBatch.findMany({
        where,
        include: { product: { select: PRODUCT_REF_SELECT } },
        orderBy: { expirationDate: 'asc' },
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.inventoryBatch.count({ where }),
    ]);

    return {
      data: batches.map(serializeBatch),
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  /** POST /inventory/batches — ingreso de compra: crea el lote y su fila de
   *  Kardex PURCHASE_INPUT en una sola transacción. */
  async createBatch(tenantId: string, dto: CreateBatchDto) {
    const product = await this.assertProductBelongsToTenant(tenantId, dto.productId);

    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.create({
        data: {
          tenantId,
          productId: dto.productId,
          lotNumber: dto.lotNumber,
          expirationDate: new Date(dto.expirationDate),
          initialQuantity: dto.quantity,
          currentQuantity: dto.quantity,
        },
        include: { product: { select: PRODUCT_REF_SELECT } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          batchId: batch.id,
          type: 'PURCHASE_INPUT',
          quantity: dto.quantity,
          // Snapshot del costo de ESTA compra — si se omite, toma el costo
          // vigente del producto en este momento (no se recalcula después si
          // Product.costPrice cambia, mismo criterio que Appointment.bufferMinutes).
          costUnitPrice: dto.costUnitPrice ?? product.costPrice,
          notes: dto.notes ?? null,
        },
        include: MOVEMENT_INCLUDE,
      });

      return { batch, movement };
    });

    this.logger.log(`Lote ${result.batch.id} ingresado para el producto ${dto.productId}.`);
    return { batch: serializeBatch(result.batch), movement: serializeMovement(result.movement) };
  }

  // -------------------------------------------------------------------------
  // Kardex
  // -------------------------------------------------------------------------

  /** GET /inventory/kardex. */
  async listKardex(tenantId: string, query: QueryKardexDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data: movements.map(serializeMovement),
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  // -------------------------------------------------------------------------
  // Movimientos manuales (Ajuste, Merma, Baja por Vencimiento)
  // -------------------------------------------------------------------------

  /**
   * POST /inventory/movements. También es el método que llamará el consumo
   * clínico automático (Fase 3, Task 3.3) con `type: 'CLINICAL_CONSUMPTION'` —
   * ese `type` no pasa la validación de CreateMovementDto (solo acepta los 3
   * tipos manuales), así que solo puede llegar desde código, nunca desde un
   * body de usuario.
   */
  async createMovement(tenantId: string, performedById: string, dto: CreateMovementDto) {
    await this.assertProductBelongsToTenant(tenantId, dto.productId);
    const quantity = new Prisma.Decimal(dto.quantity);

    const movement = await this.prisma.$transaction(async (tx) => {
      const batch =
        dto.type === 'ADJUSTMENT_ADD'
          ? await this.resolveAdditionBatch(tx, tenantId, dto.productId, dto.batchId)
          : await this.resolveConsumptionBatch(tx, tenantId, dto.productId, dto.batchId, quantity);

      const isAddition = dto.type === 'ADJUSTMENT_ADD';
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: isAddition
          ? { currentQuantity: batch.currentQuantity.plus(quantity), isActive: true }
          : {
              currentQuantity: batch.currentQuantity.minus(quantity),
              ...(batch.currentQuantity.minus(quantity).lte(0) ? { isActive: false } : {}),
            },
      });

      return tx.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          batchId: updatedBatch.id,
          type: dto.type,
          quantity: dto.quantity,
          notes: dto.notes,
          performedById,
        },
        include: MOVEMENT_INCLUDE,
      });
    });

    this.logger.log(`Movimiento ${dto.type} registrado para el producto ${dto.productId} en el centro ${tenantId}.`);
    return serializeMovement(movement);
  }

  /** ADJUSTMENT_ADD exige indicar a qué lote se le suma stock — no existe un
   *  "lote FEFO" para una entrada, hay que elegirlo explícitamente. */
  private async resolveAdditionBatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    batchId: string | undefined,
  ) {
    if (!batchId) {
      throw new BadRequestException('Selecciona el lote al que se le suma stock.');
    }
    const batch = await tx.inventoryBatch.findFirst({ where: { id: batchId, tenantId, productId } });
    if (!batch) {
      throw new NotFoundException('El lote no existe o no pertenece a este producto.');
    }
    return batch;
  }

  /**
   * ADJUSTMENT_SUB/EXPIRED_DISCARD/CLINICAL_CONSUMPTION: si se indica un
   * lote, se descuenta de ahí; si se omite, aplica FEFO (spec §3.1) — el lote
   * activo más próximo a vencer. Limitación de este MVP: la salida debe caber
   * en UN solo lote, no reparte la cantidad entre varios cuando el más
   * próximo a vencer no alcanza — spec.md no describe ese reparto, y hacerlo
   * bien (varias filas de Kardex por un solo movimiento pedido) es una fase
   * futura.
   */
  private async resolveConsumptionBatch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    batchId: string | undefined,
    quantity: Prisma.Decimal,
  ) {
    if (batchId) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: batchId, tenantId, productId, isActive: true },
      });
      if (!batch) {
        throw new NotFoundException('El lote no existe, no está activo o no pertenece a este producto.');
      }
      if (batch.currentQuantity.lt(quantity)) {
        throw new BadRequestException('El lote no tiene stock suficiente para esta cantidad.');
      }
      return batch;
    }

    const candidate = await tx.inventoryBatch.findFirst({
      where: { tenantId, productId, isActive: true, currentQuantity: { gte: quantity } },
      orderBy: { expirationDate: 'asc' },
    });
    if (!candidate) {
      throw new BadRequestException(
        'No hay un lote activo con stock suficiente para esta cantidad (sugerencia FEFO no encontró candidato).',
      );
    }
    return candidate;
  }

  // -------------------------------------------------------------------------
  // Consumo/venta cruzados con otros módulos (Fase 3 Task 3.3; Módulo 08)
  // -------------------------------------------------------------------------

  /**
   * Descuenta stock de un lote y crea su fila de Kardex — a diferencia de
   * createMovement, NO abre su propia transacción: recibe el `tx` del
   * llamador (ClinicalRecordsService al registrar una atención, SalesService
   * al cobrar una venta) y corre dentro de ESA misma transacción, para que un
   * fallo al descontar stock revierta también el documento que lo originó, y
   * viceversa — nunca queda una atención o una venta registrada sin su
   * consumo, ni un consumo sin el documento que lo originó.
   */
  private async deductStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: 'CLINICAL_CONSUMPTION' | 'RETAIL_SALE',
    params: {
      productId: string;
      batchId?: string;
      quantity: number;
      /** id del ClinicalProcedureRecord o Invoice que originó el movimiento. */
      referenceId: string;
      performedById?: string;
    },
  ) {
    const product = await tx.product.findFirst({ where: { id: params.productId, tenantId } });
    if (!product) {
      throw new NotFoundException('El producto no existe o no pertenece a tu centro estético.');
    }

    const quantity = new Prisma.Decimal(params.quantity);
    const batch = await this.resolveConsumptionBatch(tx, tenantId, params.productId, params.batchId, quantity);

    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: {
        currentQuantity: batch.currentQuantity.minus(quantity),
        ...(batch.currentQuantity.minus(quantity).lte(0) ? { isActive: false } : {}),
      },
    });

    return tx.stockMovement.create({
      data: {
        tenantId,
        productId: params.productId,
        batchId: updatedBatch.id,
        type,
        quantity: params.quantity,
        referenceId: params.referenceId,
        performedById: params.performedById ?? null,
      },
      include: MOVEMENT_INCLUDE,
    });
  }

  async registerClinicalConsumption(
    tx: Prisma.TransactionClient,
    tenantId: string,
    params: { productId: string; batchId?: string; quantity: number; referenceId: string; performedById?: string },
  ) {
    return this.deductStock(tx, tenantId, 'CLINICAL_CONSUMPTION', params);
  }

  /** Descuento de stock por venta directa de un producto (Módulo 08,
   *  InvoiceItem con productId) — llamado por SalesService.createInvoice
   *  dentro de su propia transacción, mismo criterio que el consumo clínico. */
  async registerRetailSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    params: { productId: string; batchId?: string; quantity: number; referenceId: string; performedById?: string },
  ) {
    return this.deductStock(tx, tenantId, 'RETAIL_SALE', params);
  }

  /**
   * Devuelve stock a un lote específico (Módulo 08: anular un comprobante que
   * incluía productos, spec §4 "con devolución de stock si incluía
   * productos"). No hay un StockMovementType dedicado a "devolución" — se usa
   * ADJUSTMENT_ADD con `referenceId` apuntando al Invoice anulado, dejando el
   * porqué en el Kardex igual que cualquier otro ajuste positivo.
   */
  async reverseSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    params: { batchId: string; quantity: number; referenceId: string; performedById?: string },
  ) {
    const batch = await tx.inventoryBatch.findFirst({ where: { id: params.batchId, tenantId } });
    if (!batch) {
      throw new NotFoundException('El lote no existe o no pertenece a tu centro estético.');
    }

    const quantity = new Prisma.Decimal(params.quantity);
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: { currentQuantity: batch.currentQuantity.plus(quantity), isActive: true },
    });

    return tx.stockMovement.create({
      data: {
        tenantId,
        productId: batch.productId,
        batchId: updatedBatch.id,
        type: 'ADJUSTMENT_ADD',
        quantity: params.quantity,
        referenceId: params.referenceId,
        notes: 'Devolución de stock por anulación de comprobante.',
        performedById: params.performedById ?? null,
      },
      include: MOVEMENT_INCLUDE,
    });
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertProductBelongsToTenant(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new NotFoundException('El producto no existe o no pertenece a tu centro estético.');
    }
    return product;
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Accent/case-insensitive category name key — same normalisation as
 *  InventoryExcelImportService's normalizeHeader, kept local here since this
 *  is matching PrismaClient rows, not spreadsheet headers. */
function normalizeCategoryKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}
