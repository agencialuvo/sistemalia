import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateTenantDto, WorkingHourDto } from './dto/create-tenant.dto';

const DAYS_IN_WEEK = 7;
/**
 * Placeholder range stored for days the centre does not open. The break fields
 * are spelled out as null instead of being omitted so all 7 rows carry the same
 * shape — the agenda engine reads them without distinguishing "closed day" from
 * "column absent".
 */
const CLOSED_DAY_HOURS = {
  openTime: '00:00',
  closeTime: '00:00',
  breakStart: null,
  breakEnd: null,
};

export interface OnboardingResult {
  tenantId: string;
  branchId: string;
  commercialName: string;
  role: TenantRole;
  message: string;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Provisions a centro estético — the "Finalizar y Configurar Mi Centro"
   * action of spec §2, Paso 3.
   *
   * Everything happens inside one Prisma transaction: a half-provisioned
   * account (a Tenant with no Branch, or a Tenant whose owner has no
   * TenantUser row) would strand the user in a state the onboarding gate sends
   * back to /onboarding while the unique RUC row already exists — unrecoverable
   * from the UI. Either all five writes land, or none do.
   */
  async createTenant(userId: string, dto: CreateTenantDto): Promise<OnboardingResult> {
    await this.assertNotAlreadyOnboarded(userId);
    const workingHours = this.buildWeek(dto.branch.workingHours);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Tenant. onboardingCompletedAt is stamped here rather than in a
      //    follow-up update so the row is never visible in a draft state.
      const tenant = await tx.tenant.create({
        data: {
          ownerId: userId,
          identityType: dto.identityType,
          taxIdType: dto.taxIdType,
          taxId: dto.taxId,
          legalName: dto.legalName,
          fiscalAddress: dto.fiscalAddress,
          commercialName: dto.commercialName,
          specialty: dto.specialty,
          logoUrl: dto.logoUrl,
          onboardingCompletedAt: new Date(),
        },
      });

      // 2. Sede principal.
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: dto.branch.name,
          address: dto.branch.address,
          ubigeoCode: dto.branch.ubigeoCode,
          whatsappNumber: dto.branch.whatsappNumber,
          defaultAppointmentMinutes: dto.branch.defaultAppointmentMinutes,
          isMain: true,
        },
      });

      // 3. Los 7 días de la semana.
      await tx.branchWorkingHour.createMany({
        data: workingHours.map((hour) => ({ branchId: branch.id, ...hour })),
      });

      // 4. Membresía del propietario.
      const membership = await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId, role: TenantRole.ADMIN_OWNER },
      });

      return { tenant, branch, membership };
    });

    // 5. Draft cleanup. Deliberately outside the transaction: Redis is not
    //    transactional, and a failed delete must not roll back a provisioned
    //    centre. A stale draft is harmless — the onboarding gate keys off the
    //    Tenant row, not off Redis.
    await this.redis.deleteOnboardingDraft(userId);

    this.logger.log(`Tenant ${result.tenant.id} provisionado por el usuario ${userId}.`);

    return {
      tenantId: result.tenant.id,
      branchId: result.branch.id,
      commercialName: result.tenant.commercialName,
      role: result.membership.role,
      message: 'Tu centro estético fue configurado correctamente.',
    };
  }

  /** Tenants the user belongs to. Feeds the onboarding gate and the tenant switcher. */
  async findMyTenants(userId: string) {
    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId },
      select: {
        role: true,
        tenant: {
          select: {
            id: true,
            commercialName: true,
            legalName: true,
            specialty: true,
            logoUrl: true,
            onboardingCompletedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map(({ role, tenant }) => ({ ...tenant, role }));
  }

  /**
   * One account provisions one centre through the wizard. Re-running it would
   * mint a second Tenant and leave the user with an ambiguous default, so the
   * second attempt is rejected instead (spec §1 — no re-onboarding loops).
   */
  private async assertNotAlreadyOnboarded(userId: string): Promise<void> {
    const existing = await this.prisma.tenantUser.findFirst({
      where: { userId, tenant: { onboardingCompletedAt: { not: null } } },
      select: { tenantId: true },
    });

    if (existing) {
      throw new ConflictException('Ya tienes un centro estético configurado.');
    }
  }

  /**
   * Expands the submitted days into all 7, so the agenda engine and the
   * WhatsApp bot can read a complete week without null-checking each day
   * (spec §4, criterion 2). Days the user did not send are stored as closed.
   */
  private buildWeek(submitted: WorkingHourDto[]): Prisma.BranchWorkingHourCreateManyBranchInput[] {
    const byDay = new Map<number, WorkingHourDto>();

    for (const hour of submitted) {
      if (byDay.has(hour.dayOfWeek)) {
        throw new BadRequestException(`El día ${hour.dayOfWeek} está duplicado en los horarios.`);
      }
      this.assertValidRange(hour);
      byDay.set(hour.dayOfWeek, hour);
    }

    return Array.from({ length: DAYS_IN_WEEK }, (_, dayOfWeek) => {
      const hour = byDay.get(dayOfWeek);
      if (!hour || !hour.isOpen) {
        return { dayOfWeek, isOpen: false, ...CLOSED_DAY_HOURS };
      }
      return {
        dayOfWeek,
        isOpen: true,
        openTime: hour.openTime,
        closeTime: hour.closeTime,
        breakStart: hour.breakStart ?? null,
        breakEnd: hour.breakEnd ?? null,
      };
    });
  }

  /**
   * The DTO checks each time is a well-formed "HH:mm"; the ordering between
   * them can only be checked once they are seen together. An inverted range
   * would produce a day with no bookable slots at all.
   */
  private assertValidRange(hour: WorkingHourDto): void {
    if (!hour.isOpen) {
      return;
    }

    const dayLabel = `día ${hour.dayOfWeek}`;

    if (hour.openTime >= hour.closeTime) {
      throw new BadRequestException(
        `En el ${dayLabel}, la hora de cierre debe ser posterior a la de apertura.`,
      );
    }

    const hasBreakStart = Boolean(hour.breakStart);
    const hasBreakEnd = Boolean(hour.breakEnd);

    if (hasBreakStart !== hasBreakEnd) {
      throw new BadRequestException(
        `En el ${dayLabel}, la pausa requiere hora de inicio y de fin.`,
      );
    }

    if (hour.breakStart && hour.breakEnd) {
      if (hour.breakStart >= hour.breakEnd) {
        throw new BadRequestException(
          `En el ${dayLabel}, el fin de la pausa debe ser posterior a su inicio.`,
        );
      }
      if (hour.breakStart < hour.openTime || hour.breakEnd > hour.closeTime) {
        throw new BadRequestException(
          `En el ${dayLabel}, la pausa debe estar dentro del horario de atención.`,
        );
      }
    }
  }
}
