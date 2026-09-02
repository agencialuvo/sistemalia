import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { CreateGalleryImageDto } from './dto/create-gallery-image.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpsertMedicalHistoryDto } from './dto/upsert-medical-history.dto';
import { PatientsExcelImportService, PatientParseResult } from './patients-excel-import.service';

const RECORD_NOT_FOUND = 'P2025';
const UNIQUE_VIOLATION = 'P2002';

/** Same default the rest of the app's list pages start on (ServicesService,
 *  StaffMembersService). */
const DEFAULT_PATIENT_PAGE_SIZE = 12;

/** Ficha 360°: todo lo que GET /patients/:id devuelve además de los datos
 *  personales — antecedentes, notas, galería y consentimientos (spec.md §1,
 *  "expediente 360°"). Un solo lugar para que la lista y el detalle no
 *  puedan divergir en qué trae cada uno. */
const DETAIL_INCLUDE = {
  medicalHistory: true,
  clinicalNotes: { orderBy: { createdAt: Prisma.SortOrder.desc } },
  galleryImages: { orderBy: { takenAt: Prisma.SortOrder.desc } },
  consents: { orderBy: { createdAt: Prisma.SortOrder.desc } },
} satisfies Prisma.PatientInclude;

const LIST_INCLUDE = {
  _count: { select: { clinicalNotes: true, galleryImages: true } },
} satisfies Prisma.PatientInclude;

/** POST /patients/export-template, /patients/import-preview and
 *  /patients/bulk-import's response shape — mirrors Módulo 03/04's
 *  ImportResult/StaffImportResult. */
export interface PatientImportResult extends PatientParseResult {
  /** Rows actually written. 0 on a preview, even when every row is valid. */
  imported: number;
  dryRun: boolean;
}

/**
 * Módulo 05 — Gestión de Pacientes (Fase 1: Backend Core).
 *
 * Aislamiento estricto por tenantId en cada método: todo `findFirst`/`update`/
 * `delete` filtra por `{ id, tenantId }`, nunca solo por `id` — el mismo
 * criterio que StaffMembersService y ServicesService.
 */
@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: PatientsExcelImportService,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  async findAll(tenantId: string, query: PatientQueryDto) {
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PATIENT_PAGE_SIZE;

    const where: Prisma.PatientWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.tags && query.tags.length > 0 ? { tags: { hasSome: query.tags } } : {}),
      ...(query.createdFrom ? { createdAt: { gte: new Date(query.createdFrom) } } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { lastName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { documentNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      total,
      page: paginated ? page : 1,
      pageSize: paginated ? pageSize : total,
      totalPages: paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    };
  }

  /** GET /patients/stats — tarjetas de resumen del listado (spec §3). Antes el
   *  frontend aproximaba "Nuevos este mes" con una llamada aparte
   *  (`pageSize=1` + `createdFrom`); esto lo reemplaza con un solo round-trip
   *  que trae los tres conteos reales del tenant. */
  async getStats(tenantId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, active, newThisMonth] = await Promise.all([
      this.prisma.patient.count({ where: { tenantId } }),
      this.prisma.patient.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.patient.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
    ]);

    return { total, active, newThisMonth };
  }

  /** GET /patients/:id — ficha 360° completa (spec §3). */
  async getPatientProfile360(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId },
      include: DETAIL_INCLUDE,
    });
    if (!patient) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
    }
    return patient;
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  async create(tenantId: string, dto: CreatePatientDto) {
    try {
      const patient = await this.prisma.patient.create({
        data: { tenantId, ...this.buildWritableData(dto) },
        include: DETAIL_INCLUDE,
      });
      this.logger.log(`Paciente ${patient.id} creado en el centro ${tenantId}.`);
      return patient;
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePatientDto) {
    const current = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
    }

    try {
      const patient = await this.prisma.patient.update({
        where: { id },
        data: this.buildWritableData(dto, current),
        include: DETAIL_INCLUDE,
      });
      return patient;
    } catch (error) {
      throw this.translateWriteError(error, id);
    }
  }

  /** DELETE /patients/:id — inactivado lógico (spec §3), nunca borrado físico:
   *  el historial de citas, notas y galería del paciente sigue vivo. */
  async remove(tenantId: string, id: string) {
    try {
      const patient = await this.prisma.patient.update({
        where: { id, tenantId },
        data: { status: 'INACTIVE' },
      });
      this.logger.log(`Paciente ${id} inactivado en el centro ${tenantId}.`);
      return patient;
    } catch (error) {
      throw this.translateWriteError(error, id);
    }
  }

  // -------------------------------------------------------------------------
  // Antecedentes médicos
  // -------------------------------------------------------------------------

  async getMedicalHistory(tenantId: string, patientId: string) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    return this.prisma.patientMedicalHistory.findUnique({ where: { patientId } });
  }

  /** PUT /patients/:id/medical-history — upsert: la mayoría de pacientes no
   *  tiene fila todavía la primera vez que el equipo llena esta pestaña. */
  async upsertMedicalHistory(tenantId: string, patientId: string, dto: UpsertMedicalHistoryDto) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);

    const data = {
      allergies: dto.allergies ?? [],
      chronicConditions: dto.chronicConditions ?? [],
      currentMedications: dto.currentMedications ?? [],
      bloodType: dto.bloodType ?? null,
      emergencyContactName: dto.emergencyContactName ?? null,
      emergencyContactPhone: dto.emergencyContactPhone ?? null,
      // Cumplimiento MINSA NTS N° 139 (Fase 4).
      fitzpatrickSkinType: dto.fitzpatrickSkinType ?? null,
      skinType: dto.skinType ?? null,
      isPregnantOrLactating: dto.isPregnantOrLactating ?? false,
      roaccutaneLast12Months: dto.roaccutaneLast12Months ?? false,
      keloidTendency: dto.keloidTendency ?? false,
      activeHerpesBreakout: dto.activeHerpesBreakout ?? false,
      frequentSunExposure: dto.frequentSunExposure ?? false,
      smokingHabits: dto.smokingHabits ?? null,
    };

    const history = await this.prisma.patientMedicalHistory.upsert({
      where: { patientId },
      create: { patientId, ...data },
      update: data,
    });
    this.logger.log(`Antecedentes médicos actualizados para el paciente ${patientId}.`);
    return history;
  }

  // -------------------------------------------------------------------------
  // Notas clínicas
  // -------------------------------------------------------------------------

  /** POST /patients/:id/notes. */
  async createClinicalNote(tenantId: string, patientId: string, dto: CreateClinicalNoteDto) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    const note = await this.prisma.patientClinicalNote.create({
      data: {
        patientId,
        title: dto.title,
        content: dto.content,
        isPrivate: dto.isPrivate ?? false,
      },
    });
    this.logger.log(`Nota clínica ${note.id} registrada para el paciente ${patientId}.`);
    return note;
  }

  // -------------------------------------------------------------------------
  // Galería antes/después
  // -------------------------------------------------------------------------

  /** POST /patients/:id/gallery — registra una referencia a un asset ya
   *  existente en Medios (elegido vía MediaPickerDialog), no un archivo. */
  async addGalleryImage(tenantId: string, patientId: string, dto: CreateGalleryImageDto) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    const image = await this.prisma.patientGalleryImage.create({
      data: {
        patientId,
        imageUrl: dto.imageUrl,
        category: dto.category,
        serviceId: dto.serviceId ?? null,
        caption: dto.caption ?? null,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
      },
    });
    this.logger.log(`Foto de galería ${image.id} añadida al paciente ${patientId}.`);
    return image;
  }

  /** DELETE /patients/:id/gallery/:imageId — borrado físico: es una simple
   *  referencia a un asset de Medios, no un registro clínico que deba
   *  conservarse (a diferencia del paciente mismo). */
  async removeGalleryImage(tenantId: string, patientId: string, imageId: string) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    const image = await this.prisma.patientGalleryImage.findFirst({
      where: { id: imageId, patientId },
    });
    if (!image) {
      throw new NotFoundException('La fotografía no existe o no pertenece a este paciente.');
    }
    await this.prisma.patientGalleryImage.delete({ where: { id: imageId } });
    return { id: imageId };
  }

  // -------------------------------------------------------------------------
  // Importación masiva
  // -------------------------------------------------------------------------

  /** GET /patients/export-template, seeded with this tenant's PatientTag
   *  names (mirrors StaffMembersService.generateTemplate). */
  async generateTemplate(tenantId: string): Promise<Buffer> {
    const tags = await this.prisma.patientTag.findMany({
      where: { tenantId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return this.excel.generateTemplate(tags.map((tag) => tag.name));
  }

  /**
   * POST /patients/import-preview (dryRun) and POST /patients/bulk-import.
   *
   * Valid rows are imported and invalid ones are reported; a single bad cell
   * does not sink a 300-row file — same contract as
   * StaffMembersService.importFromExcel. `dryRun` runs the exact same
   * analysis without writing anything.
   *
   * `allergies` (split from "Alergias / Antecedentes") is not a Patient
   * column — after each row's Patient is created, a non-empty allergies list
   * is upserted into that patient's PatientMedicalHistory in the same
   * transaction, so a row that names an allergy never leaves the patient
   * created but the alert missing.
   */
  async importFromExcel(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<PatientImportResult> {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException('Adjunta un archivo .xlsx o .csv en el campo "file".');
    }

    const existingDocuments = await this.prisma.patient.findMany({
      where: { tenantId, documentNumber: { not: null } },
      select: { documentNumber: true },
    });

    const parsed = await this.excel.parseAndValidateExcel(file.buffer, {
      existingDocumentNumbers: existingDocuments
        .map((row) => row.documentNumber)
        .filter((value): value is string => !!value),
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      for (const row of parsed.data) {
        const created = await tx.patient.create({
          data: { tenantId, ...this.buildWritableData(row.patient as CreatePatientDto) },
        });
        if (row.allergies.length > 0) {
          await tx.patientMedicalHistory.upsert({
            where: { patientId: created.id },
            create: { patientId: created.id, allergies: row.allergies },
            update: { allergies: row.allergies },
          });
        }
      }
      return parsed.data.length;
    });

    this.logger.log(
      `Importación de pacientes en el centro ${tenantId}: ${imported} paciente(s), ${parsed.errors.length} error(es).`,
    );

    return { ...parsed, imported, dryRun: false };
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  /** Columnas escritas tanto en create() como en el merge de update(). Igual
   *  que StaffMembersService.buildWritableData: `current` solo hace falta
   *  para firstName/lastName porque son NOT NULL sin default — el resto son
   *  opcionales, así que `undefined` ya significa "no tocar" en un update(),
   *  y Prisma aplica sus propios @default (documentType, status) cuando la
   *  clave está ausente en un create(). */
  private buildWritableData(
    dto: CreatePatientDto | UpdatePatientDto,
    current?: { firstName: string; lastName: string },
  ) {
    const pick = <K extends keyof CreatePatientDto>(key: K, fallback: unknown) =>
      dto[key] === undefined ? fallback : dto[key];

    return {
      firstName: pick('firstName', current?.firstName) as string,
      lastName: pick('lastName', current?.lastName) as string,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber === undefined ? undefined : (dto.documentNumber ?? null),
      phone: dto.phone === undefined ? undefined : (dto.phone ?? null),
      email: dto.email === undefined ? undefined : (dto.email ?? null),
      birthDate: dto.birthDate === undefined ? undefined : (dto.birthDate ? new Date(dto.birthDate) : null),
      gender: dto.gender === undefined ? undefined : (dto.gender ?? null),
      address: dto.address === undefined ? undefined : (dto.address ?? null),
      district: dto.district === undefined ? undefined : (dto.district ?? null),
      // `null` explícito (no `undefined`) — mismo criterio que
      // StaffMembersService: así el frontend puede borrar la foto mandando
      // avatarUrl: null sin que axios/JSON.stringify omita la clave.
      avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl ?? null),
      acquisitionChannel: dto.acquisitionChannel === undefined ? undefined : (dto.acquisitionChannel ?? null),
      tags: dto.tags,
      notes: dto.notes === undefined ? undefined : (dto.notes ?? null),
      status: dto.status,
    };
  }

  private async assertPatientBelongsToTenant(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
    }
  }

  private translateWriteError(error: unknown, id?: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === RECORD_NOT_FOUND) {
        return new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
      }
      if (error.code === UNIQUE_VIOLATION) {
        return new UnprocessableEntityException('Ya existe un paciente con ese número de documento.');
      }
    }
    if (id) this.logger.error(`Error al escribir el paciente ${id}`, error as Error);
    return error;
  }
}
