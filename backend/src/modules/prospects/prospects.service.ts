import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AcquisitionChannel, Prisma, Prospect, ProspectStatus, SocialChannelProvider } from '@prisma/client';
import { CreatePatientDto } from '../patients/dto/create-patient.dto';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryProspectsDto } from './dto/query-prospects.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';

const DEFAULT_PAGE_SIZE = 12;

/** `Prospect.sourceProvider` -> `Patient.acquisitionChannel` (Task 2.4,
 *  convertToPatient) — no hay un valor WhatsApp propio en AcquisitionChannel
 *  (spec plan §1 nunca lo agregó), así que WHATSAPP_OFFICIAL cae en OTHER en
 *  vez de fallar la conversión por un detalle cosmético de reporting. */
const ACQUISITION_CHANNEL_BY_PROVIDER: Record<SocialChannelProvider, AcquisitionChannel> = {
  META_FACEBOOK: 'FACEBOOK',
  META_INSTAGRAM: 'INSTAGRAM',
  TIKTOK: 'TIKTOK',
  WHATSAPP_OFFICIAL: 'OTHER',
};

/** Mismo criterio que CreatePatientDto's normalizePhone — Perú-only,
 *  duplicado a propósito en vez de compartido (ver el comentario de esa
 *  función). */
const DEFAULT_PHONE_COUNTRY_CODE = '+51';
function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${DEFAULT_PHONE_COUNTRY_CODE}${digits}` : '';
}

/** "Juan Carlos Pérez López" -> {firstName: "Juan", lastName: "Carlos Pérez
 *  López"}. Patient.lastName es obligatorio y no vacío — un `fullName` de una
 *  sola palabra (formularios de Meta a veces solo piden "Nombre") repite esa
 *  palabra en ambos campos en vez de guardar un lastName vacío o inventado. */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  const [firstName, ...rest] = tokens;
  return { firstName: firstName ?? fullName, lastName: rest.join(' ') || (firstName ?? fullName) };
}

export interface UpsertLeadInput {
  channelId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  sourceProvider: SocialChannelProvider;
  campaignName?: string | null;
  adName?: string | null;
  formAnswers?: Record<string, unknown> | null;
}

/**
 * Módulo 11 — Prospectos (Ingesta de Lead Ads y CRM), Fase 2.
 *
 * Aislamiento estricto por tenantId en cada método, mismo criterio que
 * PatientsService/StaffMembersService: todo `findFirst`/`update` filtra por
 * `{ id, tenantId }`, nunca solo por `id`.
 */
@Injectable()
export class ProspectsService {
  private readonly logger = new Logger(ProspectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /** GET /marketing/prospects. */
  async findAll(tenantId: string, query: QueryProspectsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.ProspectWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceProvider ? { sourceProvider: query.sourceProvider } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        include: PROSPECT_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.prospect.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** GET /marketing/prospects/:id — incluye el canal de origen y las
   *  respuestas del formulario para el drawer de detalle (Fase 3). */
  async findOne(tenantId: string, id: string) {
    const prospect = await this.prisma.prospect.findFirst({
      where: { id, tenantId },
      include: PROSPECT_DETAIL_INCLUDE,
    });
    if (!prospect) {
      throw new NotFoundException('El prospecto no existe o no pertenece a tu centro estético.');
    }
    return prospect;
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  /** PATCH /marketing/prospects/:id. */
  async update(tenantId: string, id: string, dto: UpdateProspectDto): Promise<Prospect> {
    await this.assertBelongsToTenant(tenantId, id);

    return this.prisma.prospect.update({
      where: { id },
      data: {
        status: dto.status,
        assignedUserId: dto.assignedUserId === undefined ? undefined : dto.assignedUserId,
        fullName: dto.fullName,
        phone: dto.phone === undefined ? undefined : normalizePhone(dto.phone),
        email: dto.email,
      },
    });
  }

  /**
   * POST /marketing/prospects/:id/convert (spec RF-3). Crea el Patient vía
   * PatientsService.create() en vez de un `prisma.patient.create` propio —
   * así hereda gratis toda su lógica de negocio (unique de documentNumber,
   * status ACTIVE, etc.) sin duplicarla acá.
   *
   * NO es una única transacción de base de datos: `PatientsService.create`
   * usa su propia conexión de Prisma, así que envolver esto en
   * `$transaction` no lo haría atómico de verdad (solo el `update` de abajo
   * correría dentro de la transacción, no la creación del Patient). Si el
   * Patient se crea pero el `update` del Prospect falla después, queda un
   * Patient válido y huérfano de trazabilidad — se loguea como error para
   * que alguien lo enlace a mano; el Patient en sí nunca queda a medio
   * escribir, que es la garantía que realmente importa acá.
   */
  async convertToPatient(tenantId: string, id: string): Promise<Prospect> {
    const prospect = await this.prisma.prospect.findFirst({ where: { id, tenantId } });
    if (!prospect) {
      throw new NotFoundException('El prospecto no existe o no pertenece a tu centro estético.');
    }
    if (prospect.patientId) {
      throw new BadRequestException('Este prospecto ya fue convertido en paciente.');
    }

    const { firstName, lastName } = splitFullName(prospect.fullName);
    const createPatientDto: CreatePatientDto = {
      firstName,
      lastName,
      phone: normalizePhone(prospect.phone),
      email: prospect.email ?? undefined,
      acquisitionChannel: ACQUISITION_CHANNEL_BY_PROVIDER[prospect.sourceProvider],
    };

    const patient = await this.patients.create(tenantId, createPatientDto);
    try {
      const updated = await this.prisma.prospect.update({
        where: { id },
        data: { patientId: patient.id, status: 'CONVERTIDO' },
      });
      this.logger.log(`Prospecto ${id} convertido en paciente ${patient.id} (tenant ${tenantId}).`);
      return updated;
    } catch (error) {
      this.logger.error(
        `Paciente ${patient.id} creado desde el prospecto ${id}, pero no se pudo enlazar de vuelta.`,
        error as Error,
      );
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Ingesta (consumida por MetaLeadProcessorService)
  // -------------------------------------------------------------------------

  /**
   * Busca-y-actualiza (o crea) por `[tenantId, phone]` — spec RF-1: "Prevenir
   * prospectos duplicados actualizando el registro existente si coincide el
   * número telefónico dentro del mismo Tenant". Un mismo teléfono que vuelve
   * a llenar el formulario (ej. una segunda campaña) refresca los datos de
   * campaña/formulario más recientes sin crear una fila nueva, PERO no pisa
   * `status`/`assignedUserId`: si recepción ya lo marcó CONTACTADO, un lead
   * repetido no debe resetearlo a NUEVO por debajo.
   */
  async upsertFromLead(tenantId: string, input: UpsertLeadInput): Promise<Prospect> {
    const phone = normalizePhone(input.phone);
    const existing = await this.prisma.prospect.findFirst({ where: { tenantId, phone } });

    const sharedData = {
      fullName: input.fullName,
      email: input.email ?? undefined,
      channelId: input.channelId,
      sourceProvider: input.sourceProvider,
      campaignName: input.campaignName ?? undefined,
      adName: input.adName ?? undefined,
      formAnswers: (input.formAnswers as Prisma.InputJsonValue | null | undefined) ?? undefined,
    };

    if (existing) {
      return this.prisma.prospect.update({ where: { id: existing.id }, data: sharedData });
    }

    return this.prisma.prospect.create({
      data: { tenantId, phone, status: ProspectStatus.NUEVO, ...sharedData },
    });
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertBelongsToTenant(tenantId: string, id: string): Promise<void> {
    const prospect = await this.prisma.prospect.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!prospect) {
      throw new NotFoundException('El prospecto no existe o no pertenece a tu centro estético.');
    }
  }
}

const PROSPECT_LIST_INCLUDE = {
  channel: { select: { id: true, provider: true, name: true } },
  assignedUser: { select: { id: true, fullName: true } },
} satisfies Prisma.ProspectInclude;

const PROSPECT_DETAIL_INCLUDE = PROSPECT_LIST_INCLUDE;
