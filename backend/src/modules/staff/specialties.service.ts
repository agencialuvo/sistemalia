import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

export interface SpecialtyDeletionResult {
  id: string;
  deleted: boolean;
  message: string;
}

/**
 * CRUD de `Specialty`, aislado por tenant (Task 2.1).
 *
 * Mirrors CategoriesService: every method takes `tenantId` first, always
 * sourced from @TenantId(), and the delete endpoint deactivates instead of
 * removing when the specialty is still referenced — here, by StaffMember
 * rows, so a doctor's profile never loses its `specialty` relation out from
 * under it.
 */
@Injectable()
export class SpecialtiesService {
  private readonly logger = new Logger(SpecialtiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Especialidad de sistema que representa "ningún profesional asignado
   *  todavía"/"sin especialidad definida" (spec ampliación): seleccionable
   *  como cualquier otra, pero protegida contra borrado en remove() para que
   *  siempre haya una opción neutra en el selector. A diferencia de
   *  DEFAULT_CATEGORY_NAME (Servicios) no existe una FK NOT NULL que la
   *  obligue a existir — `specialtyId` es nullable — así que se garantiza
   *  aquí, en cada listado, en vez de crearse bajo demanda solo cuando algo
   *  la necesita. */
  private readonly DEFAULT_SPECIALTY_NAME = 'Sin especialidad';

  private async ensureDefaultSpecialty(tenantId: string) {
    const existing = await this.prisma.specialty.findFirst({
      where: { tenantId, name: this.DEFAULT_SPECIALTY_NAME },
    });
    if (existing) return existing;
    return this.prisma.specialty.create({
      data: { tenantId, name: this.DEFAULT_SPECIALTY_NAME, isActive: true },
    });
  }

  async findAll(tenantId: string, isActive?: boolean) {
    await this.ensureDefaultSpecialty(tenantId);
    return this.prisma.specialty.findMany({
      where: { tenantId, ...(isActive === undefined ? {} : { isActive }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { staffMembers: true } } },
    });
  }

  async create(tenantId: string, dto: CreateSpecialtyDto) {
    try {
      return await this.prisma.specialty.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una especialidad llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateSpecialtyDto) {
    try {
      return await this.prisma.specialty.update({
        where: { id, tenantId },
        data: {
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una especialidad llamada "${dto.name}".`);
      }
      throw this.translateNotFound(error, id);
    }
  }

  /**
   * DELETE /staff/specialties/:id — igual criterio que CategoriesService.remove:
   * con profesionales vinculados se desactiva, vacía se elimina de verdad.
   */
  async remove(tenantId: string, id: string): Promise<SpecialtyDeletionResult> {
    const specialty = await this.prisma.specialty.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { staffMembers: true } } },
    });

    if (!specialty) {
      throw new NotFoundException('La especialidad no existe o no pertenece a tu centro estético.');
    }

    if (specialty.name === this.DEFAULT_SPECIALTY_NAME) {
      throw new ConflictException(`No puedes eliminar la especialidad "${this.DEFAULT_SPECIALTY_NAME}".`);
    }

    if (specialty._count.staffMembers > 0) {
      await this.prisma.specialty.update({ where: { id, tenantId }, data: { isActive: false } });
      this.logger.log(
        `Especialidad ${id} desactivada (tiene ${specialty._count.staffMembers} profesional(es)).`,
      );
      return {
        id,
        deleted: false,
        message: `La especialidad se desactivó porque tiene ${specialty._count.staffMembers} profesional(es) asociado(s).`,
      };
    }

    await this.prisma.specialty.delete({ where: { id, tenantId } });
    return { id, deleted: true, message: 'Especialidad eliminada.' };
  }

  /**
   * Bulk-import helper — mirrors CategoriesService.resolveByName exactly.
   * Returns every especialidad (lowercased name -> id), creating whichever of
   * `names` does not exist yet. Called inside the same transaction as the
   * rows it names, so a failure halfway through the import leaves neither an
   * orphan especialidad nor half the batch of profesionales written.
   */
  async resolveByName(
    tenantId: string,
    names: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, string>> {
    const existing = await tx.specialty.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    const byLowerName = new Map(existing.map((s) => [s.name.toLowerCase(), s.id]));
    const missing = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter(
      (name) => !byLowerName.has(name.toLowerCase()),
    );

    if (missing.length > 0) {
      await tx.specialty.createMany({
        data: missing.map((name) => ({ tenantId, name })),
        skipDuplicates: true,
      });
      const created = await tx.specialty.findMany({
        where: { tenantId, name: { in: missing } },
        select: { id: true, name: true },
      });
      for (const specialty of created) {
        byLowerName.set(specialty.name.toLowerCase(), specialty.id);
      }
      this.logger.log(`Importación: ${created.length} especialidad(es) creada(s) automáticamente.`);
    }

    return byLowerName;
  }

  /** Same isolation check ServicesService runs for categoryId — a specialtyId
   *  is just a UUID until it is proven to belong to this tenant. */
  async assertBelongsToTenant(tenantId: string, specialtyId: string): Promise<void> {
    const specialty = await this.prisma.specialty.findFirst({
      where: { id: specialtyId, tenantId },
      select: { id: true },
    });
    if (!specialty) {
      throw new UnprocessableEntityException(
        'La especialidad seleccionada no existe en tu centro estético.',
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
    );
  }

  private translateNotFound(error: unknown, id: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
      return new NotFoundException('La especialidad no existe o no pertenece a tu centro estético.');
    }
    this.logger.error(`Error al actualizar la especialidad ${id}`, error as Error);
    return error;
  }
}
