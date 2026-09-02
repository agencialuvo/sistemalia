# Spec - Módulo 06: Engine de Reservas y Agenda Interactiva

## 1. Visión General
El Módulo de Citas gestiona la programación de tratamientos en tiempo real, la disponibilidad de personal/cabinas y el flujo de atención del paciente desde la reserva inicial hasta la finalización del servicio.

## 2. Modelo de Datos (Prisma)
- **Appointment**: Cita con relaciones a `Patient`, `Staff` (Profesional), `Service`, y `Tenant`.
- **AppointmentStatus**: `PENDING`, `CONFIRMED`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
- **AppointmentResource / Room**: Opcional para control de cabinas/equipos (láser, etc.).

## 3. Algoritmo Evaluador de Slots Disponibles
El motor calcula la disponibilidad real cruzando:
1. Horario de atención del centro y turnos de trabajo del especialista (`StaffSchedule`).
2. Ausencias o bloqueos de agenda del profesional (`StaffBlockout`).
3. Citas existentes (`Appointment` activas).
4. Duración del servicio + Tiempos de limpieza/preparación (*buffer times*).

## 4. Contratos de API (Endpoints)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/appointments` | Listado de citas por rango de fechas, profesional o estado |
| `POST` | `/appointments` | Crear una nueva cita (reserva) |
| `GET` | `/appointments/slots` | Consultar slots/horarios disponibles para un servicio y profesional |
| `PATCH` | `/appointments/:id/status` | Cambiar el estado de la cita (ej. Confirmar, Iniciar, Completar, No Show) |
| `PATCH` | `/appointments/:id/reschedule` | Reagendar cita (actualizar fecha/hora/staff) |
| `DELETE` | `/appointments/:id` | Cancelar cita con motivo |