# Lista de Tareas - Módulo 08: Ventas, Caja Chica y Facturación Electrónica

## Fase 1: Base de Datos y Backend Core
- [ ] **Task 1.1:** Definir enums (`PaymentMethod`, `InvoiceType`, `InvoiceStatus`, `CashRegisterStatus`, `CashMovementType`) y modelos (`CashRegister`, `Invoice`, `InvoiceItem`, `Payment`, `CashMovement`) en `prisma/schema.prisma`.
- [ ] **Task 1.2:** Generar y aplicar la migración de Prisma `20260831_add_sales_and_cash_module`.
- [ ] **Task 1.3:** Crear DTOs de validación (`open-cash.dto.ts`, `close-cash.dto.ts`, `create-invoice.dto.ts`, `create-cash-movement.dto.ts`).
- [ ] **Task 1.4:** Implementar `SalesService` con lógica transaccional (Cierre/Apertura de Caja, emisión de comprobantes, cálculo de IGV, comisiones de Staff y descuento de stock si aplica).
- [ ] **Task 1.5:** Crear `SalesController` con los endpoints de caja, ventas y anulación.

## Fase 2: Frontend Base, POS y Gestión de Caja
- [ ] **Task 2.1:** Crear API client y tipos TypeScript en `src/lib/sales/api.ts` y `validators/sales.ts`.
- [ ] **Task 2.2:** Crear modales de Apertura (`open-cash-dialog.tsx`) y Cierre/Arqueo de Caja (`close-cash-dialog.tsx`).
- [ ] **Task 2.3:** Construir la Pestaña de Caja Chica (`/ventas?tab=cash-register`) con resumen de saldos y registros de caja.
- [ ] **Task 2.4:** Construir el Punto de Venta / Cobro de Citas (`pos-checkout-card.tsx`) con soporte para multipago y tipo de comprobante.

## Fase 3: Historial, Comprobantes en Ticket y Verificación
- [ ] **Task 3.1:** Construir la vista de Historial de Ventas (`/ventas?tab=history`) con filtros y anulación de comprobantes.
- [ ] **Task 3.2:** Crear vista/modal de Comprobante listo para impresión en Ticket de 80mm (`invoice-receipt-modal.tsx`).
- [ ] **Task 3.3:** Conectar la acción de cobro con el estado de la Cita (actualizar a `COMPLETED` si no lo estaba) y liquidación de comisiones.
- [ ] **Task 3.4:** Verificación final de tipos (`tsc`), `eslint` y compilación `next build` / `nest build`.