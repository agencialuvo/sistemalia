import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalTemplateCategoriesService } from './clinical-template-categories.service';
import { ClinicalTemplatesExcelService, ParseResult } from './clinical-templates-excel.service';
import { ClinicalFormTemplateSchemaDto } from './dto/clinical-form-field.dto';
import { CreateClinicalRecordDto } from './dto/create-clinical-record.dto';
import { CreateClinicalTemplateDto } from './dto/create-clinical-template.dto';
import { QueryClinicalTemplatesDto } from './dto/query-clinical-templates.dto';
import { UpdateClinicalRecordDto } from './dto/update-clinical-record.dto';
import { UpdateClinicalTemplateDto } from './dto/update-clinical-template.dto';

export interface ImportTemplatesResult extends ParseResult {
  /** Rows actually written — 0 on a dry run. */
  imported: number;
  dryRun: boolean;
}

const RECORD_INCLUDE = {
  template: { select: { id: true, name: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
  appointment: { select: { id: true, startAt: true } },
} satisfies Prisma.ClinicalProcedureRecordInclude;

/**
 * Fase 4 — Form Builder + Fichas Clínicas Dinámicas (spec Fase 4 §3).
 *
 * Two concerns share this service because they share a lifecycle: a
 * ClinicalFormTemplate only exists to be filled in as a ClinicalProcedureRecord,
 * and a record always validates against its tenant's own template — same
 * tenantId isolation discipline as PatientsService throughout.
 */
@Injectable()
export class ClinicalRecordsService {
  private readonly logger = new Logger(ClinicalRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly categories: ClinicalTemplateCategoriesService,
    private readonly excel: ClinicalTemplatesExcelService,
  ) {}

  // -------------------------------------------------------------------------
  // Plantillas (Form Builder)
  // -------------------------------------------------------------------------

  /** POST /clinical-templates. The category the Form Builder saved becomes a
   *  real catalogue row if it wasn't one yet (typed free-hand, or renamed
   *  right before saving) — same "resolve/auto-create by name at write
   *  time" contract categoryName gets in Services' bulk import. */
  async createTemplate(tenantId: string, dto: CreateClinicalTemplateDto) {
    await this.categories.ensureExists(tenantId, dto.fieldsSchema.category);
    const template = await this.prisma.clinicalFormTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        fieldsSchema: this.toJsonFieldsSchema(dto.fieldsSchema),
      },
    });
    this.logger.log(`Plantilla clínica ${template.id} creada en el centro ${tenantId}.`);
    return template;
  }

  /** GET /clinical-templates?search=&category=&isActive= — omitting `isActive`
   *  returns both (the management grid at /plantillas-clinicas shows active
   *  and inactive with a badge + status filter); the record form's template
   *  picker passes `isActive: true` explicitly since a deactivated template
   *  stays referenced by its historical records but shouldn't be offered for
   *  new procedures. `category` lives inside the `fieldsSchema` JSON column,
   *  not its own field, hence the Prisma JSON path filter. */
  async listTemplates(tenantId: string, query: QueryClinicalTemplatesDto = {}) {
    return this.prisma.clinicalFormTemplate.findMany({
      where: {
        tenantId,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(query.category ? { fieldsSchema: { path: ['category'], equals: query.category } } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  /** PATCH /clinical-templates/:id — edición del Form Builder y baja lógica
   *  (`isActive: false`) en el mismo endpoint, mismo criterio que
   *  ServiceCategory/Specialty. */
  async updateTemplate(tenantId: string, id: string, dto: UpdateClinicalTemplateDto) {
    const current = await this.prisma.clinicalFormTemplate.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La plantilla clínica no existe o no pertenece a tu centro estético.');
    }
    if (dto.fieldsSchema) {
      await this.categories.ensureExists(tenantId, dto.fieldsSchema.category);
    }

    const template = await this.prisma.clinicalFormTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description === undefined ? undefined : (dto.description ?? null),
        fieldsSchema:
          dto.fieldsSchema === undefined ? undefined : this.toJsonFieldsSchema(dto.fieldsSchema),
        isActive: dto.isActive,
      },
    });
    this.logger.log(`Plantilla clínica ${template.id} actualizada en el centro ${tenantId}.`);
    return template;
  }

  /** DELETE /clinical-templates/:id — hard delete (spec: distinct from the
   *  soft "Desactivar" above). `templateId` on ClinicalProcedureRecord is
   *  `onDelete: SetNull`, so historical records survive with the template
   *  reference cleared instead of being blocked or cascaded away. */
  async removeTemplate(tenantId: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const current = await this.prisma.clinicalFormTemplate.findFirst({ where: { id, tenantId } });
    if (!current) {
      throw new NotFoundException('La plantilla clínica no existe o no pertenece a tu centro estético.');
    }

    await this.prisma.clinicalFormTemplate.delete({ where: { id } });
    this.logger.log(`Plantilla clínica ${id} ("${current.name}") eliminada del centro ${tenantId}.`);
    return { id, deleted: true };
  }

  // -------------------------------------------------------------------------
  // Exportación / Importación masiva
  // -------------------------------------------------------------------------

  /** GET /clinical-templates/export. Only ACTIVE templates — a deactivated
   *  one is deliberately excluded from a fresh export/import round-trip, same
   *  "solo plantillas activas" scope the picker uses. Always .xlsx — see
   *  ClinicalTemplatesExcelService's doc comment on why JSON stays an import-
   *  only format. */
  async exportTemplates(tenantId: string): Promise<Buffer> {
    const templates = await this.prisma.clinicalFormTemplate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      select: { name: true, description: true, fieldsSchema: true },
    });

    return this.excel.exportAsExcel(
      templates.map((t) => ({
        name: t.name,
        description: t.description,
        fieldsSchema: t.fieldsSchema as Record<string, unknown>,
      })),
    );
  }

  /**
   * POST /clinical-templates/bulk-import.
   *
   * Valid, non-duplicate rows are imported and every other row is reported —
   * one bad or duplicate template name does not sink the rest of the file.
   * `dryRun` runs the exact same analysis without writing anything, same
   * preview-then-confirm contract as InventoryService.importProductsFromExcel.
   */
  async bulkImportTemplates(
    tenantId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<ImportTemplatesResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Adjunta un archivo .xlsx, .csv o .json en el campo "file".');
    }

    const existing = await this.prisma.clinicalFormTemplate.findMany({
      where: { tenantId },
      select: { name: true },
    });

    const parsed = await this.excel.parseAndValidate(file.buffer, {
      existingNames: existing.map((t) => t.name),
      filename: file.originalname,
    });

    if (dryRun || parsed.data.length === 0) {
      return { ...parsed, imported: 0, dryRun };
    }

    const imported = await this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of parsed.data) {
        await this.categories.ensureExists(tenantId, row.template.fieldsSchema.category, tx);
        await tx.clinicalFormTemplate.create({
          data: {
            tenantId,
            name: row.template.name,
            description: row.template.description ?? null,
            fieldsSchema: this.toJsonFieldsSchema(row.template.fieldsSchema),
          },
        });
        count += 1;
      }
      return count;
    });

    this.logger.log(
      `Importación de plantillas clínicas en el centro ${tenantId}: ${imported} plantilla(s), ` +
        `${parsed.duplicateCount} duplicada(s), ${parsed.errors.length} error(es).`,
    );

    return { ...parsed, imported, dryRun: false };
  }

  // -------------------------------------------------------------------------
  // Registros de procedimiento
  // -------------------------------------------------------------------------

  /**
   * POST /patients/:id/clinical-records. Cuando `dto.consumedInsumo` llega
   * (Módulo 07 Fase 3, Task 3.3), todo corre en una sola transacción: si el
   * descuento de stock falla (lote sin saldo suficiente, por ejemplo), la
   * atención clínica tampoco se guarda — nunca queda una sin la otra.
   */
  async createProcedureRecord(
    tenantId: string,
    patientId: string,
    dto: CreateClinicalRecordDto,
    performedById?: string,
  ) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    await this.assertTemplateBelongsToTenant(tenantId, dto.templateId);
    if (dto.staffId) {
      await this.assertStaffBelongsToTenant(tenantId, dto.staffId);
    }
    if (dto.appointmentId) {
      await this.assertAppointmentBelongsToPatient(tenantId, patientId, dto.appointmentId);
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalProcedureRecord.create({
        data: {
          patientId,
          templateId: dto.templateId,
          staffId: dto.staffId ?? null,
          appointmentId: dto.appointmentId ?? null,
          formDataValues: dto.formDataValues as Prisma.InputJsonValue,
          faceMappingData: (dto.faceMappingData ?? undefined) as Prisma.InputJsonValue | undefined,
          performedAt: dto.performedAt ? new Date(dto.performedAt) : undefined,
        },
        include: RECORD_INCLUDE,
      });

      if (dto.consumedInsumo) {
        await this.inventory.registerClinicalConsumption(tx, tenantId, {
          productId: dto.consumedInsumo.productId,
          batchId: dto.consumedInsumo.batchId,
          quantity: dto.consumedInsumo.quantity,
          referenceId: created.id,
          performedById,
        });
      }

      return created;
    });

    this.logger.log(`Registro clínico ${record.id} creado para el paciente ${patientId}.`);
    return record;
  }

  /** GET /patients/:id/clinical-records — más reciente primero, mismo
   *  criterio que PatientClinicalNote (evolución más nueva arriba). */
  async listProcedureRecords(tenantId: string, patientId: string) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    return this.prisma.clinicalProcedureRecord.findMany({
      where: { patientId },
      orderBy: { performedAt: 'desc' },
      include: RECORD_INCLUDE,
    });
  }

  /** PATCH /patients/:id/clinical-records/:recordId — corrige respuestas,
   *  insumo o mapeo facial de un registro ya guardado. `templateId` nunca se
   *  toca aquí (ver UpdateClinicalRecordDto). */
  async updateProcedureRecord(
    tenantId: string,
    patientId: string,
    recordId: string,
    dto: UpdateClinicalRecordDto,
  ) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    await this.assertRecordBelongsToPatient(patientId, recordId);
    if (dto.staffId) {
      await this.assertStaffBelongsToTenant(tenantId, dto.staffId);
    }

    const record = await this.prisma.clinicalProcedureRecord.update({
      where: { id: recordId },
      data: {
        staffId: dto.staffId === undefined ? undefined : (dto.staffId ?? null),
        formDataValues:
          dto.formDataValues === undefined
            ? undefined
            : (dto.formDataValues as Prisma.InputJsonValue),
        faceMappingData:
          dto.faceMappingData === undefined
            ? undefined
            : (dto.faceMappingData as Prisma.InputJsonValue),
        performedAt: dto.performedAt ? new Date(dto.performedAt) : undefined,
      },
      include: RECORD_INCLUDE,
    });
    this.logger.log(`Registro clínico ${record.id} actualizado para el paciente ${patientId}.`);
    return record;
  }

  /** DELETE /patients/:id/clinical-records/:recordId. */
  async deleteProcedureRecord(tenantId: string, patientId: string, recordId: string) {
    await this.assertPatientBelongsToTenant(tenantId, patientId);
    await this.assertRecordBelongsToPatient(patientId, recordId);

    await this.prisma.clinicalProcedureRecord.delete({ where: { id: recordId } });
    this.logger.log(`Registro clínico ${recordId} eliminado del paciente ${patientId}.`);
    return { id: recordId, deleted: true };
  }

  private async assertRecordBelongsToPatient(patientId: string, recordId: string): Promise<void> {
    const record = await this.prisma.clinicalProcedureRecord.findFirst({
      where: { id: recordId, patientId },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException('El registro clínico no existe o no pertenece a este paciente.');
    }
  }

  /** Strips the DTO instance down to a plain object before handing it to
   *  Prisma's Json column — same reasoning as PaymentMethodConfig.details:
   *  a class instance round-trips through JSON fine, but a plain object
   *  makes the stored shape (and what a future read sees) unambiguous. */
  private toJsonFieldsSchema(schema: ClinicalFormTemplateSchemaDto): Prisma.InputJsonValue {
    return {
      category: schema.category,
      hasFaceMapping: schema.hasFaceMapping ?? false,
      fields: schema.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        options: field.options,
        required: field.required,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Reglas de negocio
  // -------------------------------------------------------------------------

  private async assertPatientBelongsToTenant(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('El paciente no existe o no pertenece a tu centro estético.');
    }
  }

  private async assertTemplateBelongsToTenant(tenantId: string, templateId: string): Promise<void> {
    const template = await this.prisma.clinicalFormTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException('La plantilla clínica no existe o no pertenece a tu centro estético.');
    }
  }

  private async assertStaffBelongsToTenant(tenantId: string, staffId: string): Promise<void> {
    const staff = await this.prisma.staffMember.findFirst({
      where: { id: staffId, tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('El profesional no existe o no pertenece a tu centro estético.');
    }
  }

  private async assertAppointmentBelongsToPatient(
    tenantId: string,
    patientId: string,
    appointmentId: string,
  ): Promise<void> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, patientId },
      select: { id: true },
    });
    if (!appointment) {
      throw new NotFoundException('La cita no existe o no pertenece a este paciente.');
    }
  }
}
