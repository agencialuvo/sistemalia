import { Module } from '@nestjs/common';
import { InventoryExcelImportService } from './inventory-excel-import.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Módulo 07 — Inventario y Control de Stock (Fase 1: Backend Core).
 *
 * PrismaModule es global, no se importa aquí. InventoryService se exporta
 * por si un futuro módulo (ej. consumo clínico automático, Fase 3 Task 3.3,
 * o ventas en caja) necesita descontar stock directamente.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryExcelImportService],
  exports: [InventoryService],
})
export class InventoryModule {}
