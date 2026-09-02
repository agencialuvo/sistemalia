# Plan de Implementación - Módulo 05: Gestión de Pacientes

## 1. Arquitectura Frontend (Vista 360° del Paciente)
La interfaz del paciente se dividirá en dos componentes clave:

1. **Tabla Principal (`/pacientes`):**
   - Buscador universal con debounce (Nombre, DNI, Teléfono).
   - Filtros por etiquetas (`VIP`, `Frecuente`, etc.) y estado.
   - Acciones rápidas: *Editar*, *Nueva Cita*, *Ver Ficha 360°*, *Importar Excel*.

2. **Ficha 360° del Paciente (`/pacientes/[id]` o Modal Master-Detail):**
   - **Tab 1: Resumen & Datos Personales:** Formulario de edición rápida y badges de contacto.
   - **Tab 2: Historial Médico & Alergias:** Antecedentes, contraindicaciones e información de emergencia.
   - **Tab 3: Historial de Citas:** Línea de tiempo de servicios consumidos, asistencias y no-shows.
   - **Tab 4: Notas Clínicas:** Timeline de observaciones y diagnósticos por especialista.
   - **Tab 5: Galería Antes / Después:** Visor comparativo fotográfico deslizable.

## 2. Estrategia de Importación Masiva
- Servicio de parseo en backend/frontend para validar plantillas `.xlsx` / `.csv`.
- Mapeo automático de columnas: *Nombres*, *Apellidos*, *Documento*, *Teléfono*, *Email*, *Fecha Nacimiento*, *Alergias*.
- Transacción en lote con reporte de errores por fila (ej. DNI duplicado o teléfono inválido).


Sección Mapeo Facial/Corporal: Integración de un canvas/SVG interactivo sobre el rostro/cuerpo para marcar puntos de aplicación de neurotoxina o rellenos.

Form Builder UI: Diseñador drag-and-drop simple en Configuración para que la clínica cree sus propias fichas de atención.