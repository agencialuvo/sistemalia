# Spec - Módulo 04: Doctores, Especialidades y Gestión de Personal (Staff)

## Contexto y Visión
El módulo de Staff gestiona el perfil de los profesionales médicos, estéticos y personal operativo de la clínica. Define quiénes están capacitados para ejecutar cada servicio del catálogo, sus matrículas/licencias médicas, sus horarios de atención semanal, excepciones/ausencias y sedes asignadas. Esta información es crucial para que el motor de agendamiento y el Agente de IA coordinen citas sin solapamientos.

---

## 1. Entidades y Estructura de Datos (Prisma)

### 1.1 `Specialty`
Especialidades médicas o estéticas (ej: "Dermatología", "Medicina Estética", "Cosmiatría", "Enfermería").
- `id`: String (UUID) - Primary Key
- `tenantId`: String - Foreign Key (Tenant)
- `name`: String - Nombre de la especialidad
- `description`: String? - Descripción opcional
- `isActive`: Boolean (default: `true`)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 1.2 `StaffMember`
Perfil del profesional o especialista de la clínica. Puede estar vinculado opcionalmente a un usuario del sistema (`User`).
- `id`: String (UUID) - Primary Key
- `tenantId`: String - Foreign Key (Tenant)
- `userId`: String? - Foreign Key (`User`) - Opcional si el doctor tiene acceso al sistema
- `specialtyId`: String? - Foreign Key (`Specialty`)
- `firstName`: String - Nombre
- `lastName`: String - Apellido
- `medicalLicense`: String? - Número de Colegiatura/Licencia médica
- `email`: String? - Correo de contacto
- `phone`: String? - Teléfono/WhatsApp directo
- `avatarUrl`: String? - Foto de perfil del profesional
- `biography`: Text? - Breve perfil profesional (utilizado por el Agente IA para presentar al especialista)
- `color`: String? - Código HEX para identificación visual en el calendario de citas
- `commissionPercentage`: Decimal? - Porcentaje de comisión por servicio realizado (ej: 15.00%)
- `isActive`: Boolean (default: `true`)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 1.3 `StaffService` (Tabla Intermedia)
Matriz de competencias: Qué servicios puede realizar cada profesional.
- `id`: String (UUID) - Primary Key
- `staffMemberId`: String - Foreign Key (`StaffMember`)
- `serviceId`: String - Foreign Key (`Service`)
- `customDurationMinutes`: Int? - Duración personalizada si el profesional requiere más/menos tiempo que el estándar del servicio
- `createdAt`: DateTime

### 1.4 `StaffSchedule`
Horario recurrente semanal de disponibilidad del profesional.
- `id`: String (UUID) - Primary Key
- `staffMemberId`: String - Foreign Key (`StaffMember`)
- `dayOfWeek`: Int - Día de la semana (0 = Domingo, 1 = Lunes, ..., 6 = Sábado)
- `startTime`: String - Hora inicio formato "HH:mm" (ej: "08:00")
- `endTime`: String - Hora fin formato "HH:mm" (ej: "17:00")
- `lunchStartTime`: String? - Hora inicio almuerzo/receso "HH:mm" (ej: "13:00")
- `lunchEndTime`: String? - Hora fin almuerzo/receso "HH:mm" (ej: "14:00")
- `isActive`: Boolean (default: `true`)

### 1.5 `StaffAbsence`
Excepciones puntuales al horario habitual (Vacaciones, Licencias médicas, Días libres o permisos).
- `id`: String (UUID) - Primary Key
- `staffMemberId`: String - Foreign Key (`StaffMember`)
- `reason`: String - Motivo de la ausencia (ej: "Vacaciones", "Capacitación")
- `startDate`: DateTime - Fecha y hora de inicio de la ausencia
- `endDate`: DateTime - Fecha y hora de fin de la ausencia
- `createdAt`: DateTime

---

## 2. Requerimientos Funcionales

### 2.1 Gestión de Especialidades
- CRUD de especialidades por Tenant con validación de nombre único por Tenant (`@@unique([tenantId, name])`).
- Desactivación lógica (`isActive = false`).

### 2.2 Gestión de Perfiles de Staff
- **Bloque 1: Datos Personales & Clínicos**: Nombre, apellido, especialidad, nº de colegiatura/licencia, correo, teléfono, foto de perfil, biografía y color asignado para la agenda.
- **Bloque 2: Asignación de Servicios Habilitados**: Selector múltiple con búsqueda para vincular qué servicios del módulo 03 puede ejecutar este profesional. Soporte opcional para sobreescribir la duración estándar por servicio.
- **Bloque 3: Horarios de Atención Semanal**: Grilla interactiva de Lunes a Domingo para definir turnos y pausas de almuerzo.
- **Bloque 4: Registro de Ausencias/Vacaciones**: Calendario/lista para programar rangos de fechas inactivas.

### 2.3 Vinculación Opcional con Usuarios (`User`)
- Permite enlazar un especialista existente con una cuenta de usuario del sistema para que pueda acceder a su agenda personal desde la aplicación.

---

## 3. Endpoints de Backend (NestJS)

- `GET /staff/specialties` - Listar especialidades del tenant.
- `POST /staff/specialties` - Crear especialidad.
- `PATCH /staff/specialties/:id` - Actualizar especialidad.
- `DELETE /staff/specialties/:id` - Eliminar/desactivar especialidad.
- `GET /staff` - Listar profesionales (filtros por `specialtyId`, `serviceId`, búsqueda por texto e `isActive`).
- `GET /staff/:id` - Obtener detalle completo de un profesional (incluyendo servicios asignados y horarios).
- `POST /staff` - Crear profesional (con asignación de servicios y horarios semanales).
- `PATCH /staff/:id` - Actualizar profesional, sus servicios asignados y horarios.
- `DELETE /staff/:id` - Desactivar profesional (`isActive = false`).
- `POST /staff/:id/absences` - Programar una ausencia/vacación.
- `GET /staff/:id/absences` - Listar ausencias del profesional.
- `DELETE /staff/absences/:absenceId` - Eliminar una ausencia programada.

---

## 4. Requerimientos de UI/UX (Next.js `/personal`)

1. **Header & Acciones**: Título "Gestión de Personal y Doctores", Botones: "Nuevo Profesional" y "Gestionar Especialidades".
2. **Filtros**: Búsqueda por texto, selector por especialidad, selector por servicio asignado y filtro de estado (`Activos`/`Inactivos`).
3. **Vista Principal**: Tarjetas de profesionales mostrando:
   - Avatar / Foto de perfil con badge de color identificador.
   - Nombre completo, Especialidad y Nº de Licencia Médica.
   - Cantidad de servicios asignados.
   - Resumen del horario de trabajo.
   - Menú de opciones (Editar, Gestionar Ausencias, Desactivar).
4. **Modal Formulario de Profesional (Tabs)**:
   - Tab 1: Datos Personales & Licencia
   - Tab 2: Servicios Habilitados (Checkbox list agrupado por Categoría de Servicio)
   - Tab 3: Horario Semanal (Matriz Lunes-Domingo con horarios de entrada/salida y almuerzo)
5. **Modal de Ausencias**: Calendario de fechas para definir periodos de vacaciones o permisos médicos.
