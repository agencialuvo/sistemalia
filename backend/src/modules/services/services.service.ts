import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  Service,
  ServiceAvailabilityType,
  ServicePaymentMethod,
  ServiceStructureType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { QueryServicesDto } from './dto/query-services.dto';
import { ServicePackageDto } from './dto/service-package.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ExcelImportService, ImportError, ParseResult } from './excel-import.service';
import {
  SerializedService,
  serializeService,
  serializeServices,
} from './serializers/service.serializer';

const RECORD_NOT_FOUND = 'P2025';

/** Matches the default the frontend's page-size selector starts on. */
const DEFAULT_SERVICE_PAGE_SIZE = 12;

/** Shape the write helpers work on: the stored row merged with the incoming
 *  patch, i.e. what the service WILL look like once saved. */
type EffectiveService = Omit<CreateServiceDto, 'customSchedule'> & {
  customSchedule?: Record<string, unknown> | Prisma.JsonValue | null;
};

/** Shared `include` for every read (and every write's response) — kept in
 *  one place so a card and a detail view can't quietly drift apart on which
 *  relations they see. */
const SERVICE_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  packages: { orderBy: { sessionCount: Prisma.SortOrder.asc } },
} satisfies Prisma.ServiceInclude;

export interface ImportResult extends ParseResult {
  /** Rows actually written. 0 on a dry run, even when every row is valid. */
  imported: number;
  createdCategories: string[];
  dryRun: boolean;
}

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly excel: ExcelImportService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  async findAll(tenantId: string, query: QueryServicesDto) {
    // Pagination only kicks in when the caller asks for it. Internal callers
    // (e.g. the staff module's "which services can this person perform"
    // picker) want the whole catalogue in one shot, same as before this DTO
    // grew page/pageSize.
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_SERVICE_PAGE_SIZE;
    const where: Prisma.ServiceWhereInput = {
      tenantId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              {
                commercialDescription: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        include: SERVICE_INCLUDE,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data: serializeServices(services),
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  async findOne(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
      include: {
        ...SERVICE_INCLUDE,
        evaluationService: { select: { id: true, name: true } },
      },
    });

    if (!service) {
      throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
    }
    return serializeService(service);
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  async create(tenantId: string, dto: CreateServiceDto): Promise<SerializedService> {
    await this.assertCategoryBelongsToTenant(tenantId, dto.categoryId);
    await this.assertEvaluationServiceIsUsable(tenantId, dto.evaluationServiceId);

    const isPackage = dto.structureType === ServiceStructureType.SESSIONS;
    if (isPackage && (!dto.packages || dto.packages.length === 0)) {
      throw new BadRequestException('Un paquete debe indicar al menos un paquete de sesiones.');
    }

    const service = await this.prisma.service.create({
      data: {
        tenantId,
        ...this.buildWritableData(dto),
        ...(isPackage && dto.packages
          ? { packages: { create: this.packagesWriteInput(dto.packages) } }
          : {}),
      },
      include: SERVICE_INCLUDE,
    });

    this.logger.log(`Servicio ${service.id} creado en el centro ${tenantId}.`);
    return serializeService(service);
  }

  /**
   * PATCH /services/:id.
   *
   * The stored row is loaded and merged with the patch before anything is
   * written, because the conditional rules only make sense on the complete
   * picture: `PATCH { structureType: "SESSIONS" }` on a service that has no
   * paquetes has to fail, and the DTO alone cannot see that — it only knows
   * about the one field it was sent.
   *
   * `packages`, when sent, REPLACES the whole set (delete-then-create) rather
   * than diffing — same whole-resource convention StaffMembersService uses
   * for schedules/serviceIds. Omitting it on a PATCH leaves the existing
   * packages untouched.
   */
  async update(tenantId: string, id: string, dto: UpdateServiceDto): Promise<SerializedService> {
    const current = await this.prisma.service.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
    }

    const effective = this.merge(current, dto);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryBelongsToTenant(tenantId, effective.categoryId);
    }
    if (dto.evaluationServiceId !== undefined || dto.requiresEvaluation !== undefined) {
      await this.assertEvaluationServiceIsUsable(tenantId, effective.evaluationServiceId, id);
    }

    const isPackage = effective.structureType === ServiceStructureType.SESSIONS;
    const packagesSent = dto.packages !== undefined;
    if (isPackage) {
      if (packagesSent && dto.packages!.length === 0) {
        throw new BadRequestException('Un paquete debe indicar al menos un paquete de sesiones.');
      }
      // Switching SINGLE -> SESSIONS without sending any package leaves
      // nothing to fall back on — there was no prior package to keep.
      const hadNoPriorPackages = current.structureType !== ServiceStructureType.SESSIONS;
      if (!packagesSent && hadNoPriorPackages) {
        throw new BadRequestException('Un paquete debe indicar al menos un paquete de sesiones.');
      }
    }

    try {
      const service = await this.prisma.service.update({
        where: { id, tenantId },
        data: {
          ...this.buildWritableData(effective),
          ...(!isPackage
            ? { packages: { deleteMany: {} } }
            : packagesSent
              ? { packages: { deleteMany: {}, create: this.packagesWriteInput(dto.packages!) } }
              : {}),
        },
        include: SERVICE_INCLUDE,
      });
      return serializeService(service);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  /**
   * DELETE /services/:id — logical deactivation only (spec §3).
   *
   * A hard delete is never offered: appointments, quotes and the AI's answers
   * all reference the service, and removing the row would leave that history
   * pointing at nothing. Deactivating takes it out of the catalogue while
   * everything already booked keeps resolving.
   */
  async deactivate(tenantId: string, id: string): Promise<SerializedService> {
    try {
      const service = await this.prisma.service.update({
        where: { id, tenantId },
        data: { isActive: false },
        include: SERVICE_INCLUDE,
      });
      this.logger.log(`Servicio ${id} desactivado en el centro ${tenantId}.`);
      return serializeService(service);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  /**
   * DELETE /services/:id/permanent — genuine hard delete, distinct from
   * deactivate() above.
   *
   * Offered as its own route rather than repurposing DELETE /services/:id,
   * because the frontend's "Desactivar" action already depends on that route
   * meaning "soft, reversible". This one is neither: `evaluationServiceId`
   * (self-relation, onDelete: SetNull) and `StaffService.serviceId`
   * (onDelete: Cascade) are enforced by Postgres, so a service that other
   * services point at as their valoración loses that link instead of
   * blocking the delete, and a professional's competency row for this
   * service disappears along with it. The frontend is expected to warn
   * before calling this — there is no undo once it returns.
   */
  async removePermanently(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
    try {
      await this.prisma.service.delete({ where: { id, tenantId } });
      this.logger.log(`Servicio ${id} eliminado permanentemente del centro ${tenantId}.`);
      return { id, deleted: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Carga masiva
  // -------------------------------------------------------------------------

  /** The .xlsx behind GET /services/template, seeded with this tenant's categories. */
  async generateTemplate(tenantId: string): Promise<Buffer> {
    const categories = await this.prisma.serviceCategory.findMany({
      where: { tenantId, isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return this.excel.generateTemplate(categories.map((category) => category.name));
  }

  /**
   * POST /services/import.
   *
   * Valid rows are imported and invalid ones are reported; a single bad cell
   * does not sink a 300-row file. `dryRun` runs the exact same analysis without
   * writing anything, which is what the preview modal (spec §4.4) calls before
   * the user confirms — and the reason category auto-creation lives here rather
   * than in the parser, where a preview would have had the side effect of
   * creating categories the user never confirmed.
   */
  async importFromExcel(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<ImportResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta un archivo .xlsx o .csv en el campo "file".');
    }

    const existing = await this.prisma.serviceCategory.findMany({
      where: { tenantId },
      select: { name: true },
    });

    const parsed = await this.excel.parseAndValidateExcel(file.buffer, {
      existingCategories: existing.map((category) => category.name),
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, createdCategories: [], dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      // Categories first: every service needs a categoryId, and creating them
      // inside the same transaction means a failure halfway through leaves
      // neither orphan categories nor half the catalogue.
      const categoryIds = await this.categories.resolveByName(
        tenantId,
        parsed.data.map((row) => row.categoryName),
        tx,
      );

      // One create() per row rather than createMany(): createMany cannot
      // attach a nested relation (packages) in the same call, and each
      // imported SESSIONS row carries exactly one (excel-import.service.ts's
      // applyPackageShape). MAX_IMPORT_ROWS (500) keeps this bounded.
      let count = 0;
      for (const row of parsed.data) {
        const categoryId = categoryIds.get(row.categoryName.toLowerCase());
        if (!categoryId) {
          // Unreachable unless resolveByName changes behaviour; loud rather
          // than writing a service into the wrong category.
          throw new UnprocessableEntityException(
            `No se pudo resolver la categoría "${row.categoryName}".`,
          );
        }
        const effective = { ...row.service, categoryId } as CreateServiceDto;
        const isPackage = effective.structureType === ServiceStructureType.SESSIONS;
        await tx.service.create({
          data: {
            tenantId,
            ...this.buildWritableData(effective),
            ...(isPackage && effective.packages
              ? { packages: { create: this.packagesWriteInput(effective.packages) } }
              : {}),
          },
        });
        count += 1;
      }
      return count;
    });

    this.logger.log(
      `Importación en el centro ${tenantId}: ${imported} servicio(s), ` +
        `${parsed.newCategoryNames.length} categoría(s) nueva(s), ${parsed.errors.length} error(es).`,
    );

    return { ...parsed, imported, createdCategories: parsed.newCategoryNames, dryRun: false };
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  /**
   * Applies the conditional rules of spec §2.2 and returns the columns to write.
   *
   * Fields that the chosen mode does not apply to are nulled out rather than
   * rejected. A form whose inputs were filled in and then switched from
   * SESSIONS to SINGLE still submits the old sessionCount; storing it would
   * leave a "single" service quietly carrying package data that the agenda and
   * the AI would later read as real.
   */
  private buildWritableData(input: EffectiveService) {
    const isCustomSchedule = input.availabilityType === ServiceAvailabilityType.CUSTOM;
    const requiresEvaluation = input.requiresEvaluation === true;
    const isDeductible = requiresEvaluation && input.isEvaluationDeductible === true;
    const paymentMethods =
      input.paymentMethods && input.paymentMethods.length > 0
        ? input.paymentMethods
        : [ServicePaymentMethod.IN_PERSON];
    const isDeposit = paymentMethods.includes(ServicePaymentMethod.DEPOSIT);

    if (isCustomSchedule && !input.customSchedule) {
      throw new BadRequestException('Define el horario propio del servicio o usa el de la sede.');
    }
    if (isDeposit && (input.depositAmount === undefined || input.depositAmount === null)) {
      throw new BadRequestException('Un servicio con anticipo debe indicar el monto a cobrar.');
    }

    return {
      categoryId: input.categoryId,
      name: input.name,
      commercialDescription: input.commercialDescription ?? '',
      mainImageUrl: input.mainImageUrl ?? null,
      testimonioGallery: input.testimonioGallery ?? [],

      structureType: input.structureType,
      singlePrice: input.singlePrice,

      requiresEvaluation,
      evaluationServiceId: requiresEvaluation ? (input.evaluationServiceId ?? null) : null,
      evaluationCost: requiresEvaluation ? (input.evaluationCost ?? null) : null,
      isEvaluationDeductible: isDeductible,
      deductibleExpirationDays: isDeductible ? (input.deductibleExpirationDays ?? null) : null,

      availabilityType: input.availabilityType ?? ServiceAvailabilityType.GENERAL,
      // Prisma.DbNull, not null: on a nullable Json column a plain `null` is
      // ambiguous, and Prisma reads it as the JSON value `null` rather than as
      // SQL NULL. DbNull is what actually clears the column.
      customSchedule: isCustomSchedule
        ? (input.customSchedule as Prisma.InputJsonValue)
        : Prisma.DbNull,
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes ?? 0,
      contraindications: input.contraindications ?? [],
      prePostCare: input.prePostCare ?? null,

      paymentMethods,
      depositAmount: isDeposit ? input.depositAmount : null,
      depositIsPercentage: isDeposit ? (input.depositIsPercentage ?? false) : false,

      isActive: input.isActive ?? true,
    };
  }

  /** Stored row + patch. `undefined` means "not sent"; an explicit `null`
   *  clears the field, which is how the form empties an optional value. */
  private merge(current: Service, dto: UpdateServiceDto): EffectiveService {
    const pick = <K extends keyof UpdateServiceDto, F>(key: K, fallback: F) =>
      dto[key] === undefined ? fallback : dto[key];

    return {
      categoryId: pick('categoryId', current.categoryId) as string,
      name: pick('name', current.name) as string,
      commercialDescription: pick(
        'commercialDescription',
        current.commercialDescription,
      ) as string,
      mainImageUrl: pick('mainImageUrl', current.mainImageUrl ?? undefined) as string | undefined,
      testimonioGallery: pick('testimonioGallery', current.testimonioGallery) as string[],

      structureType: pick('structureType', current.structureType) as ServiceStructureType,
      // Decimal -> number for the rule checks; Prisma converts it back on write
      // and the 2-decimal cap has already been enforced by the DTO.
      singlePrice: pick('singlePrice', current.singlePrice.toNumber()) as number,

      requiresEvaluation: pick('requiresEvaluation', current.requiresEvaluation) as boolean,
      evaluationServiceId: pick(
        'evaluationServiceId',
        current.evaluationServiceId ?? undefined,
      ) as string | undefined,
      evaluationCost: pick('evaluationCost', current.evaluationCost?.toNumber() ?? undefined) as
        | number
        | undefined,
      isEvaluationDeductible: pick(
        'isEvaluationDeductible',
        current.isEvaluationDeductible,
      ) as boolean,
      deductibleExpirationDays: pick(
        'deductibleExpirationDays',
        current.deductibleExpirationDays ?? undefined,
      ) as number | undefined,

      availabilityType: pick('availabilityType', current.availabilityType) as
        | ServiceAvailabilityType
        | undefined,
      customSchedule: pick('customSchedule', current.customSchedule),
      durationMinutes: pick('durationMinutes', current.durationMinutes) as number,
      bufferMinutes: pick('bufferMinutes', current.bufferMinutes) as number,
      contraindications: pick('contraindications', current.contraindications) as string[],
      prePostCare: pick('prePostCare', current.prePostCare ?? undefined) as string | undefined,

      paymentMethods: pick('paymentMethods', current.paymentMethods) as ServicePaymentMethod[],
      depositAmount: pick('depositAmount', current.depositAmount?.toNumber() ?? undefined) as
        | number
        | undefined,
      depositIsPercentage: pick('depositIsPercentage', current.depositIsPercentage) as boolean,

      isActive: pick('isActive', current.isActive) as boolean,
    };
  }

  /** DTO packages -> Prisma nested-create input. Kept in one place so
   *  create(), update() and importFromExcel() build the exact same shape. */
  private packagesWriteInput(packages: ServicePackageDto[]) {
    return packages.map((entry) => ({
      sessionCount: entry.sessionCount,
      frequencyDays: entry.frequencyDays ?? null,
      price: entry.price,
    }));
  }

  /**
   * A categoryId is just a UUID until it is checked: without this, a caller
   * could file their services under another centro estético's category and
   * read its name back through the include on GET /services.
   */
  private async assertCategoryBelongsToTenant(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true },
    });
    if (!category) {
      throw new UnprocessableEntityException(
        'La categoría seleccionada no existe en tu centro estético.',
      );
    }
  }

  /** Same isolation check for the self-reference, plus the one thing a foreign
   *  key cannot express: a service cannot be its own valoración. */
  private async assertEvaluationServiceIsUsable(
    tenantId: string,
    evaluationServiceId: string | null | undefined,
    selfId?: string,
  ): Promise<void> {
    if (!evaluationServiceId) return;

    if (selfId && evaluationServiceId === selfId) {
      throw new UnprocessableEntityException(
        'Un servicio no puede ser su propio servicio de valoración.',
      );
    }

    const evaluation = await this.prisma.service.findFirst({
      where: { id: evaluationServiceId, tenantId },
      select: { id: true },
    });
    if (!evaluation) {
      throw new UnprocessableEntityException(
        'El servicio de valoración seleccionado no existe en tu centro estético.',
      );
    }
  }
}

export type { ImportError };
