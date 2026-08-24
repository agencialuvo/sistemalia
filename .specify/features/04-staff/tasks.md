# Desglose de Tareas - Módulo 04: Doctores, Especialidades y Gestión de Personal (Staff)

## Fase 1: Base de Datos y Modelado Prisma
- [x] **Task 1.1**: Actualizar `backend/prisma/schema.prisma` agregando los modelos `Specialty`, `StaffMember`, `StaffService`, `StaffSchedule` y `StaffAbsence`.
- [x] **Task 1.2**: Ejecutar `npx prisma migrate dev --name add_staff_and_specialties` para aplicar los cambios a la base de datos PostgreSQL.
- [x] **Task 1.3**: Confirmar compilación con `npx prisma generate` y validación de tipos con `npx tsc --noEmit`.

## Fase 2: Lógica Backend (NestJS)
- [x] **Task 2.1**: Crear `StaffModule`, `SpecialtiesService` y DTOs para el CRUD de `Specialty`.
- [x] **Task 2.2**: Crear DTOs de `StaffMember` (`CreateStaffDto`, `UpdateStaffDto`, `CreateAbsenceDto`) con validación de horarios y comisiones.
- [x] **Task 2.3**: Implementar `StaffMembersService` con soporte para operaciones CRUD, actualización en lote de matriz de servicios y gestión de horarios/ausencias respetando `@TenantId()`.
- [x] **Task 2.4**: Crear `StaffController` implementando los 12 endpoints requeridos en la especificación.
- [x] **Task 2.5**: Registrar `StaffModule` en `app.module.ts` y validar tipado con `npx tsc --noEmit`.

## Fase 3: Interfaz Frontend (Next.js)
- [ ] **Task 3.1**: Crear esquemas de validación Zod en `src/lib/validators/staff.ts`.
- [ ] **Task 3.2**: Crear la ruta principal `src/app/(dashboard)/personal/page.tsx` con grilla de tarjetas, filtros por especialidad y servicio.
- [ ] **Task 3.3**: Crear el modal de especialidades `src/components/staff/specialty-manager-dialog.tsx`.
- [ ] **Task 3.4**: Crear el formulario multitab de profesionales `src/components/staff/staff-form-dialog.tsx` (incluyendo selector de servicios agrupado por categoría y matriz horaria semanal).
- [ ] **Task 3.5**: Crear el modal de ausencias `src/components/staff/absence-dialog.tsx`.

## Fase 4: Pruebas y Verificación
- [ ] **Task 4.1**: Extender `backend/scripts/smoke-test.mts` para validar la creación de especialidades, profesionales, servicios asignados y ausencias contra Postgres y Redis reales.
- [ ] **Task 4.2**: Ejecutar `npx tsc --noEmit` y `npm run build` en backend y frontend para confirmar 0 errores de compilación.