# Spec - Módulo 08: Ventas, Caja Chica y Facturación Electrónica (SUNAT)

## 1. Visión General
El Módulo 08 gestiona el ciclo financiero completo de la clínica: apertura/cierre de caja chica diaria, cobro de citas y ventas directas de productos/servicios, cálculo automático de comisiones para el personal médico/técnico y emisión de comprobantes de pago aptos para la normativa tributaria peruana (Boletas, Facturas y Notas de Venta).

## 2. Modelo de Datos (Prisma)

### Enums
- `PaymentMethod`: `CASH` (Efectivo), `YAPE`, `PLIN`, `CARD` (Tarjeta POS/Niubiz/IziPay), `TRANSFER` (Transferencia Bancaria).
- `InvoiceType`: `BOLETA` (Boleta de Venta Electrónica), `FACTURA` (Factura Electrónica), `SALE_NOTE` (Nota de Venta / Ticket Interno).
- `InvoiceStatus`: `DRAFT`, `PAID`, `ANULLED`.
- `CashRegisterStatus`: `OPEN`, `CLOSED`.
- `CashMovementType`: `INITIAL_BALANCE`, `INCOME_SALE`, `MANUAL_INCOME`, `EXPENSE_OUT`, `COMMISSION_PAYMENT`.

### Modelos Principales
- **CashRegister**: `id`, `tenantId`, `openedById`, `closedById`, `initialBalance`, `finalBalance`, `expectedBalance`, `difference`, `status`, `openedAt`, `closedAt`, `notes`.
- **Invoice**: `id`, `tenantId`, `patientId` (opcional), `appointmentId` (opcional), `cashRegisterId`, `type`, `series`, `number`, `status`, `customerDocType` (DNI/RUC), `customerDocNumber`, `customerName`, `subtotal`, `igv`, `total`, `createdById`, `createdAt`.
- **InvoiceItem**: `id`, `invoiceId`, `serviceId` (opcional), `productId` (opcional), `staffId` (opcional para comisiones), `description`, `quantity`, `unitPrice`, `totalPrice`, `commissionAmount`.
- **Payment**: `id`, `tenantId`, `invoiceId`, `cashRegisterId`, `method`, `amount`, `referenceNumber` (N° de operación Yape/Plin/Voucher), `createdAt`.
- **CashMovement**: `id`, `tenantId`, `cashRegisterId`, `type`, `amount`, `concept`, `performedById`, `createdAt`.

## 3. Reglas de Negocio & Algoritmos
1. **Control Obligatorio de Caja Chica:** No se pueden procesar cobros (`Invoice` con pagos) si no existe un registro de `CashRegister` en estado `OPEN` para la jornada actual en el tenant.
2. **Cálculo de IGV (Perú):** Operaciones gravadas calculan `subtotal = total / 1.18` e `igv = total - subtotal`. Soporte para items inafectos/exonerados si aplica.
3. **Numeración de Serie Inmutable:** Correlativo autoincremental por tipo de comprobante y tenant (ej. `B001-00000001`, `F001-00000001`, `NV01-00000001`).
4. **Integración con Módulo 03 (Comisiones):** Al facturar un `InvoiceItem` vinculado a un `staffId`, el sistema calcula inmediatamente `commissionAmount` basándose en la regla de comisión configurada para ese profesional/servicio.
5. **Cierre de Caja & Arqueo:** `expectedBalance = initialBalance + sum(CASH_INCOMES) - sum(CASH_EXPENSES)`. La diferencia (`finalBalance - expectedBalance`) queda auditada.

## 4. Contratos de API (Endpoints)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/sales/cash-registers/current` | Obtiene el estado de la caja chica actual del tenant |
| `POST` | `/sales/cash-registers/open` | Aperturar caja chica con saldo inicial |
| `POST` | `/sales/cash-registers/close` | Arqueo y cierre de caja chica |
| `GET` | `/sales/invoices` | Listado de comprobantes/ventas con filtros por fecha y estado |
| `POST` | `/sales/invoices` | Crear y cobrar un nuevo comprobante (Cita o Venta Directa) |
| `GET` | `/sales/invoices/:id` | Detalle completo de una venta con desglose de items y pagos |
| `PATCH` | `/sales/invoices/:id/anull` | Anular comprobante (con devolución de stock si incluía productos) |