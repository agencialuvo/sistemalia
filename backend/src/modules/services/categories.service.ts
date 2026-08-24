import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** Prisma error codes we translate into HTTP semantics. */
const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

export interface CategoryDeletionResult {
  id: string;
  deleted: boolean;
  message: string;
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categories of ONE centro estético (Task 2.1).
   *
   * Every method in this class takes `tenantId` as its first argument, always
   * sourced from @TenantId() and never from the request body. That is the
   * whole isolation model: there is no code path here that can read or write a
   * row without a tenant filter.
   */
  async findAll(tenantId: string, isActive?: boolean) {
    return this.prisma.serviceCategory.findMany({
      where: { tenantId, ...(isActive === undefined ? {} : { isActive }) },
      orderBy: { name: 'asc' },
      // Lets the UI warn before deactivating a category that is in use, and
      // costs one extra subquery instead of an N+1 from the client.
      include: { _count: { select: { services: true } } },
    });
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    try {
      return await this.prisma.serviceCategory.create({
        data: {
          tenantId,
          name: dto.name,
          description: dto.description,
          color: dto.color,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      // Racing two creates of the same name is a 409, not a 500. The unique
      // index is what the Excel import relies on to link categories by name.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    try {
      // `where: { id, tenantId }` — Prisma's extended unique filter. One
      // statement that is both the lookup and the tenant check, so there is no
      // window between "found it" and "updated it" in which the row could
      // change hands, and a foreign id simply matches nothing.
      return await this.prisma.serviceCategory.update({
        where: { id, tenantId },
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${dto.name}".`);
      }
      throw this.translateNotFound(error, id);
    }
  }

  /** Nombre fijo de la categoría de respaldo (spec ampliación §4): todo
   *  servicio sin categoría, o cuya categoría se eliminó, debe caer aquí en
   *  vez de quedar con un categoryId huérfano — la columna es NOT NULL. Es
   *  un cajón permanente del sistema, nunca uno que el usuario administra: no
   *  se puede borrar ni vacía, para que siempre haya un destino de reasignación. */
  private readonly DEFAULT_CATEGORY_NAME = 'Sin categoría';

  /** Busca "Sin categoría" para este tenant y la crea si todavía no existe.
   *  Aceptar un `tx` permite llamarla dentro de la misma transacción que
   *  reasigna los servicios en remove(), para que ninguna quede a medias. */
  private async ensureDefaultCategory(
    tenantId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const existing = await tx.serviceCategory.findFirst({
      where: { tenantId, name: this.DEFAULT_CATEGORY_NAME },
    });
    if (existing) return existing;
    return tx.serviceCategory.create({
      data: { tenantId, name: this.DEFAULT_CATEGORY_NAME, color: '#64748B', isActive: true },
    });
  }

  /**
   * DELETE /services/categories/:id.
   *
   * A category with services attached is not left as a dead reference nor
   * merely deactivated: its services are reassigned to "Sin categoría"
   * (created on demand) and the category itself is deleted for real, because
   * categoryId is NOT NULL and the appointment history reads the service, not
   * the category name, for its record. An empty category is deleted the same
   * way it always was.
   *
   * "Sin categoría" itself can never be deleted, empty or not — it is the
   * fallback every reassignment relies on, so there is always somewhere to
   * land. Checked BEFORE the empty-category fast path below, which would
   * otherwise happily delete it the moment its last service moved elsewhere.
   */
  async remove(tenantId: string, id: string): Promise<CategoryDeletionResult> {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { services: true } } },
    });

    if (!category) {
      throw new NotFoundException('La categoría no existe o no pertenece a tu centro estético.');
    }

    if (category.name === this.DEFAULT_CATEGORY_NAME) {
      throw new ConflictException(`No puedes eliminar la categoría "${this.DEFAULT_CATEGORY_NAME}".`);
    }

    if (category._count.services === 0) {
      await this.prisma.serviceCategory.delete({ where: { id, tenantId } });
      return { id, deleted: true, message: 'Categoría eliminada.' };
    }

    const serviceCount = category._count.services;
    await this.prisma.$transaction(async (tx) => {
      const fallback = await this.ensureDefaultCategory(tenantId, tx);
      await tx.service.updateMany({
        where: { tenantId, categoryId: id },
        data: { categoryId: fallback.id },
      });
      await tx.serviceCategory.delete({ where: { id, tenantId } });
    });

    this.logger.log(
      `Categoría ${id} eliminada; ${serviceCount} servicio(s) reasignado(s) a "${this.DEFAULT_CATEGORY_NAME}".`,
    );
    return {
      id,
      deleted: true,
      message: `Categoría eliminada. ${serviceCount} servicio(s) se reasignaron a "${this.DEFAULT_CATEGORY_NAME}".`,
    };
  }

  /**
   * Resolves category names to ids for the Excel import, creating the ones
   * that do not exist yet (spec §2.3).
   *
   * Matching is case-insensitive so "Facial", "facial" and "FACIAL" in the
   * same spreadsheet land on one category instead of three. `skipDuplicates`
   * covers the case where two imports run at once.
   */
  async resolveByName(
    tenantId: string,
    names: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, string>> {
    const existing = await tx.serviceCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    const byLowerName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
    const missing = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter(
      (name) => !byLowerName.has(name.toLowerCase()),
    );

    if (missing.length > 0) {
      await tx.serviceCategory.createMany({
        data: missing.map((name) => ({ tenantId, name })),
        skipDuplicates: true,
      });
      const created = await tx.serviceCategory.findMany({
        where: { tenantId, name: { in: missing } },
        select: { id: true, name: true },
      });
      for (const category of created) {
        byLowerName.set(category.name.toLowerCase(), category.id);
      }
      this.logger.log(`Importación: ${created.length} categoría(s) creada(s) automáticamente.`);
    }

    return byLowerName;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
    );
  }

  private translateNotFound(error: unknown, id: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
      return new NotFoundException('La categoría no existe o no pertenece a tu centro estético.');
    }
    this.logger.error(`Error al actualizar la categoría ${id}`, error as Error);
    return error;
  }
}
