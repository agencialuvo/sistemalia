# Lista de Tareas - Módulo 07: Inventario y Control de Stock

## Fase 1: Base de Datos y Backend Core
- [ ] **Task 1.1:** Definir enums (`ProductType`, `StockMovementType`) y modelos (`Product`, `InventoryBatch`, `StockMovement`) en `prisma/schema.prisma`.
- [ ] **Task 1.2:** Generar y aplicar la migración de Prisma `20260830_add_inventory_module`.
- [ ] **Task 1.3:** Crear DTOs de validación (`create-product.dto.ts`, `create-batch.dto.ts`, `create-movement.dto.ts`).
- [ ] **Task 1.4:** Implementar `InventoryService` con lógica FEFO, actualización atómica de stock y cálculo de Kardex.
- [ ] **Task 1.5:** Crear `InventoryController` con los 6 endpoints del spec REST.

## Fase 2: Frontend Base y Catálogo de Productos
- [ ] **Task 2.1:** Crear API client y tipos TypeScript en `src/lib/inventory/api.ts` y `validators/inventory.ts`.
- [ ] **Task 2.2:** Crear modal de alta/edición de productos (`product-form-dialog.tsx`).
- [ ] **Task 2.3:** Crear modal de ingreso de lotes y compras (`batch-entry-dialog.tsx`).
- [ ] **Task 2.4:** Construir la página principal `/inventario` con el Catálogo de Productos y Tablas de Stock.

## Fase 3: Trazabilidad DIGEMID, Kardex y Consumo Clínico
- [ ] **Task 3.1:** Construir la vista de Lotes y Vencimientos con el Semáforo de Alertas DIGEMID.
- [ ] **Task 3.2:** Construir la tabla de Kardex/Movimientos con filtros por tipo de transacción.
- [ ] **Task 3.3:** Vincular el selector de Lotes en `clinical-record-form-dialog.tsx` para descontar stock real del Kardex al guardar la atención.
- [ ] **Task 3.4:** Verificación final de tipos (`tsc`), `eslint` y compilación `next build` / `nest build`.