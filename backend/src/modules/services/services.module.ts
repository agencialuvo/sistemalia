import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { ExcelImportService } from './excel-import.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

/**
 * Módulo 03 — Catálogo de Servicios y Categorías.
 *
 * PrismaModule is global (see PrismaModule), so it is not imported here.
 * CategoriesService is exported because the Excel import resolves category
 * names through it and future modules (Agenda, Cotizaciones) will need the
 * same lookup.
 */
@Module({
  controllers: [ServicesController],
  providers: [ServicesService, CategoriesService, ExcelImportService],
  exports: [ServicesService, CategoriesService],
})
export class ServicesModule {}
