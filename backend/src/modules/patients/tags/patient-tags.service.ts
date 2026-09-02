import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePatientTagDto } from './dto/create-patient-tag.dto';
import { UpdatePatientTagDto } from './dto/update-patient-tag.dto';

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

/** Entrada virtual que representa a los pacientes sin ninguna etiqueta — no
 *  es una fila de PatientTag, se calcula al vuelo (spec: "Sin categoría / Sin
 *  etiqueta" del sistema, no eliminable). */
const SYSTEM_TAG_NAME = 'Sin etiqueta';
const SYSTEM_TAG_COLOR = '#64748B';

/** Same palette + hash as the frontend's `tagColor()`
 *  (src/lib/validators/patient.ts) — kept in sync on purpose: that function
 *  is what a tag looked like BEFORE it had a catalogue row (an orphan name
 *  in Patient.tags falls back to this same deterministic color). Giving a
 *  freshly materialized row (ensureCatalogCoversPatientTags) that exact
 *  color means it never visibly "jumps" the moment it gets a real id. */
const TAG_COLOR_PALETTE = [
  '#E11D48',
  '#F97316',
  '#F59E0B',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#7C3AED',
  '#EC4899',
] as const;

function hashColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}

export interface PatientTagView {
  id: string | null;
  name: string;
  color: string;
  isSystem: boolean;
  patientCount: number;
}

/**
 * Catálogo administrable de etiquetas de pacientes.
 *
 * Patient.tags sigue siendo un String[] (spec §2 de Módulo 05 lo describe como
 * texto libre) — este catálogo solo añade nombre/color canónicos y un
 * contador, calcado de CategoriesService. Renombrar o borrar una etiqueta
 * sincroniza los arrays `tags` de todos los pacientes del tenant vía SQL
 * (array_replace/array_remove) en la misma transacción que toca la fila del
 * catálogo, para que ninguna de las dos quede a medias.
 */
@Injectable()
export class PatientTagsService {
  private readonly logger = new Logger(PatientTagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<PatientTagView[]> {
    await this.ensureCatalogCoversPatientTags(tenantId);

    const [tags, untaggedCount] = await Promise.all([
      this.prisma.patientTag.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      this.prisma.patient.count({ where: { tenantId, tags: { isEmpty: true } } }),
    ]);

    const counts = await Promise.all(
      tags.map((tag) =>
        this.prisma.patient.count({ where: { tenantId, tags: { has: tag.name } } }),
      ),
    );

    const system: PatientTagView = {
      id: null,
      name: SYSTEM_TAG_NAME,
      color: SYSTEM_TAG_COLOR,
      isSystem: true,
      patientCount: untaggedCount,
    };

    return [
      system,
      ...tags.map((tag, index) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        isSystem: false,
        patientCount: counts[index],
      })),
    ];
  }

  /**
   * `Patient.tags` es texto libre — el formulario de paciente (y la
   * importación Excel) dejan escribir cualquier nombre sin pasar por
   * `create()`, así que un paciente puede terminar con una etiqueta que no
   * tiene fila en el catálogo. Sin esto, ese nombre queda invisible en el
   * gestor aunque ya esté asignado — se materializa aquí como una fila real
   * (con el mismo color hash-determinístico que ya mostraba como fallback en
   * el frontend, editable después) antes de armar la lista, mismo espíritu
   * que ensureDefaultSpecialty en SpecialtiesService.
   */
  private async ensureCatalogCoversPatientTags(tenantId: string): Promise<void> {
    const [usedNames, existing] = await Promise.all([
      this.prisma.$queryRaw<{ name: string }[]>(
        Prisma.sql`SELECT DISTINCT unnest("tags") AS name FROM "Patient" WHERE "tenantId" = ${tenantId}`,
      ),
      this.prisma.patientTag.findMany({ where: { tenantId }, select: { name: true } }),
    ]);

    const existingLower = new Set(existing.map((tag) => tag.name.toLowerCase()));
    const missing = [...new Set(usedNames.map((row) => row.name))].filter(
      (name) => name.toLowerCase() !== SYSTEM_TAG_NAME.toLowerCase() && !existingLower.has(name.toLowerCase()),
    );

    if (missing.length === 0) return;

    await this.prisma.patientTag.createMany({
      data: missing.map((name) => ({ tenantId, name, color: hashColor(name) })),
      skipDuplicates: true,
    });
    this.logger.log(
      `Catálogo de etiquetas: ${missing.length} etiqueta(s) materializada(s) desde Patient.tags para el centro ${tenantId}.`,
    );
  }

  async create(tenantId: string, dto: CreatePatientTagDto) {
    this.assertNotSystemName(dto.name);
    try {
      return await this.prisma.patientTag.create({
        data: { tenantId, name: dto.name, color: dto.color },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una etiqueta llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePatientTagDto) {
    const current = await this.prisma.patientTag.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La etiqueta no existe o no pertenece a tu centro estético.');
    }
    if (dto.name !== undefined) {
      this.assertNotSystemName(dto.name);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.patientTag.update({
          where: { id, tenantId },
          data: { name: dto.name, color: dto.color },
        });

        if (dto.name !== undefined && dto.name !== current.name) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE "Patient" SET "tags" = array_replace("tags", ${current.name}, ${dto.name}) WHERE "tenantId" = ${tenantId} AND ${current.name} = ANY("tags")`,
          );
        }

        return updated;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Ya existe una etiqueta llamada "${dto.name}".`);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === RECORD_NOT_FOUND) {
        throw new NotFoundException('La etiqueta no existe o no pertenece a tu centro estético.');
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const tag = await this.prisma.patientTag.findFirst({ where: { id, tenantId } });
    if (!tag) {
      throw new NotFoundException('La etiqueta no existe o no pertenece a tu centro estético.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`UPDATE "Patient" SET "tags" = array_remove("tags", ${tag.name}) WHERE "tenantId" = ${tenantId} AND ${tag.name} = ANY("tags")`,
      );
      await tx.patientTag.delete({ where: { id, tenantId } });
    });

    this.logger.log(`Etiqueta ${id} ("${tag.name}") eliminada del centro ${tenantId}.`);
    return { id, deleted: true };
  }

  /** "Sin etiqueta" es virtual (nunca una fila real) — bloquea crear/renombrar
   *  una etiqueta a ese nombre para que no colisione visualmente con la
   *  entrada del sistema en la lista. */
  private assertNotSystemName(name: string): void {
    if (name.trim().toLowerCase() === SYSTEM_TAG_NAME.toLowerCase()) {
      throw new ConflictException(`"${SYSTEM_TAG_NAME}" es una etiqueta del sistema y no se puede usar como nombre.`);
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
    );
  }
}
