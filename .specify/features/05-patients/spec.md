# Spec - Módulo 05: Gestión de Pacientes y CRM Operativo

## 1. Visión General
El Módulo de Pacientes proporciona un expediente 360° para la gestión centralizada de datos personales, historial médico/estético, notas evolutivas, galería de tratamientos (Antes/Después) y consentimientos informados de los clientes de la clínica.

## 2. Modelos de Datos (Prisma)
- **Patient**: Entidad principal con aislamiento estricto por `tenantId`, índices de búsqueda por documento, teléfono e email.
- **PatientMedicalHistory**: Antecedentes (alergias, condiciones, medicamentos, grupo sanguíneo, contacto de emergencia).
- **PatientClinicalNote**: Evolución y notas clínicas del equipo médico por cita o consulta.
- **PatientGalleryImage**: Registro fotográfico clasificado (`BEFORE`, `AFTER`, `PROGRESS`).
- **PatientConsent**: Control de documentos y firmas digitales de consentimiento.

## 3. Contratos de API (Endpoints)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/patients` | Listado paginado con búsqueda rápida (nombre, DNI, teléfono) y filtros por tags/status |
| `POST` | `/patients` | Crear un nuevo expediente de paciente |
| `GET` | `/patients/:id` | Obtener la Ficha 360° completa de un paciente |
| `PATCH` | `/patients/:id` | Actualizar datos personales o estado |
| `DELETE` | `/patients/:id` | Inactivado/Archivado lógico de un paciente |
| `GET/PUT` | `/patients/:id/medical-history` | Consultar o actualizar antecedentes médicos |
| `POST` | `/patients/:id/notes` | Registrar una nueva nota clínica o evolución |
| `POST` | `/patients/:id/gallery` | Registrar/Cargar foto de galería (Antes/Después) |
| `POST` | `/patients/import` | Importación masiva de pacientes mediante archivo Excel/CSV |



Adición del apartado "Cumplimiento Regulatorio MINSA NTS N° 139" en la Historia Clínica Madre.

Especificación del motor de plantillas dinámicas (JSON Schema para campos personalizados).

Contrato de trazabilidad de insumos (Lote, Vencimiento y Registro Sanitario DIGEMID).