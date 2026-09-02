import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

/**
 * Módulo 08 — Ventas, Caja Chica y Facturación Electrónica (Fase 1: Backend
 * Core). Importa InventoryModule para descontar/devolver stock al vender o
 * anular productos (spec §4), mismo patrón que ClinicalRecordsModule
 * importándolo para el consumo clínico.
 */
@Module({
  imports: [InventoryModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
