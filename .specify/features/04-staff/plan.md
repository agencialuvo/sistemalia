# Plan de Arquitectura - Módulo 04: Doctores, Especialidades y Gestión de Personal (Staff)

## 1. Arquitectura de Base de Datos (Prisma)
- Agregar `Specialty`, `StaffMember`, `StaffService`, `StaffSchedule` y `StaffAbsence` al archivo `backend/prisma/schema.prisma`.
- Relacionar `Specialty` con `Tenant` (1:N) y `StaffMember` (1:N).
- Relacionar `StaffMember` con `Tenant` (1:N), `User` (1:1 opcional), `StaffService` (1:N), `StaffSchedule` (1:N) y `StaffAbsence` (1:N).
- Relacionar `StaffService` con `Service` (1:N) con borrado en cascada si se elimina la vinculación.
- Aplicar restricción de unicidad `@@unique([tenantId, name])` en `Specialty`.
- Generar y aplicar migración en PostgreSQL.

## 2. Arquitectura Backend (NestJS)
- Crear módulo `StaffModule` en `backend/src/modules/staff/`.
- Componentes:
  - `StaffController`: Endpoints REST expuestos bajo `/staff` con `@UseGuards(JwtAuthGuard)` y `@TenantId()`.
  - `StaffService`: Lógica CRUD de miembros del personal, matriz de servicios, horarios y ausencias.
  - `SpecialtiesService`: Lógica CRUD de especialidades.
  - DTOs (`create-staff.dto.ts`, `update-staff.dto.ts`, `create-specialty.dto.ts`, `create-absence.dto.ts`).
  - Serialización explícita de valores `Decimal` (`commissionPercentage`) a string formateado.

## 3. Arquitectura Frontend (Next.js)
- Ruta: `src/app/(dashboard)/personal/page.tsx`
- Componentes:
  - `src/components/staff/staff-header.tsx`: Cabecera y acciones.
  - `src/components/staff/staff-grid.tsx`: Grilla de tarjetas de profesionales.
  - `src/components/staff/staff-form-dialog.tsx`: Modal multitab para crear/editar profesional (Datos, Servicios, Horario).
  - `src/components/staff/specialty-manager-dialog.tsx`: Modal para CRUD de especialidades.
  - `src/components/staff/absence-dialog.tsx`: Modal para gestionar ausencias/vacaciones.
- Estado & Hooks:
  - `src/hooks/use-staff.ts`: Hook de consumo de la API con manejo de estado.
- Esquemas de validación Zod:
  - `src/lib/validators/staff.ts`: `staffSchema`, `specialtySchema` y `absenceSchema`.

## 4. Estrategia de Pruebas
- Pruebas e2e integradas en `backend/scripts/smoke-test.mts` agregando:
  - Creación de especialidades.
  - Alta de profesionales con servicios asignados del Módulo 03.
  - Asignación de horarios semanales.
  - Registro y eliminación de ausencias.
  - Aislamiento estricto por Tenant.