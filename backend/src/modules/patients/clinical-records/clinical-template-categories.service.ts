import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClinicalTemplateCategoryDto } from './dto/create-clinical-template-category.dto';
import { UpdateClinicalTemplateCategoryDto } from './dto/update-clinical-template-category.dto';

const UNIQUE_VIOLATION = 'P2002';

/** The 7 categories the product used to ship as a closed enum
 *  (CLINICAL_TEMPLATE_CATEGORIES in src/lib/validators/clinical-template.ts)
 *  — same names/colors, now real per-tenant rows so a tenant can add its
 *  own alongside them. "General / Otro" doubles as the reassignment
 *  fallback when a custom category with templates attached is deleted. */
const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Inyectables', color: '#7C3AED' },
  { name: 'Aparatología', color: '#06B6D4' },
  { name: 'Corporal', color: '#F59E0B' },
  { name: 'Cosmiatría', color: '#EC4899' },
  { name: 'General / Otro', color: '#64748B' },
  { name: 'Capilar / Tricología', color: '#10B981' },
  { name: 'Consulta / Evaluación', color: '#3B82F6' },
];

export const FALLBACK_CATEGORY_NAME = 'General / Otro';
/** Used only when ensureExists() has to auto-create a category the Form
 *  Builder saved that has no catalogue row yet (e.g. an import) — same
 *  neutral tone as CategoriesService's "Sin categoría". Editable afterwards
 *  from "Gestionar Categorías" like any custom category. */
const FALLBACK_COLOR = '#64748B';

export interface CategoryDeletionResult {
  id: string;
  deleted: boolean;
  message: string;
}

/**
 * Catálogo administrable de categorías de Plantillas Clínicas (enriquecimiento
 * de Fase 4 — antes un enum cerrado de 7 valores).
 *
 * `ClinicalFormTemplate.fieldsSchema.category` (JSON) guarda el NOMBRE de la
 * categoría, no un id — no hay FK. Igual que PatientTagsService con
 * Patient.tags, este servicio es el catálogo de esos nombres; reasignar o
 * borrar una categoría reescribe el JSON de cada plantilla que la usa.
 */
@Injectable()
export class ClinicalTemplateCategoriesService {
  private readonly logger = new Logger(ClinicalTemplateCategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefaultCategories(tenantId: string): Promise<void> {
    const existing = await this.prisma.clinicalTemplateCategory.findMany({
      where: { tenantId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((category) => category.name));
    const missing = DEFAULT_CATEGORIES.filter((category) => !existingNames.has(category.name));
    if (missing.length === 0) return;

    await this.prisma.clinicalTemplateCategory.createMany({
      data: missing.map((category) => ({ tenantId, ...category, isSystem: true })),
      skipDuplicates: true,
    });
    this.logger.log(`${missing.length} categoría(s) de plantilla clínica por defecto creada(s) para ${tenantId}.`);
  }

  /** GET /clinical-templates/categories. `_count` is how many active
   *  ClinicalFormTemplate rows currently use each category's name — a
   *  Prisma JSON-path count, one query per row (the catalogue is always
   *  small: 7+ rows per tenant, never a hot path). */
  async findAll(tenantId: string) {
    await this.ensureDefaultCategories(tenantId);
    const categories = await this.prisma.clinicalTemplateCategory.findMany({
      where: { tenantId },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    const counts = await Promise.all(
      categories.map((category) =>
        this.prisma.clinicalFormTemplate.count({
          where: { tenantId, fieldsSchema: { path: ['category'], equals: category.name } },
        }),
      ),
    );

    return categories.map((category, index) => ({ ...category, templateCount: counts[index] }));
  }

  async create(tenantId: string, dto: CreateClinicalTemplateCategoryDto) {
    try {
      return await this.prisma.clinicalTemplateCategory.create({
        data: { tenantId, name: dto.name, color: dto.color, isSystem: false },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateClinicalTemplateCategoryDto) {
    const current = await this.prisma.clinicalTemplateCategory.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La categoría no existe o no pertenece a tu centro estético.');
    }
    if (current.isSystem && dto.name !== undefined && dto.name !== current.name) {
      throw new ConflictException('Las categorías del sistema no se pueden renombrar, solo recolorear.');
    }

    try {
      if (dto.name !== undefined && dto.name !== current.name) {
        // Rename propagates to every template that named the OLD value, in
        // the same transaction as the catalogue row — otherwise a template
        // would keep pointing at a category name nothing lists anymore.
        return await this.prisma.$transaction(async (tx) => {
          const updated = await tx.clinicalTemplateCategory.update({
            where: { id, tenantId },
            data: { name: dto.name, color: dto.color },
          });
          await this.renameInTemplates(tx, tenantId, current.name, dto.name as string);
          return updated;
        });
      }

      return await this.prisma.clinicalTemplateCategory.update({
        where: { id, tenantId },
        data: { color: dto.color },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una categoría llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  /**
   * DELETE /clinical-templates/categories/:id.
   *
   * A system category can never be deleted — it is what "preserva las 7
   * categorías predeterminadas" means. A custom category with templates
   * still using it is not left as a dangling reference: those templates are
   * reassigned to "General / Otro" (guaranteed to exist by
   * ensureDefaultCategories) before the row itself is removed, same
   * reassign-then-delete shape as CategoriesService.remove for services.
   */
  async remove(tenantId: string, id: string): Promise<CategoryDeletionResult> {
    const category = await this.prisma.clinicalTemplateCategory.findFirst({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException('La categoría no existe o no pertenece a tu centro estético.');
    }
    if (category.isSystem) {
      throw new ConflictException(`No puedes eliminar la categoría del sistema "${category.name}".`);
    }

    const affected = await this.prisma.clinicalFormTemplate.findMany({
      where: { tenantId, fieldsSchema: { path: ['category'], equals: category.name } },
      select: { id: true },
    });

    if (affected.length === 0) {
      await this.prisma.clinicalTemplateCategory.delete({ where: { id, tenantId } });
      return { id, deleted: true, message: 'Categoría eliminada.' };
    }

    await this.ensureDefaultCategories(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await this.renameInTemplates(tx, tenantId, category.name, FALLBACK_CATEGORY_NAME);
      await tx.clinicalTemplateCategory.delete({ where: { id, tenantId } });
    });

    this.logger.log(
      `Categoría de plantilla clínica ${id} eliminada; ${affected.length} plantilla(s) reasignada(s) a "${FALLBACK_CATEGORY_NAME}".`,
    );
    return {
      id,
      deleted: true,
      message: `Categoría eliminada. ${affected.length} plantilla(s) se reasignaron a "${FALLBACK_CATEGORY_NAME}".`,
    };
  }

  /**
   * Resolves category names to catalogue rows, creating whichever of `names`
   * does not exist yet — mirrors CategoriesService.resolveByName /
   * SpecialtiesService.resolveByName, called by ClinicalRecordsService before
   * writing a template's `fieldsSchema.category` so a name typed in the Form
   * Builder that isn't in the catalogue yet becomes a real row instead of an
   * orphan string.
   */
  async ensureExists(
    tenantId: string,
    name: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const existing = await tx.clinicalTemplateCategory.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return;
    await tx.clinicalTemplateCategory.create({ data: { tenantId, name, color: FALLBACK_COLOR, isSystem: false } });
  }

  /** Every ClinicalFormTemplate whose fieldsSchema.category equals `from`
   *  gets it rewritten to `to` — fieldsSchema is a JSON blob, not a foreign
   *  key, so this is a read-patch-write loop rather than a bulk updateMany.
   *  The catalogue never holds more than a handful of templates per
   *  category, so the loop stays cheap. */
  private async renameInTemplates(
    tx: Prisma.TransactionClient,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const templates = await tx.clinicalFormTemplate.findMany({
      where: { tenantId, fieldsSchema: { path: ['category'], equals: from } },
      select: { id: true, fieldsSchema: true },
    });
    for (const template of templates) {
      const schema = template.fieldsSchema as Prisma.JsonObject;
      await tx.clinicalFormTemplate.update({
        where: { id: template.id },
        data: { fieldsSchema: { ...schema, category: to } },
      });
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
  }
}
