# Plan de Arquitectura - Módulo 03: Catálogo de Servicios y Categorías

## 1. Arquitectura de Base de Datos (Prisma)
- Agregar `ServiceCategory` y `Service` al archivo `backend/prisma/schema.prisma`.
- Relacionar `ServiceCategory` con `Tenant` (1:N) y `Service` (1:N).
- Relacionar `Service` con `Tenant` (1:N).
- Definir Enums: `ServiceStructureType`, `ServiceAvailabilityType`, `ServicePaymentMethod`.
- Generar y aplicar migración en desarrollo.

## 2. Arquitectura Backend (NestJS)
- Crear módulo `ServicesModule` en `backend/src/modules/services/`.
- Componentes:
  - `ServicesController`: Endpoints REST expuestos con `@UseGuards(JwtAuthGuard)` e interceptor `@TenantId()`.
  - `ServicesService`: Lógica de negocio CRUD e importación masiva.
  - `CategoriesService`: Lógica CRUD de categorías.
  - `ExcelImportService`: Módulo auxiliar para procesamiento y parseo de Excel con la librería `exceljs`.
  - DTOs (`create-service.dto.ts`, `update-service.dto.ts`, `create-category.dto.ts`, `import-services.dto.ts`).
  - Utilidades: Generador de buffer de plantilla Excel (`services-template.generator.ts`).

## 3. Arquitectura Frontend (Next.js)
- Ruta: `src/app/(dashboard)/servicios/page.tsx`
- Componentes:
  - `src/components/services/services-header.tsx`: Acciones principales e importación.
  - `src/components/services/services-grid.tsx`: Grilla de tarjetas de servicios.
  - `src/components/services/service-form-dialog.tsx`: Modal con pestañas para creación/edición de servicios.
  - `src/components/services/category-manager-dialog.tsx`: Modal para crear/editar categorías.
  - `src/components/services/excel-import-dialog.tsx`: Modal para subir y previsualizar la carga masiva.
- Estado & Hooks:
  - `src/hooks/use-services.ts`: React Query / SWR / Fetch state para consumos del backend.
- Esquemas de validación Zod:
  - `src/lib/validators/service.ts`: `serviceSchema` y `categorySchema`.

## 4. Estrategia de Pruebas
- Pruebas unitarias de parsers de Excel con casos límite (precios negativos, categorías vacías, columnas desordenadas).
- Test de integración en `backend/scripts/smoke-test.mts` agregando creación de categoría, creación de servicio individual y subida masiva por Excel.