# Plan de Implementación - Módulo 06: Engine de Reservas y Agenda

## 1. Arquitectura de Interfaz (Agenda Interactiva)
La vista `/agenda` estará compuesta por:

1. **Barra de Herramientas Principal:**
   * Selector de fecha (Día, Semana, Mes).
   * Filtros por Especialista, Cabina/Sala y Estado de la Cita.
   * Botón de **"+ Nueva Cita"**.

2. **Grid / Calendario Operativo:**
   * **Vista Diaria por Columnas:** Cada columna representa a un profesional o cabina.
   * **Bloques de Citas:** Tarjetas con código de color según estado (`CONFIRMED` = Verde, `PENDING` = Amarillo, `IN_SERVICE` = Azul, etc.).
   * **Drag & Drop / Resizing:** Posibilidad de arrastrar una cita para reagendarla en tiempo real.

3. **Drawer / Modal de Nueva Cita (Wizard Express):**
   * Paso 1: Selección o creación rápida de Paciente (DNI/Nombre).
   * Paso 2: Selección de Servicio (autocompleta duración y precio).
   * Paso 3: Asignación de Profesional y selección de Slot libre en tiempo real.
   * Paso 4: Confirmación y notas de la reserva.

## 2. Integración con el Expediente del Paciente
- Al marcar una cita como `COMPLETED`, se genera automáticamente la opción de **"Registrar Atención Clínica"**, redirigiendo a la Ficha 360° del Paciente con la plantilla seleccionada.
- Conexión del **Tab 3 (Historial de Citas)** en la Ficha 360° del Paciente para reemplazar el *placeholder* por la línea de tiempo real.