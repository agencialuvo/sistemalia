import { Module } from '@nestjs/common';
import { InventoryModule } from '../../inventory/inventory.module';
import { ClinicalPatientRecordsController } from './clinical-patient-records.controller';
import { ClinicalRecordsService } from './clinical-records.service';
import { ClinicalTemplateCategoriesService } from './clinical-template-categories.service';
import { ClinicalTemplatesExcelService } from './clinical-templates-excel.service';
import { ClinicalTemplatesController } from './clinical-templates.controller';

/**
 * Fase 4 — Fichas Dinámicas y Cumplimiento MINSA (spec Fase 4 §3).
 *
 * Importa InventoryModule para el consumo clínico automático (Módulo 07 Fase
 * 3, Task 3.3): registrar una atención puede descontar stock de un lote y
 * dejar su fila de Kardex, dentro de la misma transacción que crea el
 * ClinicalProcedureRecord.
 */
@Module({
  imports: [InventoryModule],
  controllers: [ClinicalTemplatesController, ClinicalPatientRecordsController],
  providers: [ClinicalRecordsService, ClinicalTemplateCategoriesService, ClinicalTemplatesExcelService],
  exports: [ClinicalRecordsService],
})
export class ClinicalRecordsModule {}
