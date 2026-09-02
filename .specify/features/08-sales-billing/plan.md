# Plan de Implementación UI/UX - Módulo 08: Ventas y Caja Chica

## 1. Estructura de Navegación (`/ventas`)

Ubicación en Menú Lateral: **Gestión Operativa > Ventas y Caja** (`/ventas`).

### Pestañas Principales:
1. **Pestaña 1: Punto de Venta / Cobro Rápidos (`/ventas?tab=pos`)**
   * Panel izquierdo: Selección de Paciente, Cita Pendiente de Pago o Adición de Productos/Servicios al carrito.
   * Panel derecho: Summary de la Venta, Tipo de Comprobante (Boleta, Factura, Nota de Venta), Datos de SUNAT (DNI/RUC) y Medios de Pago (Split Payment: ej. Yape + Efectivo).
   * Botón principal: **"Procesar Cobro e Imprimir"**.

2. **Pestaña 2: Historial de Ventas (`/ventas?tab=history`)**
   * Tabla con listado de ventas realizadas, filtro por comprobante, cliente y estado (`PAID`, `ANULLED`).
   * Visualizador de Ticket/Comprobante listo para imprimir o enviar por WhatsApp.

3. **Pestaña 3: Caja Chica y Arqueo (`/ventas?tab=cash-register`)**
   * Estado actual de la caja (Abierta/Cerrada).
   * Desglose de ingresos por medio de pago (Efectivo en mano, Yape/Plin, Pos/Tarjeta, Transferencias).
   * Formulario para registrar Ingresos/Egresos manuales (ej. Pago de movilidad, compra de insumo menor).
   * Modal de **Arqueo y Cierre de Caja** con cálculo de descuadre.

## 2. Componentes Clave
- `open-cash-dialog.tsx`: Modal para apertura de caja exigiendo monto inicial.
- `close-cash-dialog.tsx`: Modal de conteo de efectivo y cierre con reporte visual.
- `pos-checkout-card.tsx`: Componente de cobro interactivo con calculadora de vuelto y multipago.
- `invoice-receipt-modal.tsx`: Modal con vista previa del comprobante en formato Ticket 80mm listo para imprimir.