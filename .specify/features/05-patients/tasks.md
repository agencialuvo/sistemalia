# Lista de Tareas - Módulo 0: Gestión de Pacientes

## Fase 1: Base de Datos y Backend Core
- [ ] **Task 1.1:** Actualizar `prisma/schema.prisma` con modelos `Patient`, `PatientMedicalHistory`, `PatientClinicalNote`, `PatientGalleryImage` y `PatientConsent`.
- [ ] **Task 1.2:** Generar y ejecutar la migración de Prisma `20260828_add_patients_module`.
- [ ] **Task 1.3:** Crear DTOs de validación con Zod/class-validator para paciente, búsqueda y notas.
- [ ] **Task 1.4:** Crear `PatientsService` y `PatientsController` con aislamiento `tenantId` y CRUD completo.
- [ ] **Task 1.5:** Implementar endpoint de importación masiva por Excel/CSV.

## Fase 2: Frontend & Formulario de Paciente
- [ ] **Task 2.1:** Configurar tipos y API Client en frontend (`src/lib/api/patients.ts`).
- [ ] **Task 2.2:** Crear la página principal `/pacientes` con tabla paginada, filtros y estados.
- [ ] **Task 2.3:** Crear modal de alta/edición rápida de paciente (`patient-form-dialog.tsx`).
- [ ] **Task 2.4:** Crear modal de importación masiva en lote (`patient-import-dialog.tsx`).

## Fase 3: Ficha 360° & Expediente Clínico
- [ ] **Task 3.1:** Crear vista/drawer de Ficha 360° del paciente (`patient-detail-view.tsx`).
- [ ] **Task 3.2:** Implementar tab de Antecedentes Médicos y Alergias.
- [ ] **Task 3.3:** Implementar tab de Notas Clínicas (Timeline de evoluciones).
- [ ] **Task 3.4:** Implementar Galería de Fotos (Comparador "Antes / Después").
- [ ] **Task 3.5:** Actualizar diccionario de i18n (`messages/es.json`) y ejecutar verificación de tipos `tsc`.

Task 3.6: Migración Prisma para ClinicalFormTemplate y ClinicalProcedureRecord.

Task 3.7: Implementar visor/editor de Mapeo Facial Interactivo en la Ficha 360° del paciente.

Task 3.8: Implementar el módulo de Firma Digital de Consentimiento Informado (Ley N° 29733 de Protección de Datos Personales en Perú).