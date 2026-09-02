# Lista de Tareas - Módulo 06: Engine de Reservas y Agenda

## Fase 1: Base de Datos y Backend Core
- [x] **Task 1.1:** Definir enum `AppointmentStatus` y modelos `Appointment` / `AppointmentLog` en `prisma/schema.prisma`.
- [x] **Task 1.2:** Generar y aplicar la migración de Prisma `20260829_add_appointments_module`.
- [x] **Task 1.3:** Crear DTOs de validación (`create-appointment.dto.ts`, `query-slots.dto.ts`, `update-status.dto.ts`, etc.).
- [x] **Task 1.4:** Implementar el algoritmo de cálculo de slots libres en `AppointmentsService`.
- [x] **Task 1.5:** Crear `AppointmentsController` con CRUD, reagendamiento y consulta de disponibilidad.

## Fase 2: Frontend & Componentes de la Agenda
- [x] **Task 2.1:** Crear API client y validadores Zod (`src/lib/appointments/api.ts` y `validators/appointment.ts`).
- [x] **Task 2.2:** Construir el modal de alta rápida de citas (`appointment-form-dialog.tsx`) con buscador de slots en 4 pasos.
- [x] **Task 2.3:** Construir la página principal `/citas` con vista diaria por columnas por especialista y filtros de estado.
- [x] **Task 2.4:** Implementar modal de detalle y cambio de estado rápido (`appointment-detail-dialog.tsx`).

## Fase 3: Conexión con Paciente 360° y Verificación
- [x] **Task 3.1:** Conectar el Tab 3 (Historial de Citas) en `/pacientes/[id]` para consumir el historial real del backend.
- [x] **Task 3.2:** Integrar flujo rápido: Cita Completada -> Abrir Ficha de Atención MINSA / Form Builder con `appointmentId` vinculado.
- [x] **Task 3.3:** Verificación de tipos `tsc`, `eslint` y compilación de producción limpia en frontend y backend.