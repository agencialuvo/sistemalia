import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialtiesService } from './specialties.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { StaffScheduleInputDto } from './dto/staff-schedule-input.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { serializeStaffMember, serializeStaffMembers } from './serializers/staff.serializer';
import { StaffExcelImportService, StaffParseResult } from './staff-excel-import.service';

/** POST /staff/import[-preview] response shape — mirrors Módulo 03's
 *  ImportResult (services.service.ts). */
export interface StaffImportResult extends StaffParseResult {
  /** Rows actually written. 0 on a preview, even when every row is valid. */
  imported: number;
  createdSpecialties: string[];
  dryRun: boolean;
}

const RECORD_NOT_FOUND = 'P2025';
const UNIQUE_VIOLATION = 'P2002';

/** Matches the default the frontend's page-size selector starts on (same
 *  value as ServicesService.DEFAULT_SERVICE_PAGE_SIZE). */
const DEFAULT_STAFF_PAGE_SIZE = 12;

/** Shared `include` for GET /staff/:id (spec §3: "detalle completo… incluyendo
 *  servicios asignados y horarios") — kept in one place so list and detail
 *  views can't quietly drift apart. */
const DETAIL_INCLUDE = {
  specialty: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, fullName: true } },
  services: {
    include: { service: { select: { id: true, name: true, durationMinutes: true } } },
  },
  schedules: { orderBy: { dayOfWeek: Prisma.SortOrder.asc } },
  absences: { orderBy: { startDate: Prisma.SortOrder.desc } },
} satisfies Prisma.StaffMemberInclude;

const LIST_INCLUDE = {
  specialty: { select: { id: true, name: true } },
  _count: { select: { services: true, absences: true } },
  schedules: { orderBy: { dayOfWeek: Prisma.SortOrder.asc } },
} satisfies Prisma.StaffMemberInclude;

@Injectable()
export class StaffMembersService {
  private readonly logger = new Logger(StaffMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly specialties: SpecialtiesService,
    private readonly excel: StaffExcelImportService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  async findAll(tenantId: string, query: QueryStaffDto) {
    // Pagination only kicks in when the caller asks for it — same rule as
    // ServicesService.findAll — so the /personal form's "servicio asignado"
    // filter and the évaluation-style pickers that want the whole directory
    // in one shot keep working unchanged.
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_STAFF_PAGE_SIZE;
    const where: Prisma.StaffMemberWhereInput = {
      tenantId,
      ...(query.specialtyId ? { specialtyId: query.specialtyId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.serviceId ? { services: { some: { serviceId: query.serviceId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { lastName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              {
                medicalLicense: { contains: query.search, mode: Prisma.QueryMode.insensitive },
              },
            ],
          }
        : {}),
    };

    const [staff, total] = await Promise.all([
      this.prisma.staffMember.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.staffMember.count({ where }),
    ]);

    return {
      data: serializeStaffMembers(staff),
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  async findOne(tenantId: string, id: string) {
    const staff = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
      include: DETAIL_INCLUDE,
    });

    if (!staff) {
      throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
    }
    return serializeStaffMember(staff);
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  async create(tenantId: string, dto: CreateStaffDto) {
    if (dto.specialtyId) {
      await this.specialties.assertBelongsToTenant(tenantId, dto.specialtyId);
    }
    if (dto.userId) {
      await this.assertUserBelongsToTenant(tenantId, dto.userId);
    }
    if (dto.serviceIds) {
      await this.assertServicesBelongToTenant(tenantId, dto.serviceIds.map((s) => s.serviceId));
    }
    const schedules = this.validateSchedules(dto.schedules);

    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        const created = await tx.staffMember.create({
          data: {
            tenantId,
            ...this.buildWritableData(dto),
          },
        });

        if (dto.serviceIds) {
          await tx.staffService.createMany({
            data: dto.serviceIds.map((entry) => ({
              staffMemberId: created.id,
              serviceId: entry.serviceId,
              customDurationMinutes: entry.customDurationMinutes ?? null,
            })),
          });
        }
        if (schedules) {
          await tx.staffSchedule.createMany({
            data: schedules.map((entry) => ({ staffMemberId: created.id, ...entry })),
          });
        }

        return tx.staffMember.findFirstOrThrow({ where: { id: created.id }, include: DETAIL_INCLUDE });
      });

      this.logger.log(`Profesional ${staff.id} creado en el centro ${tenantId}.`);
      return serializeStaffMember(staff);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  /**
   * PATCH /staff/:id.
   *
   * `serviceIds`/`schedules` replace their whole sub-resource when sent
   * (see CreateStaffDto's doc comment) — delete-then-recreate inside the same
   * transaction as the profile update, so a failure halfway through never
   * leaves the matrix half-written.
   */
  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    const current = await this.prisma.staffMember.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
    }

    if (dto.specialtyId) {
      await this.specialties.assertBelongsToTenant(tenantId, dto.specialtyId);
    }
    if (dto.userId) {
      await this.assertUserBelongsToTenant(tenantId, dto.userId);
    }
    if (dto.serviceIds) {
      await this.assertServicesBelongToTenant(tenantId, dto.serviceIds.map((s) => s.serviceId));
    }
    const schedules = this.validateSchedules(dto.schedules);

    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        await tx.staffMember.update({
          where: { id, tenantId },
          data: this.buildWritableData(dto, current),
        });

        if (dto.serviceIds) {
          await tx.staffService.deleteMany({ where: { staffMemberId: id } });
          await tx.staffService.createMany({
            data: dto.serviceIds.map((entry) => ({
              staffMemberId: id,
              serviceId: entry.serviceId,
              customDurationMinutes: entry.customDurationMinutes ?? null,
            })),
          });
        }
        if (schedules) {
          await tx.staffSchedule.deleteMany({ where: { staffMemberId: id } });
          await tx.staffSchedule.createMany({
            data: schedules.map((entry) => ({ staffMemberId: id, ...entry })),
          });
        }

        return tx.staffMember.findFirstOrThrow({ where: { id }, include: DETAIL_INCLUDE });
      });

      return serializeStaffMember(staff);
    } catch (error) {
      throw this.translateWriteError(error, id);
    }
  }

  /** DELETE /staff/:id — baja lógica (spec §3), nunca borrado físico: el
   *  historial de citas y comisiones sigue apuntando a este profesional. */
  async deactivate(tenantId: string, id: string) {
    try {
      const staff = await this.prisma.staffMember.update({
        where: { id, tenantId },
        data: { isActive: false },
        include: DETAIL_INCLUDE,
      });
      this.logger.log(`Profesional ${id} desactivado en el centro ${tenantId}.`);
      return serializeStaffMember(staff);
    } catch (error) {
      throw this.translateWriteError(error, id);
    }
  }

  /**
   * DELETE /staff/:id/permanent — genuine hard delete, distinct from
   * `deactivate`. StaffService/StaffSchedule/StaffAbsence all cascade
   * (schema.prisma), so this also clears the professional's assignments,
   * horario, and ausencias; nothing else references StaffMember yet.
   */
  async removePermanently(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
    try {
      await this.prisma.staffMember.delete({ where: { id, tenantId } });
      this.logger.log(`Profesional ${id} eliminado permanentemente del centro ${tenantId}.`);
      return { id, deleted: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
        throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Carga masiva
  // -------------------------------------------------------------------------

  /** The .xlsx behind GET /staff/export-template, seeded with this tenant's
   *  especialidades and servicios (mirrors ServicesService.generateTemplate). */
  async generateTemplate(tenantId: string): Promise<Buffer> {
    const [specialties, services] = await Promise.all([
      this.prisma.specialty.findMany({
        where: { tenantId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return this.excel.generateTemplate(
      specialties.map((s) => s.name),
      services.map((s) => s.name),
    );
  }

  /**
   * POST /staff/import-preview (dryRun) and POST /staff/import.
   *
   * Valid rows are imported and invalid ones are reported; a single bad cell
   * does not sink a 300-row file — same contract as
   * ServicesService.importFromExcel. `dryRun` runs the exact same analysis
   * without writing anything; especialidad auto-creation happens here rather
   * than in the parser so a preview never creates an especialidad the user
   * has not confirmed yet.
   */
  async importFromExcel(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<StaffImportResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta un archivo .xlsx o .csv en el campo "file".');
    }

    const [existingSpecialties, existingServices] = await Promise.all([
      this.prisma.specialty.findMany({ where: { tenantId }, select: { name: true } }),
      this.prisma.service.findMany({ where: { tenantId }, select: { name: true } }),
    ]);

    const parsed = await this.excel.parseAndValidateExcel(file.buffer, {
      existingSpecialties: existingSpecialties.map((s) => s.name),
      existingServiceNames: existingServices.map((s) => s.name),
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, createdSpecialties: [], dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      // Especialidades first: every row needs a specialtyId before it can be
      // created (or none at all), and creating them inside the same
      // transaction means a failure halfway through leaves neither orphan
      // especialidades nor half the batch written.
      const specialtyIds = await this.specialties.resolveByName(
        tenantId,
        parsed.data.map((row) => row.specialtyName).filter(Boolean),
        tx,
      );

      // Servicios habilitados were checked against a snapshot taken before
      // this transaction opened — re-resolved here, inside it, so a service
      // deleted in the gap between preview and confirm is caught instead of
      // silently creating a StaffService that points at nothing.
      const allServiceNames = [...new Set(parsed.data.flatMap((row) => row.serviceNames))];
      const services = allServiceNames.length
        ? await tx.service.findMany({
            where: { tenantId, name: { in: allServiceNames } },
            select: { id: true, name: true },
          })
        : [];
      const serviceIdByLowerName = new Map(services.map((s) => [s.name.toLowerCase(), s.id]));

      let count = 0;
      for (const row of parsed.data) {
        const specialtyId = row.specialtyName
          ? specialtyIds.get(row.specialtyName.toLowerCase())
          : undefined;
        if (row.specialtyName && !specialtyId) {
          // Unreachable unless resolveByName changes behaviour; loud rather
          // than creating a professional with the wrong especialidad.
          throw new UnprocessableEntityException(
            `No se pudo resolver la especialidad "${row.specialtyName}".`,
          );
        }

        const serviceIds = row.serviceNames.map((name) => {
          const id = serviceIdByLowerName.get(name.toLowerCase());
          if (!id) {
            throw new UnprocessableEntityException(
              `El servicio "${name}" ya no existe en tu catálogo. Vuelve a analizar el archivo.`,
            );
          }
          return id;
        });

        const effective = { ...row.staff, specialtyId } as CreateStaffDto;
        const created = await tx.staffMember.create({
          data: {
            tenantId,
            ...this.buildWritableData(effective),
          },
        });

        if (serviceIds.length > 0) {
          await tx.staffService.createMany({
            data: serviceIds.map((serviceId) => ({ staffMemberId: created.id, serviceId })),
          });
        }
        count += 1;
      }
      return count;
    });

    this.logger.log(
      `Importación de personal en el centro ${tenantId}: ${imported} profesional(es), ` +
        `${parsed.newSpecialtyNames.length} especialidad(es) nueva(s), ${parsed.errors.length} error(es).`,
    );

    return { ...parsed, imported, createdSpecialties: parsed.newSpecialtyNames, dryRun: false };
  }

  // -------------------------------------------------------------------------
  // Ausencias
  // -------------------------------------------------------------------------

  async findAbsences(tenantId: string, staffMemberId: string) {
    await this.assertStaffBelongsToTenant(tenantId, staffMemberId);
    return this.prisma.staffAbsence.findMany({
      where: { staffMemberId },
      orderBy: { startDate: 'desc' },
    });
  }

  async createAbsence(tenantId: string, staffMemberId: string, dto: CreateAbsenceDto) {
    await this.assertStaffBelongsToTenant(tenantId, staffMemberId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('La fecha de fin debe ser posterior a la fecha de inicio.');
    }

    const absence = await this.prisma.staffAbsence.create({
      data: { staffMemberId, reason: dto.reason, startDate, endDate },
    });
    this.logger.log(`Ausencia ${absence.id} registrada para el profesional ${staffMemberId}.`);
    return absence;
  }

  /** DELETE /staff/absences/:absenceId — borrado físico: una ausencia
   *  cancelada no deja rastro útil, a diferencia del propio StaffMember. */
  async removeAbsence(tenantId: string, absenceId: string) {
    const absence = await this.prisma.staffAbsence.findFirst({
      where: { id: absenceId, staffMember: { tenantId } },
    });
    if (!absence) {
      throw new NotFoundException('La ausencia no existe o no pertenece a tu centro estético.');
    }
    await this.prisma.staffAbsence.delete({ where: { id: absenceId } });
    return { id: absenceId, deleted: true };
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  /** Columns written on both create and PATCH's merge — everything except the
   *  serviceIds/schedules sub-resources, which the caller handles separately. */
  private buildWritableData(
    dto: CreateStaffDto | UpdateStaffDto,
    current?: { firstName: string; lastName: string },
  ) {
    const pick = <K extends keyof CreateStaffDto>(key: K, fallback: unknown) =>
      dto[key] === undefined ? fallback : dto[key];

    return {
      userId: dto.userId === undefined ? undefined : (dto.userId ?? null),
      specialtyId: dto.specialtyId === undefined ? undefined : (dto.specialtyId ?? null),
      firstName: pick('firstName', current?.firstName) as string,
      lastName: pick('lastName', current?.lastName) as string,
      medicalLicense: dto.medicalLicense === undefined ? undefined : (dto.medicalLicense ?? null),
      email: dto.email === undefined ? undefined : (dto.email ?? null),
      phone: dto.phone === undefined ? undefined : (dto.phone ?? null),
      avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl ?? null),
      biography: dto.biography === undefined ? undefined : (dto.biography ?? null),
      color: dto.color === undefined ? undefined : (dto.color ?? null),
      commissionPercentage:
        dto.commissionPercentage === undefined ? undefined : (dto.commissionPercentage ?? null),
      isActive: dto.isActive,
    };
  }

  /**
   * Normalises `schedules` and enforces the invariants a per-field
   * `@ValidateIf` cannot express across the whole array: no two entries for
   * the same día, start < end, and a lunch window (if any) inside [start, end].
   *
   * Returns `undefined` when the field was not sent (PATCH: "no tocar el
   * horario"), so the caller can tell that apart from an explicit `[]`.
   */
  private validateSchedules(schedules: StaffScheduleInputDto[] | undefined) {
    if (schedules === undefined) return undefined;

    const seenDays = new Set<number>();
    for (const entry of schedules) {
      if (seenDays.has(entry.dayOfWeek)) {
        throw new BadRequestException(
          `El horario tiene más de un turno para el día ${entry.dayOfWeek}.`,
        );
      }
      seenDays.add(entry.dayOfWeek);

      if (entry.startTime >= entry.endTime) {
        throw new BadRequestException('La hora de inicio debe ser anterior a la hora de fin.');
      }
      const hasLunchStart = entry.lunchStartTime !== undefined;
      const hasLunchEnd = entry.lunchEndTime !== undefined;
      if (hasLunchStart !== hasLunchEnd) {
        throw new BadRequestException(
          'El receso de almuerzo requiere hora de inicio y de fin.',
        );
      }
      if (hasLunchStart && hasLunchEnd) {
        if (entry.lunchStartTime! >= entry.lunchEndTime!) {
          throw new BadRequestException(
            'La hora de inicio del almuerzo debe ser anterior a la de fin.',
          );
        }
        if (entry.lunchStartTime! < entry.startTime || entry.lunchEndTime! > entry.endTime) {
          throw new BadRequestException('El receso de almuerzo debe estar dentro del turno.');
        }
      }
    }

    return schedules.map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      lunchStartTime: entry.lunchStartTime ?? null,
      lunchEndTime: entry.lunchEndTime ?? null,
      isActive: entry.isActive ?? true,
    }));
  }

  /** A serviceId is just a UUID until it is proven to belong to this tenant —
   *  same reasoning as ServicesService.assertCategoryBelongsToTenant. */
  private async assertServicesBelongToTenant(tenantId: string, serviceIds: string[]): Promise<void> {
    if (serviceIds.length === 0) return;
    const unique = [...new Set(serviceIds)];
    const found = await this.prisma.service.count({ where: { id: { in: unique }, tenantId } });
    if (found !== unique.length) {
      throw new UnprocessableEntityException(
        'Uno o más servicios seleccionados no existen en tu centro estético.',
      );
    }
  }

  /** A userId is only usable to link a StaffMember if it belongs to this
   *  tenant — otherwise a caller could point a profile at a stranger's
   *  account. Checked against TenantUser, the actual membership table. */
  private async assertUserBelongsToTenant(tenantId: string, userId: string): Promise<void> {
    const membership = await this.prisma.tenantUser.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (!membership) {
      throw new UnprocessableEntityException(
        'El usuario seleccionado no pertenece a tu centro estético.',
      );
    }
  }

  private async assertStaffBelongsToTenant(tenantId: string, staffMemberId: string): Promise<void> {
    const staff = await this.prisma.staffMember.findFirst({
      where: { id: staffMemberId, tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
    }
  }

  private translateWriteError(error: unknown, id?: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === RECORD_NOT_FOUND) {
        return new NotFoundException(
          'El profesional no existe o no pertenece a tu centro estético.',
        );
      }
      if (error.code === UNIQUE_VIOLATION) {
        return new UnprocessableEntityException(
          'Ese usuario ya está vinculado a otro perfil de profesional.',
        );
      }
    }
    if (id) this.logger.error(`Error al escribir el profesional ${id}`, error as Error);
    return error;
  }
}
