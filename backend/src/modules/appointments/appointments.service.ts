import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import type { CalendarEventPayload } from '../google-calendar/types/calendar-event-payload';
import { PrismaService } from '../prisma/prisma.service';
import { resourceOverlaps, staffOverlaps, type OverlapCandidate } from './overlap.util';
import { AppointmentsExcelImportService } from './appointments-excel-import.service';
import { normalizeHeader } from './appointments-template.generator';
import { BulkImportAppointmentsDto } from './dto/bulk-import-appointments.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentGridGroupBy, QueryAppointmentsGridDto } from './dto/query-appointments-grid.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-status.dto';

/** Granularidad del grid de slots candidatos — cada 15 minutos, mismo
 *  intervalo que el resto de la app usa para horarios (StaffScheduleShift,
 *  BranchWorkingHour son en minutos "HH:mm" libres, pero 15' es el estándar
 *  de la industria para agendas de centro estético). */
const SLOT_STEP_MINUTES = 15;

/** Estados que realmente ocupan la agenda de un profesional — una cita
 *  cancelada o no-show libera el horario para nuevas reservas. */
const BLOCKING_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'IN_SERVICE', 'COMPLETED'];

/** Tipos de StaffAbsence que efectivamente bloquean el día completo. Este
 *  MVP del motor de slots no soporta WORKING_DAY (apertura extraordinaria):
 *  StaffAbsence no guarda un rango horario propio, así que no hay con qué
 *  construir un turno para un día que StaffSchedule marca cerrado — queda
 *  pendiente de un campo de horas en StaffAbsence para una fase futura. */
const BLOCKING_ABSENCE_TYPES = ['CUSTOM_OFF', 'REPETITIVE_OFF'] as const;

interface TimeWindow {
  start: Date;
  end: Date;
}

const DETAIL_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  staffMember: { select: { id: true, firstName: true, lastName: true, color: true } },
  service: { select: { id: true, name: true, durationMinutes: true, bufferMinutes: true } },
  room: { select: { id: true, name: true } },
  equipment: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentDetail = Prisma.AppointmentGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Módulo 06 — Engine de Reservas y Agenda Interactiva (Fase 1: Backend Core).
 *
 * El motor de slots (getAvailableSlots) cruza cuatro fuentes (spec §3):
 * horario del profesional (StaffSchedule/StaffScheduleShift/StaffBreak),
 * ausencias (StaffAbsence), citas existentes (Appointment) y la duración +
 * buffer del servicio — nunca persiste nada, solo calcula.
 */
@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly excel: AppointmentsExcelImportService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /** GET /appointments — rango de fechas obligatorio (una agenda siempre
   *  pide un día/semana/mes, nunca "todas las citas de siempre"). */
  async findAll(tenantId: string, query: QueryAppointmentsDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      startAt: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) },
      ...(query.staffMemberId ? { staffMemberId: query.staffMemberId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { startAt: 'asc' },
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data,
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  async findOne(tenantId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: DETAIL_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('La cita no existe o no pertenece a tu centro estético.');
    }
    return appointment;
  }

  /**
   * GET /appointments/grid — la consulta detrás de la matriz temporal del
   * frontend (Agenda unificada): una fila por recurso (profesional, sala o
   * equipo, según `groupBy`), con sus citas del rango ya agrupadas, lista
   * para pintar columnas sin que el cliente tenga que cruzar nada.
   *
   * Los recursos SIN citas en el rango también se incluyen (columna vacía)
   * — todo profesional/sala/equipo activo del tenant aparece, no solo los
   * que tienen reservas, para que la grilla no "salte" recursos.
   *
   * La ocupación es una aproximación por ventana de tiempo (minutos
   * reservados / (N recursos × minutos del rango pedido)), NO un cálculo
   * real de horario por-profesional — mismo criterio simplificado que el
   * banner de KPIs del frontend, documentado aquí porque este endpoint es
   * ahora la fuente que debería reemplazarlo cuando el frontend se conecte.
   */
  async getGrid(tenantId: string, query: QueryAppointmentsGridDto) {
    const dateFrom = new Date(query.startDate);
    const dateTo = new Date(query.endDate);
    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    if (dateFrom >= dateTo) {
      throw new BadRequestException('"startDate" debe ser anterior a "endDate".');
    }

    const [resources, appointments] = await Promise.all([
      this.loadGridResources(tenantId, query.groupBy),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          status: { in: BLOCKING_STATUSES },
          startAt: { lt: dateTo },
          endAt: { gt: dateFrom },
        },
        include: DETAIL_INCLUDE,
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const windowMinutes = (dateTo.getTime() - dateFrom.getTime()) / 60_000;
    const byResource = new Map<string, AppointmentDetail[]>(resources.map((resource) => [resource.id, []]));

    let totalBookedMinutes = 0;
    for (const appointment of appointments) {
      totalBookedMinutes += (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000;
      const resourceId = this.resolveGridResourceId(appointment, query.groupBy);
      if (resourceId) byResource.get(resourceId)?.push(appointment);
    }

    const resourceRows = resources.map((resource) => {
      const items = byResource.get(resource.id) ?? [];
      const bookedMinutes = items.reduce(
        (sum, appointment) => sum + (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000,
        0,
      );
      return {
        id: resource.id,
        name: resource.name,
        color: resource.color,
        appointments: items,
        bookedMinutes,
        occupancyRate: windowMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / windowMinutes) * 100)) : 0,
      };
    });

    const capacityMinutes = Math.max(resources.length, 1) * windowMinutes;

    return {
      groupBy: query.groupBy,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      resources: resourceRows,
      occupancy: {
        bookedMinutes: totalBookedMinutes,
        capacityMinutes,
        rate: capacityMinutes > 0 ? Math.min(100, Math.round((totalBookedMinutes / capacityMinutes) * 100)) : 0,
      },
    };
  }

  /** GET /appointments/rooms — catálogo de salas/cabinas activas del tenant,
   *  para el desplegable opcional del formulario de citas. */
  async listRooms(tenantId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.room.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** GET /appointments/equipment — catálogo de equipos/aparatología activos
   *  del tenant, mismo propósito que listRooms. */
  async listEquipment(tenantId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.equipment.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Carga masiva (Excel/CSV)
  // -------------------------------------------------------------------------

  /** GET /appointments/export-template. */
  async generateTemplate(tenantId: string): Promise<Buffer> {
    const [professionals, services, rooms, equipment] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: { firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.room.findMany({ where: { tenantId, isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      this.prisma.equipment.findMany({
        where: { tenantId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return this.excel.generateTemplate({
      professionalNames: professionals.map((p) => `${p.firstName} ${p.lastName}`),
      serviceNames: services.map((s) => s.name),
      roomNames: rooms.map((r) => r.name),
      equipmentNames: equipment.map((e) => e.name),
    });
  }

  /**
   * POST /appointments/import-preview (dryRun) y POST /appointments/import.
   *
   * A diferencia de Personal/Servicios, nada se auto-crea acá: paciente,
   * profesional, servicio, sala y equipo deben existir ya — el parser solo
   * los resuelve por teléfono/nombre y reporta lo que no encuentra. El
   * chequeo de choque de horario corre en el propio parser (no acá) porque
   * también debe detectar dos filas del mismo archivo que chocan entre sí,
   * no solo contra la base de datos — ver AppointmentsExcelImportService.
   */
  async importFromExcel(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<{
    successCount: number;
    totalRows: number;
    errors: { row: number; column: string; error: string }[];
    warnings: { row: number; column: string; error: string }[];
    imported: number;
    dryRun: boolean;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta un archivo .xlsx o .csv en el campo "file".');
    }

    const [patients, professionals, services, rooms, equipment, existingAppointments] = await Promise.all([
      this.prisma.patient.findMany({ where: { tenantId }, select: { id: true, phone: true } }),
      this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, durationMinutes: true, bufferMinutes: true },
      }),
      this.prisma.room.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.equipment.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      // Solo futuras: una carga masiva reserva horarios por venir, no reescribe
      // historial — acota el tamaño del set contra el que se revisa choque.
      this.prisma.appointment.findMany({
        where: { tenantId, status: { in: BLOCKING_STATUSES }, startAt: { gt: new Date() } },
        select: { staffMemberId: true, roomId: true, equipmentId: true, startAt: true, endAt: true, bufferMinutes: true },
      }),
    ]);

    const parsed = await this.excel.parseAndValidateExcel(file.buffer, {
      existingPatients: patients.filter((p): p is { id: string; phone: string } => Boolean(p.phone)),
      existingProfessionals: professionals.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
      existingServices: services,
      existingRooms: rooms,
      existingEquipment: equipment,
      existingAppointments,
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of parsed.data) {
        const created = await tx.appointment.create({
          data: {
            tenantId,
            patientId: row.patientId,
            staffMemberId: row.staffMemberId,
            serviceId: row.serviceId,
            roomId: row.roomId,
            equipmentId: row.equipmentId,
            startAt: new Date(row.startAt),
            endAt: new Date(row.endAt),
            bufferMinutes: row.bufferMinutes,
            notes: row.notes,
          },
        });
        await tx.appointmentLog.create({
          data: { appointmentId: created.id, fromStatus: null, toStatus: 'PENDING', note: 'Creada por carga masiva.' },
        });
        count += 1;
      }
      return count;
    });

    this.logger.log(`Carga masiva de citas: ${imported} cita(s) creada(s) en el centro ${tenantId}.`);

    return { ...parsed, imported, dryRun: false };
  }

  /** UUID v4 — usado para decidir si `staffMemberId` en el JSON de
   *  /appointments/bulk-import es un id directo o un nombre a resolver. */
  private static readonly UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /**
   * POST /appointments/bulk-import — carga masiva vía JSON (integraciones
   * externas), hermana de importFromExcel pero sin la capa de lectura de
   * hoja de cálculo: el llamador ya entrega campos tipados.
   *
   * Dos fases: (1) valida el lote COMPLETO sin escribir nada —
   * profesional/servicio existen, fechas válidas, y disponibilidad de
   * horario reutilizando el mismo `assertSlotIsFree` que usan create()/
   * reschedule() (evita choques de doctor, sala y equipo contra la base de
   * datos), más un chequeo adicional en memoria contra el resto del propio
   * lote — assertSlotIsFree por sí solo no vería dos filas de este mismo
   * payload chocar entre sí, porque ninguna existe todavía en la base
   * mientras se valida. (2) si `failOnError` es true y hubo algún error, no
   * se escribe nada (todo o nada); si no, se escriben las filas válidas —
   * el paciente se busca por teléfono y se crea si no existe.
   */
  async bulkImport(
    tenantId: string,
    dto: BulkImportAppointmentsDto,
  ): Promise<{
    importedCount: number;
    failedCount: number;
    errors: { index: number; field: string; error: string }[];
    rolledBack: boolean;
    results: { index: number; appointmentId: string }[];
  }> {
    const [professionals, services, rooms, equipment] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.service.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, bufferMinutes: true, durationMinutes: true },
      }),
      this.prisma.room.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
      this.prisma.equipment.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
    ]);
    const staffById = new Map(professionals.map((s) => [s.id, { id: s.id, name: `${s.firstName} ${s.lastName}` }]));
    const staffByName = new Map(
      professionals.map((s) => [normalizeHeader(`${s.firstName} ${s.lastName}`), { id: s.id, name: `${s.firstName} ${s.lastName}` }]),
    );
    const servicesByName = new Map(services.map((s) => [normalizeHeader(s.name), s]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const roomByName = new Map(rooms.map((r) => [normalizeHeader(r.name), r]));
    const equipmentById = new Map(equipment.map((e) => [e.id, e]));
    const equipmentByName = new Map(equipment.map((e) => [normalizeHeader(e.name), e]));

    /** Resuelve un id-o-nombre de sala/equipo contra sus catálogos — mismo
     *  criterio que `staffMemberId`. `undefined` = campo opcional omitido
     *  (no es error); una vez el campo viene informado, no matchear sí lo es. */
    const resolveOptionalResource = (
      value: string | undefined,
      byId: Map<string, { id: string; name: string }>,
      byName: Map<string, { id: string; name: string }>,
    ): { id: string; name: string } | null | undefined => {
      if (value === undefined) return undefined;
      const resolved = AppointmentsService.UUID_V4_PATTERN.test(value) ? byId.get(value) : byName.get(normalizeHeader(value));
      return resolved ?? null;
    };

    const errors: { index: number; field: string; error: string }[] = [];
    const acceptedInBatch: OverlapCandidate[] = [];
    const toCreate: {
      index: number;
      patientPhone: string;
      patientName: string | null;
      staffMemberId: string;
      serviceId: string;
      roomId: string | null;
      equipmentId: string | null;
      startAt: Date;
      endAt: Date;
      bufferMinutes: number;
      notes: string | null;
    }[] = [];

    // -------------------------------------------------------------------
    // Fase 1 — validar todo el lote, sin tocar la base de datos.
    // -------------------------------------------------------------------
    for (let index = 0; index < dto.appointments.length; index += 1) {
      const item = dto.appointments[index];
      const fail = (field: string, message: string) => errors.push({ index, field, error: message });

      const patientPhone = this.normalizeBulkImportPhone(item.patientPhone);
      if (!patientPhone) {
        fail('patientPhone', 'El teléfono del paciente no es válido.');
        continue;
      }

      const staff = AppointmentsService.UUID_V4_PATTERN.test(item.staffMemberId)
        ? staffById.get(item.staffMemberId)
        : staffByName.get(normalizeHeader(item.staffMemberId));
      if (!staff) {
        fail('staffMemberId', `El profesional "${item.staffMemberId}" no existe o no está activo.`);
        continue;
      }

      const service = servicesByName.get(normalizeHeader(item.serviceName));
      if (!service) {
        fail('serviceName', `El servicio "${item.serviceName}" no existe o no está activo.`);
        continue;
      }

      const startAt = new Date(item.startAt);
      if (Number.isNaN(startAt.getTime())) {
        fail('startAt', 'La fecha/hora no es válida.');
        continue;
      }
      let endAt: Date;
      if (item.endAt !== undefined) {
        endAt = new Date(item.endAt);
        if (Number.isNaN(endAt.getTime())) {
          fail('endAt', 'La fecha/hora de fin no es válida.');
          continue;
        }
        if (endAt <= startAt) {
          fail('endAt', '"endAt" debe ser posterior a "startAt".');
          continue;
        }
      } else {
        endAt = addMinutes(startAt, service.durationMinutes);
      }

      const resolvedRoom = resolveOptionalResource(item.roomId, roomById, roomByName);
      if (resolvedRoom === null) {
        fail('roomId', `La sala/cabina "${item.roomId}" no existe o no está activa.`);
        continue;
      }
      const resolvedEquipment = resolveOptionalResource(item.equipmentId, equipmentById, equipmentByName);
      if (resolvedEquipment === null) {
        fail('equipmentId', `El equipo "${item.equipmentId}" no existe o no está activo.`);
        continue;
      }
      const roomId = resolvedRoom?.id ?? null;
      const equipmentId = resolvedEquipment?.id ?? null;

      const batchConflict = acceptedInBatch.find(
        (existing) =>
          (existing.staffMemberId === staff.id && staffOverlaps(existing, startAt, endAt, service.bufferMinutes)) ||
          (roomId !== null && existing.roomId === roomId && resourceOverlaps(existing, startAt, endAt)) ||
          (equipmentId !== null && existing.equipmentId === equipmentId && resourceOverlaps(existing, startAt, endAt)),
      );
      if (batchConflict) {
        fail(
          'startAt',
          `Choca con otra fila del mismo lote (${formatTimeEs(batchConflict.startAt)}–${formatTimeEs(batchConflict.endAt)}).`,
        );
        continue;
      }

      try {
        // Mismo algoritmo anticolisión que create()/reschedule() — valida
        // existencia y disponibilidad de sala/equipo y el buffer del
        // profesional, todo contra la base de datos real.
        await this.assertSlotIsFree(tenantId, { staffMemberId: staff.id, roomId, equipmentId }, startAt, endAt, service.bufferMinutes);
      } catch (error) {
        fail('startAt', error instanceof Error ? error.message : 'El horario no está disponible.');
        continue;
      }

      acceptedInBatch.push({ staffMemberId: staff.id, roomId, equipmentId, startAt, endAt, bufferMinutes: service.bufferMinutes });
      toCreate.push({
        index,
        patientPhone,
        patientName: item.patientName?.trim() || null,
        staffMemberId: staff.id,
        serviceId: service.id,
        roomId,
        equipmentId,
        startAt,
        endAt,
        bufferMinutes: service.bufferMinutes,
        notes: item.notes?.trim() || null,
      });
    }

    if (dto.failOnError && errors.length > 0) {
      this.logger.log(
        `Carga masiva de citas (JSON) abortada por failOnError: ${errors.length} error(es) de ${dto.appointments.length} en el centro ${tenantId}.`,
      );
      return { importedCount: 0, failedCount: errors.length, errors, rolledBack: true, results: [] };
    }

    // -------------------------------------------------------------------
    // Fase 2 — escribir solo las filas válidas. El paciente se busca por
    // teléfono y se crea si no existe (una sola vez por teléfono repetido
    // dentro del mismo lote).
    // -------------------------------------------------------------------
    const results: { index: number; appointmentId: string }[] = [];
    if (toCreate.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const patientIdByPhone = new Map<string, string>();
        for (const row of toCreate) {
          let patientId = patientIdByPhone.get(row.patientPhone);
          if (!patientId) {
            const existingPatient = await tx.patient.findFirst({
              where: { tenantId, phone: row.patientPhone },
              select: { id: true },
            });
            if (existingPatient) {
              patientId = existingPatient.id;
            } else {
              const nameSource = row.patientName ?? row.patientPhone;
              const [firstName, ...rest] = nameSource.split(/\s+/).filter(Boolean);
              const createdPatient = await tx.patient.create({
                data: {
                  tenantId,
                  firstName: firstName || row.patientPhone,
                  lastName: rest.join(' '),
                  phone: row.patientPhone,
                },
              });
              patientId = createdPatient.id;
            }
            patientIdByPhone.set(row.patientPhone, patientId);
          }

          const created = await tx.appointment.create({
            data: {
              tenantId,
              patientId,
              staffMemberId: row.staffMemberId,
              serviceId: row.serviceId,
              roomId: row.roomId,
              equipmentId: row.equipmentId,
              startAt: row.startAt,
              endAt: row.endAt,
              bufferMinutes: row.bufferMinutes,
              notes: row.notes,
            },
          });
          await tx.appointmentLog.create({
            data: { appointmentId: created.id, fromStatus: null, toStatus: 'PENDING', note: 'Creada por carga masiva (API).' },
          });
          results.push({ index: row.index, appointmentId: created.id });
        }
      });
    }

    this.logger.log(
      `Carga masiva de citas (JSON): ${results.length} cita(s) creada(s), ${errors.length} error(es), en el centro ${tenantId}.`,
    );

    return {
      importedCount: results.length,
      failedCount: errors.length,
      errors,
      rolledBack: false,
      results,
    };
  }

  /** Mismo criterio que CreatePatientDto/CreateStaffDto's normalizePhone —
   *  duplicado a propósito (ver el comentario equivalente en
   *  AppointmentsExcelImportService). */
  private normalizeBulkImportPhone(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('+')) {
      return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `+51${digits}` : '';
  }

  /** Recursos activos del tenant para el agrupador pedido — la lista base de
   *  columnas de la grilla, con o sin citas todavía. */
  private async loadGridResources(
    tenantId: string,
    groupBy: AppointmentGridGroupBy,
  ): Promise<{ id: string; name: string; color: string | null }[]> {
    if (groupBy === AppointmentGridGroupBy.PROFESSIONAL) {
      const staff = await this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true, color: true },
        orderBy: { firstName: 'asc' },
      });
      return staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}`, color: member.color }));
    }
    if (groupBy === AppointmentGridGroupBy.ROOM) {
      const rooms = await this.prisma.room.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return rooms.map((room) => ({ id: room.id, name: room.name, color: null }));
    }
    const equipment = await this.prisma.equipment.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return equipment.map((item) => ({ id: item.id, name: item.name, color: null }));
  }

  /** Which resource column a given cita belongs to for the active `groupBy`
   *  — null when the cita has no room/equipment assigned (it simply doesn't
   *  appear in a Sala/Equipo grid, same as a product with no category
   *  doesn't appear under a category filter). */
  private resolveGridResourceId(appointment: AppointmentDetail, groupBy: AppointmentGridGroupBy): string | null {
    if (groupBy === AppointmentGridGroupBy.PROFESSIONAL) return appointment.staffMemberId;
    if (groupBy === AppointmentGridGroupBy.ROOM) return appointment.roomId;
    return appointment.equipmentId;
  }

  /** GET /appointments/slots. */
  async getAvailableSlots(tenantId: string, query: QuerySlotsDto): Promise<string[]> {
    const service = await this.prisma.service.findFirst({
      where: { id: query.serviceId, tenantId },
      select: { durationMinutes: true, bufferMinutes: true },
    });
    if (!service) {
      throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
    }

    const staffMember = await this.prisma.staffMember.findFirst({
      where: { id: query.staffMemberId, tenantId },
      select: { id: true },
    });
    if (!staffMember) {
      throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
    }

    const dayStart = dateOnlyToUtc(query.date);
    const dayEnd = addMinutes(dayStart, 24 * 60);
    const dayOfWeek = dayStart.getUTCDay();

    const schedule = await this.prisma.staffSchedule.findFirst({
      where: { staffMemberId: query.staffMemberId, dayOfWeek },
      include: { shifts: { orderBy: { sortOrder: 'asc' }, include: { breaks: true } } },
    });
    if (!schedule || !schedule.isActive) return [];

    const blockingAbsence = await this.prisma.staffAbsence.findFirst({
      where: {
        staffMemberId: query.staffMemberId,
        type: { in: [...BLOCKING_ABSENCE_TYPES] },
        startDate: { lt: dayEnd },
        endDate: { gte: dayStart },
      },
      select: { id: true },
    });
    if (blockingAbsence) return [];

    const occupied = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        staffMemberId: query.staffMemberId,
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: dayEnd },
      },
      select: { startAt: true, endAt: true, bufferMinutes: true },
    });
    const occupiedWindows: TimeWindow[] = occupied
      .map((appointment) => ({
        start: appointment.startAt,
        end: addMinutes(appointment.endAt, appointment.bufferMinutes),
      }))
      // Solo las que realmente caen dentro de este día — startAt < dayEnd ya
      // filtrado en la consulta, pero una cita de ayer con buffer largo
      // podría "sangrar" hacia hoy sin este corte.
      .filter((window) => window.end > dayStart);

    const relevantShifts = schedule.shifts.filter(
      (shift) => !shift.serviceId || shift.serviceId === query.serviceId,
    );

    const now = new Date();
    const slots: string[] = [];
    const requiredMinutes = service.durationMinutes + service.bufferMinutes;

    for (const shift of relevantShifts) {
      const shiftWindow: TimeWindow = {
        start: timeOnDayToUtc(query.date, shift.startTime),
        end: timeOnDayToUtc(query.date, shift.endTime),
      };
      const busy = [
        ...shift.breaks.map((brk) => ({
          start: timeOnDayToUtc(query.date, brk.startTime),
          end: timeOnDayToUtc(query.date, brk.endTime),
        })),
        ...occupiedWindows,
      ];

      for (const free of subtractWindows(shiftWindow, busy)) {
        let cursor = ceilToStep(free.start, SLOT_STEP_MINUTES);
        while (addMinutes(cursor, requiredMinutes) <= free.end) {
          if (cursor > now) slots.push(cursor.toISOString());
          cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
        }
      }
    }

    return [...new Set(slots)].sort();
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  /** POST /appointments. Revalida el slot justo antes de insertar — la lista
   *  de GET /appointments/slots pudo quedar desactualizada entre que el
   *  usuario la vio y confirmó la reserva (otra persona pudo tomarla). */
  async create(tenantId: string, dto: CreateAppointmentDto) {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId },
      select: { durationMinutes: true, bufferMinutes: true },
    });
    if (!service) {
      throw new NotFoundException('El servicio no existe o no pertenece a tu centro estético.');
    }
    await this.assertPatientBelongsToTenant(tenantId, dto.patientId);
    await this.assertStaffBelongsToTenant(tenantId, dto.staffMemberId);

    const startAt = new Date(dto.startAt);
    const endAt = addMinutes(startAt, service.durationMinutes);

    await this.assertSlotIsFree(
      tenantId,
      { staffMemberId: dto.staffMemberId, roomId: dto.roomId, equipmentId: dto.equipmentId },
      startAt,
      endAt,
      service.bufferMinutes,
    );

    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          tenantId,
          patientId: dto.patientId,
          staffMemberId: dto.staffMemberId,
          serviceId: dto.serviceId,
          roomId: dto.roomId ?? null,
          equipmentId: dto.equipmentId ?? null,
          startAt,
          endAt,
          bufferMinutes: service.bufferMinutes,
          notes: dto.notes ?? null,
        },
        include: DETAIL_INCLUDE,
      });
      await tx.appointmentLog.create({
        data: { appointmentId: created.id, fromStatus: null, toStatus: 'PENDING' },
      });
      return created;
    });

    this.logger.log(`Cita ${appointment.id} reservada en el centro ${tenantId}.`);

    await this.syncAppointmentCreated(tenantId, appointment);
    return (await this.prisma.appointment.findFirst({ where: { id: appointment.id }, include: DETAIL_INCLUDE }))!;
  }

  /** PATCH /appointments/:id/status. */
  async updateStatus(tenantId: string, id: string, dto: UpdateAppointmentStatusDto) {
    const current = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La cita no existe o no pertenece a tu centro estético.');
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === 'CANCELLED'
            ? { cancelledAt: new Date(), cancellationReason: dto.note ?? current.cancellationReason }
            : {}),
        },
        include: DETAIL_INCLUDE,
      });
      await tx.appointmentLog.create({
        data: { appointmentId: id, fromStatus: current.status, toStatus: dto.status, note: dto.note ?? null },
      });
      return updated;
    });

    this.logger.log(`Cita ${id} cambió de ${current.status} a ${dto.status} en el centro ${tenantId}.`);

    if (dto.status === 'CANCELLED') {
      await this.syncAppointmentCancelled(tenantId, appointment);
      return (await this.prisma.appointment.findFirst({ where: { id }, include: DETAIL_INCLUDE }))!;
    }
    return appointment;
  }

  /** PATCH /appointments/:id/reschedule. */
  async reschedule(tenantId: string, id: string, dto: RescheduleAppointmentDto) {
    const current = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: { service: { select: { durationMinutes: true, bufferMinutes: true } } },
    });
    if (!current) {
      throw new NotFoundException('La cita no existe o no pertenece a tu centro estético.');
    }

    const staffMemberId = dto.staffMemberId ?? current.staffMemberId;
    if (dto.staffMemberId) {
      await this.assertStaffBelongsToTenant(tenantId, dto.staffMemberId);
    }
    // Omitido = se conserva el recurso actual (ver doc comment de
    // RescheduleAppointmentDto) — solo re-validado si de verdad cambió.
    const roomId = dto.roomId ?? current.roomId;
    const equipmentId = dto.equipmentId ?? current.equipmentId;

    const startAt = new Date(dto.startAt);
    let endAt: Date;
    if (dto.endAt) {
      endAt = new Date(dto.endAt);
      if (endAt <= startAt) {
        throw new BadRequestException('"endAt" debe ser posterior a "startAt".');
      }
    } else {
      endAt = addMinutes(startAt, current.service.durationMinutes);
    }

    await this.assertSlotIsFree(
      tenantId,
      { staffMemberId, roomId, equipmentId },
      startAt,
      endAt,
      current.service.bufferMinutes,
      id,
    );

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { startAt, endAt, staffMemberId, roomId, equipmentId },
        include: DETAIL_INCLUDE,
      });
      await tx.appointmentLog.create({
        data: {
          appointmentId: id,
          fromStatus: current.status,
          toStatus: current.status,
          note: `Reagendada al ${startAt.toISOString()}.`,
        },
      });
      return updated;
    });

    this.logger.log(`Cita ${id} reagendada en el centro ${tenantId}.`);

    await this.syncAppointmentRescheduled(tenantId, appointment);
    return appointment;
  }

  /** DELETE /appointments/:id — baja lógica (spec §4: "Cancelar cita con
   *  motivo"), nunca borrado físico. */
  async cancel(tenantId: string, id: string, dto: CancelAppointmentDto) {
    const current = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La cita no existe o no pertenece a tu centro estético.');
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason ?? null },
        include: DETAIL_INCLUDE,
      });
      await tx.appointmentLog.create({
        data: {
          appointmentId: id,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          note: dto.reason ?? null,
        },
      });
      return updated;
    });

    this.logger.log(`Cita ${id} cancelada en el centro ${tenantId}.`);

    await this.syncAppointmentCancelled(tenantId, appointment);
    return (await this.prisma.appointment.findFirst({ where: { id }, include: DETAIL_INCLUDE }))!;
  }

  // -------------------------------------------------------------------------
  // Google Calendar Jerárquico (Feature 09, Fase 4) — motor de sincronización
  // en cascada. Cada método envuelve TODO en try/catch y solo hace Logger.error:
  // una falla de Google (token revocado, cuota, red) nunca debe impedir que la
  // cita se guarde/actualice/cancele en el CRM — Google es un espejo, no la
  // fuente de verdad.
  // -------------------------------------------------------------------------

  /** null si el tenant no tiene la sincronización activa — evita repetir el
   *  `if (!syncEnabled || !parentCalendarId) return;` en cada método. */
  private async getGoogleSyncConfig(tenantId: string): Promise<{ parentCalendarId: string } | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { googleSyncEnabled: true, googleCalendarParentId: true },
    });
    if (!tenant?.googleSyncEnabled || !tenant.googleCalendarParentId) return null;
    return { parentCalendarId: tenant.googleCalendarParentId };
  }

  /** Dirección de la sede principal del tenant — lo más cercano a
   *  "ubicación" que el modelo de datos ofrece hoy: Appointment no está
   *  ligado a una Branch propia (Módulo 06 asume sede única). */
  private async resolveTenantLocation(tenantId: string): Promise<string | undefined> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId },
      orderBy: { isMain: 'desc' },
      select: { address: true },
    });
    return branch?.address ?? undefined;
  }

  private buildEventDescription(appointment: AppointmentDetail): string {
    const lines = [
      `Paciente: ${appointment.patient.firstName} ${appointment.patient.lastName}`,
      `Servicio: ${appointment.service.name}`,
      `Profesional: ${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`,
    ];
    if (appointment.notes) lines.push(`Notas: ${appointment.notes}`);
    return lines.join('\n');
  }

  private async buildEventPayload(tenantId: string, appointment: AppointmentDetail): Promise<CalendarEventPayload> {
    return {
      summary: `${appointment.service.name} — ${appointment.patient.firstName} ${appointment.patient.lastName}`,
      description: this.buildEventDescription(appointment),
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      location: await this.resolveTenantLocation(tenantId),
    };
  }

  /** Google no permite insertar directamente en el calendario personal de un
   *  tercero sin que él lo haya compartido — así que cuando el profesional
   *  no tiene un calendario hijo propio aprovisionado (`googleCalendarChildId`,
   *  todavía sin motor de aprovisionamiento automático) pero sí cargó su
   *  `googleEmail` (Staff Form, Fase 3), lo invitamos como asistente del
   *  evento del calendario padre en vez de duplicar el evento — Google le
   *  manda la invitación y, si la acepta, aparece en su calendario. */
  private async resolveChildSyncTarget(
    staffMemberId: string,
  ): Promise<{ childCalendarId: string | null; attendeeEmail: string | null }> {
    const staff = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      select: { googleCalendarChildId: true, googleEmail: true },
    });
    if (staff?.googleCalendarChildId) {
      return { childCalendarId: staff.googleCalendarChildId, attendeeEmail: null };
    }
    return { childCalendarId: null, attendeeEmail: staff?.googleEmail ?? null };
  }

  private async syncAppointmentCreated(tenantId: string, appointment: AppointmentDetail): Promise<void> {
    try {
      const config = await this.getGoogleSyncConfig(tenantId);
      if (!config) return;

      const { childCalendarId, attendeeEmail } = await this.resolveChildSyncTarget(appointment.staffMemberId);
      const payload = await this.buildEventPayload(tenantId, appointment);
      if (attendeeEmail) payload.attendees = [attendeeEmail];

      const parentEventId = await this.googleCalendar.createCalendarEvent(
        tenantId,
        config.parentCalendarId,
        payload,
      );

      let childEventId: string | null = null;
      if (childCalendarId) {
        // El evento hijo no lleva `attendees` — ya vive directamente en el
        // calendario del profesional, invitarlo a sí mismo no aplica.
        childEventId = await this.googleCalendar.createCalendarEvent(tenantId, childCalendarId, {
          ...payload,
          attendees: undefined,
        });
      }

      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleParentEventId: parentEventId, googleChildEventId: childEventId },
      });
    } catch (error) {
      this.logger.error(`No se pudo sincronizar la cita ${appointment.id} con Google Calendar: ${String(error)}`);
    }
  }

  /**
   * Nota de alcance: si el tenant cambia de calendario padre después de
   * crear una cita, el `googleParentEventId` guardado pertenece al
   * calendario VIEJO — este método siempre apunta al parentCalendarId
   * ACTUAL, así que una cita creada antes de ese cambio fallaría aquí (se
   * loguea y se ignora, no rompe el reagendado en el CRM). Reasignar
   * automáticamente el evento al nuevo calendario queda fuera de esta fase.
   */
  private async syncAppointmentRescheduled(tenantId: string, appointment: AppointmentDetail): Promise<void> {
    if (!appointment.googleParentEventId && !appointment.googleChildEventId) return;

    try {
      const { childCalendarId, attendeeEmail } = await this.resolveChildSyncTarget(appointment.staffMemberId);
      const payload = await this.buildEventPayload(tenantId, appointment);

      if (appointment.googleParentEventId) {
        const config = await this.getGoogleSyncConfig(tenantId);
        if (config) {
          await this.googleCalendar.updateCalendarEvent(
            tenantId,
            config.parentCalendarId,
            appointment.googleParentEventId,
            attendeeEmail ? { ...payload, attendees: [attendeeEmail] } : payload,
          );
        }
      }

      if (appointment.googleChildEventId && childCalendarId) {
        await this.googleCalendar.updateCalendarEvent(
          tenantId,
          childCalendarId,
          appointment.googleChildEventId,
          payload,
        );
      }
    } catch (error) {
      this.logger.error(`No se pudo actualizar la cita ${appointment.id} en Google Calendar: ${String(error)}`);
    }
  }

  private async syncAppointmentCancelled(
    tenantId: string,
    appointment: Pick<AppointmentDetail, 'id' | 'staffMemberId' | 'googleParentEventId' | 'googleChildEventId'>,
  ): Promise<void> {
    if (!appointment.googleParentEventId && !appointment.googleChildEventId) return;

    try {
      if (appointment.googleParentEventId) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { googleCalendarParentId: true },
        });
        if (tenant?.googleCalendarParentId) {
          await this.googleCalendar.deleteCalendarEvent(
            tenantId,
            tenant.googleCalendarParentId,
            appointment.googleParentEventId,
          );
        }
      }

      if (appointment.googleChildEventId) {
        const { childCalendarId } = await this.resolveChildSyncTarget(appointment.staffMemberId);
        if (childCalendarId) {
          await this.googleCalendar.deleteCalendarEvent(tenantId, childCalendarId, appointment.googleChildEventId);
        }
      }

      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleParentEventId: null, googleChildEventId: null },
      });
    } catch (error) {
      this.logger.error(`No se pudo cancelar la cita ${appointment.id} en Google Calendar: ${String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertPatientBelongsToTenant(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
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

  /** Reconfirma que [startAt, endAt + bufferMinutes) no choca con ninguna
   *  cita activa del mismo profesional — usado tanto al crear como al
   *  reagendar (`excludeAppointmentId` se ignora a sí misma en ese caso). */
  /**
   * Algoritmo anticolisión (spec §2/§4): un mismo recurso — profesional,
   * sala/cabina o equipo — nunca puede tener dos citas cuyos rangos se
   * traslapen. El profesional conserva su chequeo histórico con buffer de
   * limpieza (`endAt + bufferMinutes`); sala y equipo usan el traslape
   * simple pedido explícitamente (`newStart < existingEnd AND
   * newEnd > existingStart`), sin buffer, porque Room/Equipment no tienen
   * un concepto de tiempo de preparación propio todavía.
   */
  private async assertSlotIsFree(
    tenantId: string,
    resources: { staffMemberId: string; roomId?: string | null; equipmentId?: string | null },
    startAt: Date,
    endAt: Date,
    bufferMinutes: number,
    excludeAppointmentId?: string,
  ): Promise<void> {
    if (startAt <= new Date()) {
      throw new BadRequestException('No se pueden reservar citas en el pasado.');
    }

    // 1. Profesional.
    const blockedUntil = addMinutes(endAt, bufferMinutes);
    const staffCandidates = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        staffMemberId: resources.staffMemberId,
        status: { in: BLOCKING_STATUSES },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startAt: { lt: blockedUntil },
      },
      select: { startAt: true, endAt: true, bufferMinutes: true },
    });
    const staffOverlaps = staffCandidates.some(
      (appointment) => addMinutes(appointment.endAt, appointment.bufferMinutes) > startAt,
    );
    if (staffOverlaps) {
      throw new ConflictException('Ese horario ya no está disponible para este profesional.');
    }

    // 2. Sala/Cabina.
    if (resources.roomId) {
      await this.assertResourceIsFree(tenantId, 'room', resources.roomId, startAt, endAt, excludeAppointmentId);
    }

    // 3. Equipo/Aparatología.
    if (resources.equipmentId) {
      await this.assertResourceIsFree(
        tenantId,
        'equipment',
        resources.equipmentId,
        startAt,
        endAt,
        excludeAppointmentId,
      );
    }
  }

  /** Sala y equipo comparten la misma regla — existencia dentro del tenant +
   *  traslape simple de horario — así que este helper cubre ambos, elegido
   *  por `kind` solo para consultar la tabla correcta y redactar el mensaje
   *  con el nombre correcto del recurso ocupado. */
  private async assertResourceIsFree(
    tenantId: string,
    kind: 'room' | 'equipment',
    resourceId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const resource =
      kind === 'room'
        ? await this.prisma.room.findFirst({ where: { id: resourceId, tenantId }, select: { id: true, name: true } })
        : await this.prisma.equipment.findFirst({
            where: { id: resourceId, tenantId },
            select: { id: true, name: true },
          });
    if (!resource) {
      throw new NotFoundException(
        kind === 'room'
          ? 'La sala/cabina no existe o no pertenece a tu centro estético.'
          : 'El equipo no existe o no pertenece a tu centro estético.',
      );
    }

    const overlapping = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        ...(kind === 'room' ? { roomId: resourceId } : { equipmentId: resourceId }),
        status: { in: BLOCKING_STATUSES },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });
    if (overlapping) {
      const range = `entre las ${formatTimeEs(overlapping.startAt)} y las ${formatTimeEs(overlapping.endAt)}`;
      throw new ConflictException(
        kind === 'room'
          ? `La Cabina "${resource.name}" ya se encuentra reservada ${range}.`
          : `El Equipo "${resource.name}" ya se encuentra reservado ${range}.`,
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers de fecha/hora — todo en UTC, mismo criterio que el resto del
// backend (StaffAbsence.startDate/endDate, Patient.birthDate).
// -----------------------------------------------------------------------------

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** "2026-08-30T15:00:00.000Z" -> "3:00 p. m." — usado en los mensajes 409 de
 *  choque de Sala/Equipo (spec: "reservada entre las 10:00 y las 11:00 AM"). */
function formatTimeEs(date: Date): string {
  return date.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

function dateOnlyToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function timeOnDayToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

function ceilToStep(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

/** [window] minus every interval in `busy` -> the free sub-windows that
 *  remain, in chronological order. */
function subtractWindows(window: TimeWindow, busy: TimeWindow[]): TimeWindow[] {
  const clipped = busy
    .map((interval) => ({
      start: interval.start < window.start ? window.start : interval.start,
      end: interval.end > window.end ? window.end : interval.end,
    }))
    .filter((interval) => interval.start < interval.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const free: TimeWindow[] = [];
  let cursor = window.start;
  for (const interval of clipped) {
    if (interval.start > cursor) free.push({ start: cursor, end: interval.start });
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}
