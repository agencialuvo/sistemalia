# Spec - Módulo 07: Inventario y Control de Stock (Normativa DIGEMID)

## 1. Visión General
El Módulo de Inventario gestiona los insumos médicos, cosméticos y productos de venta directa. Garantiza la trazabilidad exigida por DIGEMID mediante el seguimiento estricto de números de **Lote** y **Fechas de Vencimiento**, además del registro automático en Kardex ante compras, mermas, ventas o consumos en atenciones clínicas.

## 2. Modelo de Datos (Prisma)

### Enums
- `ProductType`: `CONSUMABLE` (Insumo para tratamientos), `RETAIL` (Producto para venta al paciente), `EQUIPMENT` (Accesorio/Instrumental).
- `StockMovementType`: `PURCHASE_INPUT` (Ingreso por compra), `CLINICAL_CONSUMPTION` (Salida por atención médica), `RETAIL_SALE` (Salida por venta en caja), `ADJUSTMENT_ADD` (Ajuste positivo), `ADJUSTMENT_SUB` (Ajuste negativo/merma), `EXPIRED_DISCARD` (Baja por vencimiento).

### Modelos Principales
- **Product**: `id`, `tenantId`, `name`, `sku`, `type`, `unitOfMeasure` (ml, UI, unidades, ampolla), `minStock`, `costPrice`, `salePrice`, `isActive`, `createdAt`.
- **InventoryBatch**: `id`, `tenantId`, `productId`, `lotNumber`, `expirationDate`, `initialQuantity`, `currentQuantity`, `isActive`.
- **StockMovement**: `id`, `tenantId`, `productId`, `batchId` (opcional), `type`, `quantity`, `costUnitPrice`, `referenceId` (ej. ID de `ClinicalProcedureRecord` o `Invoice`), `notes`, `performedById`, `createdAt`.

## 3. Reglas de Negocio & Algoritmos
1. **Lógica FEFO (First Expired, First Out):** Al registrar consumo o venta sin especificar lote, el sistema sugiere automáticamente el lote activo más próximo a vencer.
2. **Semáforo de Vencimiento DIGEMID:**
   * **Rojo:** Vencido o a menos de 30 días de vencer.
   * **Amarillo:** A vencer entre 31 y 90 días.
   * **Verde:** Más de 90 días de vigencia.
3. **Consumo Clínico Automático:** Posibilidad de vincular el lote ingresado en la Ficha de Atención (`ClinicalProcedureRecord`) para descontar automáticamente la cantidad consumida del Kardex.

## 4. Contratos de API (Endpoints)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/inventory/products` | Lista productos con stock consolidado y estado de alerta |
| `POST` | `/inventory/products` | Crear nuevo producto o insumo |
| `GET` | `/inventory/batches` | Lista de lotes con filtros por vencimiento/producto |
| `POST` | `/inventory/batches` | Registrar ingreso de nuevo lote (Entrada por compra) |
| `GET` | `/inventory/kardex` | Historial unificado de movimientos de stock |
| `POST` | `/inventory/movements` | Registrar movimiento manual (Ajuste, Merma, Baja por Vencimiento) |