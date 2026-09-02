# Plan de Implementación UI/UX - Módulo 07: Inventario

## 1. Estructura de Navegación (`/inventario`)

Ubicación en Menú Lateral: **Gestión Operativa > Inventario y Stock** (`/inventario`).

### Pestañas Principales:
1. **Pestaña 1: Catálogo de Productos (`/inventario?tab=products`)**
   * Tabla con buscador por SKU/Nombre, filtro por Tipo (`Insumo`, `Venta`) y semáforo de Stock Mínimo.
   * Botones: **"+ Nuevo Producto"** e **"Ingresar Lote / Compra"**.

2. **Pestaña 2: Control de Lotes y Vencimientos (`/inventario?tab=batches`)**
   * Vista enfocada en la trazabilidad DIGEMID.
   * Badges de alerta de vencimiento (Rojo: <30 días, Amarillo: <90 días).
   * Filtro rápido: "Lotes por vencer este mes".

3. **Pestaña 3: Kardex / Movimientos (`/inventario?tab=kardex`)**
   * Historial cronológico inmutable de entradas, salidas, mermas y consumos en procedimientos médicos.

## 2. Componentes Clave
- `product-form-dialog.tsx`: Modal para crear/editar productos (Nombre, Unidad de medida, Stock mínimo, Precios).
- `batch-entry-dialog.tsx`: Modal para registrar entrada de stock indicando Número de Lote, Fecha de Vencimiento, Cantidad y Costo Unitario.
- `stock-adjustment-dialog.tsx`: Modal para registrar mermas o bajas por vencimiento indicando motivo.

## 3. Integración con Módulos Existentes
- **Ficha 360° del Paciente (Atenciones):** Al registrar una atención médica (`clinical-record-form-dialog.tsx`), el autocompletado de Lote consumirá los lotes activos de `InventoryBatch` descontando el stock consumido.