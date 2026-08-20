# Desglose de Tareas - Módulo 03: Catálogo de Servicios y Categorías

## Fase 1: Base de Datos y Modelado Prisma
- [x] **Task 1.1**: Actualizar `backend/prisma/schema.prisma` agregando los modelos `ServiceCategory`, `Service` y los enums requeridos (`ServiceStructureType`, `ServiceAvailabilityType`, `ServicePaymentMethod`).
- [x] **Task 1.2**: Ejecutar `npx prisma migrate dev --name add_services_and_categories` para aplicar los cambios a la base de datos PostgreSQL.
- [x] **Task 1.3**: Confirmar compilación con `npx prisma generate` y validación de tipos con `npx tsc --noEmit`.

## Fase 2: Lógica Backend (NestJS)
- [x] **Task 2.1**: Crear `ServicesModule`, `CategoriesService` y DTOs para el CRUD de `ServiceCategory`.
- [x] **Task 2.2**: Crear DTOs de `Service` (`CreateServiceDto`, `UpdateServiceDto`) con validaciones de `class-validator` para campos condicionales.
- [x] **Task 2.3**: Implementar `ServicesService` con operaciones CRUD respetando el aislamiento estricto por `@TenantId()`.
- [x] **Task 2.4**: Instalar `exceljs` en el backend y crear `ExcelImportService` para:
  - Generar la plantilla `.xlsx` descargable con formato enriquecido e instrucciones.
  - Parsear y validar arreglos de filas importadas desde archivos subidos.
- [x] **Task 2.5**: Crear `ServicesController` con las rutas correspondientes de servicios, categorías, descarga de plantilla e importación masiva.

## Fase 3: Interfaz Frontend (Next.js)
- [x] **Task 3.1**: Crear esquemas de validación Zod en `src/lib/validators/service.ts`.
- [x] **Task 3.2**: Crear la vista principal `src/app/(dashboard)/servicios/page.tsx` con la grilla de servicios, filtros por categoría y barra de búsqueda.
- [x] **Task 3.3**: Crear el modal de categorías `src/components/services/category-manager-dialog.tsx`.
- [x] **Task 3.4**: Crear el formulario de servicios `src/components/services/service-form-dialog.tsx` organizado por pestañas y con visualización condicional de campos.
- [x] **Task 3.5**: Crear el modal de carga masiva `src/components/services/excel-import-dialog.tsx` (descarga de plantilla, drag & drop de Excel y tabla de reporte de validación).

## Fase 4: Pruebas y Verificación
- [x] **Task 4.1**: Extender `backend/scripts/smoke-test.mts` para verificar creación de categorías, servicios e importación por Excel contra PostgreSQL y Redis reales.
- [x] **Task 4.2**: Ejecutar `npx tsc --noEmit` y `npm run build` tanto en `backend/` como en el frontend para confirmar cero errores.