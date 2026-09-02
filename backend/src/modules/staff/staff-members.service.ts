import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExceptionType, Prisma } from '@prisma/client';
import { assertCommissionIsValid } from '../../common/utils/commission.util';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialtiesService } from './specialties.service';
import { BulkServiceMatrixDto } from './dto/bulk-service-matrix.dto';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { QueryStaffDto } from './dto/query-staff.dto';
import { StaffScheduleDayInputDto } from './dto/staff-schedule-input.dto';
import { StaffServiceAssignmentDto } from './dto/staff-service-assignment.dto';
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

/** Output of validateSchedules() — a day/turno/descanso tree normalised and
 *  ready for the nested `create` writeSchedules() performs; days with no
 *  turnos are already filtered out. */
interface NormalizedScheduleDay {
  dayOfWeek: number;
  isActive: boolean;
  shifts: NormalizedShift[];
}
interface NormalizedShift {
  startTime: string;
  endTime: string;
  serviceId: string | null;
  sortOrder: number;
  breaks: NormalizedBreak[];
}
interface NormalizedBreak {
  startTime: string;
  endTime: string;
  label: string | null;
}

const RECORD_NOT_FOUND = 'P2025';
const UNIQUE_VIOLATION = 'P2002';

/** Matches the default the frontend's page-size selector starts on (same
 *  value as ServicesService.DEFAULT_SERVICE_PAGE_SIZE). */
const DEFAULT_STAFF_PAGE_SIZE = 12;

/** Shared shape for the `schedules` relation — a day plus its turnos and,
 *  inside each turno, its descansos and the servicio it may be restricted to
 *  (Engine de Disponibilidad). Used by both LIST_INCLUDE and DETAIL_INCLUDE
 *  so the card's day badges and the detail/edit view can't drift apart on
 *  what a "día" contains. */
const SCHEDULE_INCLUDE = {
  orderBy: { dayOfWeek: Prisma.SortOrder.asc },
  include: {
    shifts: {
      orderBy: { sortOrder: Prisma.SortOrder.asc },
      include: {
        breaks: true,
        service: { select: { id: true, name: true } },
      },
    },
  },
} satisfies Prisma.StaffMember$schedulesArgs;

/** Shared `include` for GET /staff/:id (spec §3: "detalle completo… incluyendo
 *  servicios asignados y horarios") — kept in one place so list and detail
 *  views can't quietly drift apart. */
const DETAIL_INCLUDE = {
  specialty: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, fullName: true } },
  services: {
    include: {
      // baseCommissionType/Value (nivel 2) viajan con el servicio para que
      // el frontend pueda resolver la comisión efectiva de cada fila
      // (custom > base > default) sin una llamada aparte — ver
      // resolveCommission en validators/staff.ts.
      service: {
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          baseCommissionType: true,
          baseCommissionValue: true,
        },
      },
    },
  },
  schedules: SCHEDULE_INCLUDE,
  absences: { orderBy: { startDate: Prisma.SortOrder.desc } },
} satisfies Prisma.StaffMemberInclude;

const LIST_INCLUDE = {
  specialty: { select: { id: true, name: true } },
  _count: { select: { services: true, absences: true } },
  schedules: SCHEDULE_INCLUDE,
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
      dto.serviceIds.forEach((entry) =>
        assertCommissionIsValid(
          { type: entry.customCommissionType, value: entry.customCommissionValue },
          'La comisión personalizada del servicio',
        ),
      );
    }
    assertCommissionIsValid(
      { type: dto.defaultCommissionType, value: dto.defaultCommissionValue },
      'La comisión general por defecto',
    );
    const schedules = this.validateSchedules(dto.schedules);
    await this.assertShiftServicesBelongToTenant(tenantId, schedules);

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
            data: dto.serviceIds.map((entry) => this.buildStaffServiceData(created.id, entry)),
          });
        }
        if (schedules) {
          await this.writeSchedules(tx, created.id, schedules);
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
      dto.serviceIds.forEach((entry) =>
        assertCommissionIsValid(
          { type: entry.customCommissionType, value: entry.customCommissionValue },
          'La comisión personalizada del servicio',
        ),
      );
    }
    assertCommissionIsValid(
      { type: dto.defaultCommissionType, value: dto.defaultCommissionValue },
      'La comisión general por defecto',
    );
    const schedules = this.validateSchedules(dto.schedules);
    await this.assertShiftServicesBelongToTenant(tenantId, schedules);

    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        await tx.staffMember.update({
          where: { id, tenantId },
          data: this.buildWritableData(dto, current),
        });

        if (dto.serviceIds) {
          await tx.staffService.deleteMany({ where: { staffMemberId: id } });
          await tx.staffService.createMany({
            data: dto.serviceIds.map((entry) => this.buildStaffServiceData(id, entry)),
          });
        }
        if (schedules) {
          // Cascade (schema.prisma) takes StaffScheduleShift and StaffBreak
          // with it — no need to delete those levels by hand.
          await tx.staffSchedule.deleteMany({ where: { staffMemberId: id } });
          await this.writeSchedules(tx, id, schedules);
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

      // TODOS resolves against every ACTIVE service, read fresh inside this
      // transaction — the same "checked at write time, not at preview time"
      // reasoning as allServiceNames above, since which services are active
      // can change between the dry-run and the confirm click. Fetched once,
      // lazily, only if some row actually wrote the keyword.
      const needsAllServices = parsed.data.some((row) => row.allServicesRequested);
      const allActiveServiceIds = needsAllServices
        ? (
            await tx.service.findMany({
              where: { tenantId, isActive: true },
              select: { id: true },
            })
          ).map((s) => s.id)
        : [];

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

        const serviceIds = row.allServicesRequested
          ? allActiveServiceIds
          : row.serviceNames.map((name) => {
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
      data: {
        staffMemberId,
        type: dto.type ?? ExceptionType.CUSTOM_OFF,
        reason: dto.reason,
        internalNote: dto.internalNote ?? null,
        startDate,
        endDate,
      },
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
  // Matriz de competencias (asignación masiva Doctores <-> Servicios)
  // -------------------------------------------------------------------------

  /**
   * GET /staff/services/matrix — datos crudos para pintar la grilla
   * "Filas = Personal, Columnas = Servicios" (StaffServiceMatrixDialog).
   *
   * Devuelve el universo completo de profesionales y servicios activos del
   * tenant, más las celdas actualmente marcadas, en una sola llamada — la
   * grilla no puede construirse a partir de GET /staff (paginado y sin la
   * lista de servicios habilitados por fila) sin N+1 requests.
   */
  async getServiceMatrix(tenantId: string) {
    const [staffMembers, services, assignments] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          color: true,
          specialty: { select: { id: true, name: true } },
          // Nivel 3 (default) — el frontend resuelve el nivel efectivo por
          // celda combinando esto con el `baseCommission*` de cada servicio
          // y el `customCommission*` de la asignación (ver resolveCommission,
          // validators/staff.ts).
          defaultCommissionType: true,
          defaultCommissionValue: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          category: { select: { id: true, name: true, color: true } },
          // Nivel 2 (base).
          baseCommissionType: true,
          baseCommissionValue: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.staffService.findMany({
        where: { staffMember: { tenantId } },
        select: {
          staffMemberId: true,
          serviceId: true,
          customDurationMinutes: true,
          // Nivel 1 (custom, el más específico).
          customCommissionType: true,
          customCommissionValue: true,
        },
      }),
    ]);

    // Los tres niveles del Esquema de Comisiones Jerárquico son Decimal —
    // serializados aquí (mismo tratamiento que service.serializer.ts's
    // toMoney) porque esta respuesta sale directo, sin pasar por
    // serializeStaffMember/serializeService.
    const toMoney = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));

    return {
      staffMembers: staffMembers.map((member) => ({
        ...member,
        defaultCommissionValue: toMoney(member.defaultCommissionValue),
      })),
      services: services.map((service) => ({
        ...service,
        baseCommissionValue: toMoney(service.baseCommissionValue),
      })),
      assignments: assignments.map((entry) => ({
        ...entry,
        customCommissionValue: toMoney(entry.customCommissionValue),
      })),
    };
  }

  /**
   * POST /staff/services/bulk-matrix — altas y bajas masivas de StaffService
   * dentro de una sola transacción (Engine de Disponibilidad, inspirado en
   * JetAppointment).
   *
   * `serviceIds` es el ALCANCE de la sincronización, no solo la lista de
   * columnas presentes en `assignments`: para cada servicio en `serviceIds`,
   * el conjunto final de profesionales asignados queda EXACTAMENTE igual a
   * lo que `assignments` describe para ese servicio — incluida la posibilidad
   * de dejarlo en cero. Un servicio que no aparece en `serviceIds` no se toca,
   * lo que permite que ServiceFormDialog envíe solo su propio servicio
   * (`serviceIds: [service.id]`) sin arrastrar consigo el resto de la matriz.
   *
   * `customDurationMinutes` solo se escribe cuando el llamador lo envía —
   * omitido, deja intacta la personalización que ya tuviera esa fila (p.ej.
   * la que StaffFormDialog's Tab 2 configuró), así la grilla puede
   * marcar/desmarcar celdas sin pisar esos ajustes finos.
   */
  async bulkSyncServiceMatrix(tenantId: string, dto: BulkServiceMatrixDto) {
    await this.assertServicesBelongToTenant(tenantId, dto.serviceIds);
    const staffIds = [...new Set(dto.assignments.map((entry) => entry.staffMemberId))];
    await this.assertStaffMembersBelongToTenant(tenantId, staffIds);

    const scope = new Set(dto.serviceIds);
    for (const entry of dto.assignments) {
      if (!scope.has(entry.serviceId)) {
        throw new BadRequestException(
          'Cada asignación debe referirse a un servicio incluido en serviceIds.',
        );
      }
      assertCommissionIsValid(
        { type: entry.customCommissionType, value: entry.customCommissionValue },
        'La comisión personalizada del servicio',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.staffService.findMany({
        where: { serviceId: { in: dto.serviceIds } },
        select: { id: true, staffMemberId: true, serviceId: true },
      });
      const desired = new Set(dto.assignments.map((entry) => `${entry.staffMemberId}:${entry.serviceId}`));
      const toDelete = existing.filter((row) => !desired.has(`${row.staffMemberId}:${row.serviceId}`));

      if (toDelete.length > 0) {
        await tx.staffService.deleteMany({ where: { id: { in: toDelete.map((row) => row.id) } } });
      }

      for (const entry of dto.assignments) {
        // customCommissionType/customCommissionValue always travel together
        // on `update` (assertCommissionIsValid already required
        // both-or-neither), so either both are written or the existing
        // override (nivel 1) is left alone.
        const commissionUpdate: Prisma.StaffServiceUpdateInput =
          entry.customCommissionType !== undefined
            ? {
                customCommissionType: entry.customCommissionType,
                customCommissionValue: entry.customCommissionValue,
              }
            : {};

        await tx.staffService.upsert({
          where: {
            staffMemberId_serviceId: {
              staffMemberId: entry.staffMemberId,
              serviceId: entry.serviceId,
            },
          },
          update: {
            ...(entry.customDurationMinutes !== undefined
              ? { customDurationMinutes: entry.customDurationMinutes }
              : {}),
            ...commissionUpdate,
          },
          create: {
            staffMemberId: entry.staffMemberId,
            serviceId: entry.serviceId,
            customDurationMinutes: entry.customDurationMinutes ?? null,
            customCommissionType: entry.customCommissionType ?? null,
            customCommissionValue: entry.customCommissionValue ?? null,
          },
        });
      }

      this.logger.log(
        `Matriz de competencias sincronizada en el centro ${tenantId}: ` +
          `${dto.assignments.length} asignación(es), ${toDelete.length} eliminada(s).`,
      );
      return { assigned: dto.assignments.length, removed: toDelete.length };
    });
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
      documentType: dto.documentType === undefined ? undefined : (dto.documentType ?? null),
      documentNumber: dto.documentNumber === undefined ? undefined : (dto.documentNumber ?? null),
      medicalLicense: dto.medicalLicense === undefined ? undefined : (dto.medicalLicense ?? null),
      email: dto.email === undefined ? undefined : (dto.email ?? null),
      phone: dto.phone === undefined ? undefined : (dto.phone ?? null),
      avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl ?? null),
      biography: dto.biography === undefined ? undefined : (dto.biography ?? null),
      color: dto.color === undefined ? undefined : (dto.color ?? null),
      commissionPercentage:
        dto.commissionPercentage === undefined ? undefined : (dto.commissionPercentage ?? null),
      // Nivel 3 (default) del Esquema de Comisiones Jerárquico.
      defaultCommissionType:
        dto.defaultCommissionType === undefined ? undefined : (dto.defaultCommissionType ?? null),
      defaultCommissionValue:
        dto.defaultCommissionValue === undefined ? undefined : (dto.defaultCommissionValue ?? null),
      isActive: dto.isActive,
      googleEmail: dto.googleEmail === undefined ? undefined : (dto.googleEmail ?? null),
    };
  }

  /** Everything a StaffService row needs beyond staffMemberId/serviceId — one
   *  place so create() and update() build the exact same shape. */
  private buildStaffServiceData(staffMemberId: string, entry: StaffServiceAssignmentDto) {
    return {
      staffMemberId,
      serviceId: entry.serviceId,
      customDurationMinutes: entry.customDurationMinutes ?? null,
      customBufferBeforeMin: entry.customBufferBeforeMin ?? null,
      customBufferAfterMin: entry.customBufferAfterMin ?? null,
      hideBufferFromClient: entry.hideBufferFromClient ?? false,
      // Nivel 1 (custom) del Esquema de Comisiones Jerárquico.
      customCommissionType: entry.customCommissionType ?? null,
      customCommissionValue: entry.customCommissionValue ?? null,
    };
  }

  /**
   * Normalises `schedules` (Engine de Disponibilidad — multi-turno,
   * multi-descanso) and enforces the invariants nested `@ValidateNested`
   * decorators cannot express across a whole array: no two días repetidos,
   * turnos del mismo día que no se superpongan, start < end en cada turno y
   * descanso, y cada descanso dentro de su propio turno.
   *
   * Returns `undefined` when the field was not sent (PATCH: "no tocar el
   * horario"), so the caller can tell that apart from an explicit `[]`. A día
   * enviado sin turnos se descarta silenciosamente — equivale a "inactivo",
   * igual que antes con el toggle de la UI.
   */
  private validateSchedules(
    days: StaffScheduleDayInputDto[] | undefined,
  ): NormalizedScheduleDay[] | undefined {
    if (days === undefined) return undefined;

    const seenDays = new Set<number>();
    const normalized: NormalizedScheduleDay[] = [];

    for (const day of days) {
      if (seenDays.has(day.dayOfWeek)) {
        throw new BadRequestException(
          `El horario tiene más de una entrada para el día ${day.dayOfWeek}.`,
        );
      }
      seenDays.add(day.dayOfWeek);

      const shifts = day.shifts ?? [];
      if (shifts.length === 0) continue;

      // Ordenados por hora de inicio para poder detectar solapamientos entre
      // turnos consecutivos con una sola pasada.
      const sortedShifts = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const normalizedShifts: NormalizedShift[] = [];

      sortedShifts.forEach((shift, index) => {
        if (shift.startTime >= shift.endTime) {
          throw new BadRequestException(
            `La hora de inicio de un turno del día ${day.dayOfWeek} debe ser anterior a la de fin.`,
          );
        }
        const previous = sortedShifts[index - 1];
        if (previous && shift.startTime < previous.endTime) {
          throw new BadRequestException(
            `Los turnos del día ${day.dayOfWeek} se superponen entre sí.`,
          );
        }

        const breaks = shift.breaks ?? [];
        const sortedBreaks = [...breaks].sort((a, b) => a.startTime.localeCompare(b.startTime));
        sortedBreaks.forEach((brk, breakIndex) => {
          if (brk.startTime >= brk.endTime) {
            throw new BadRequestException('La hora de inicio de un descanso debe ser anterior a la de fin.');
          }
          if (brk.startTime < shift.startTime || brk.endTime > shift.endTime) {
            throw new BadRequestException('Un descanso debe estar dentro de las horas de su turno.');
          }
          const previousBreak = sortedBreaks[breakIndex - 1];
          if (previousBreak && brk.startTime < previousBreak.endTime) {
            throw new BadRequestException('Los descansos de un mismo turno no pueden superponerse.');
          }
        });

        normalizedShifts.push({
          startTime: shift.startTime,
          endTime: shift.endTime,
          serviceId: shift.serviceId ?? null,
          sortOrder: index,
          breaks: sortedBreaks.map((brk) => ({
            startTime: brk.startTime,
            endTime: brk.endTime,
            label: brk.label ?? null,
          })),
        });
      });

      normalized.push({
        dayOfWeek: day.dayOfWeek,
        isActive: day.isActive ?? true,
        shifts: normalizedShifts,
      });
    }

    return normalized;
  }

  /** Nested-create — one `staffSchedule.create()` per día (≤7), each with its
   *  turnos and descansos created in the same call. createMany() cannot
   *  attach nested relations, same limitation ServicesService.packagesWriteInput
   *  documents for ServicePackage. */
  private async writeSchedules(
    tx: Prisma.TransactionClient,
    staffMemberId: string,
    days: NormalizedScheduleDay[],
  ): Promise<void> {
    for (const day of days) {
      await tx.staffSchedule.create({
        data: {
          staffMemberId,
          dayOfWeek: day.dayOfWeek,
          isActive: day.isActive,
          shifts: {
            create: day.shifts.map((shift) => ({
              startTime: shift.startTime,
              endTime: shift.endTime,
              serviceId: shift.serviceId,
              sortOrder: shift.sortOrder,
              breaks: { create: shift.breaks },
            })),
          },
        },
      });
    }
  }

  /** A turno's serviceId is just a UUID until it is proven to belong to this
   *  tenant — same isolation check as assertServicesBelongToTenant, run
   *  separately because these ids live inside `schedules`, not `serviceIds`. */
  private async assertShiftServicesBelongToTenant(
    tenantId: string,
    days: NormalizedScheduleDay[] | undefined,
  ): Promise<void> {
    if (!days) return;
    const serviceIds = days.flatMap((day) =>
      day.shifts.map((shift) => shift.serviceId).filter((id): id is string => id !== null),
    );
    await this.assertServicesBelongToTenant(tenantId, serviceIds);
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

  /** Same isolation check as assertServicesBelongToTenant, for the staff side
   *  of the matriz de competencias — a staffMemberId is just a UUID until it
   *  is proven to belong to this tenant. */
  private async assertStaffMembersBelongToTenant(tenantId: string, staffMemberIds: string[]): Promise<void> {
    if (staffMemberIds.length === 0) return;
    const unique = [...new Set(staffMemberIds)];
    const found = await this.prisma.staffMember.count({ where: { id: { in: unique }, tenantId } });
    if (found !== unique.length) {
      throw new UnprocessableEntityException(
        'Uno o más profesionales seleccionados no existen en tu centro estético.',
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
