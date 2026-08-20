---

### 2. Desglose de Tareas Executables (`.specify/features/02-tenant/tasks.md`)[cite: 4]

```markdown
# TASK LIST: Feature 02 - Tenant Onboarding & Multi-Tenant Provisioning

## Fase 1: Base de Datos y Modelado Multi-Tenant (Backend - Prisma)
- [x] **Task 1.1**: Actualizar `schema.prisma` agregando los enums (`TenantIdentityType`, `TaxIdType`, `SpecialtyCategory`, `TenantRole`) y los modelos `Tenant`, `Branch`, `BranchWorkingHour` y `TenantUser` (relación M:N entre User y Tenant). Ejecutar migración `add_tenant_onboarding`.

## Fase 2: Servicios y Endpoints Backend (NestJS)
- [x] **Task 2.1**: Implementar `SunatService` y endpoint `GET /api/v1/tax/sunat/:ruc` con validación de algoritmo Módulo 11, consulta externa (o mock en dev) y almacenamiento en caché de Redis (`sunat:ruc:{ruc}`) por 24 horas.
- [x] **Task 2.2**: Implementar `UploadService` y endpoint `POST /tenant/upload-logo` para procesar y almacenar el logotipo de la clínica en S3/R2 (o almacenamiento local en dev) con límite de 5MB y filtro de tipos MIME.
- [x] **Task 2.3**: Implementar `TenantService.createTenant()` ejecutando una transacción atómica de Prisma (`$transaction`):
  1. Crear `Tenant`.
  2. Crear `Branch` principal con Ubigeo.
  3. Insertar registros `BranchWorkingHour` para los 7 días de la semana.
  4. Vincular el usuario actual en `TenantUser` con rol `ADMIN_OWNER`.
  5. Invalidar el borrador/caché de onboarding en Redis.
- [x] **Task 2.4**: Implementar el decorador `@TenantId()` y el Guard/Interceptor de aislamiento multi-tenant para validar la membresía del usuario en las peticiones HTTP subsiguientes.

## Fase 3: Interfaz de Usuario e Integración (Frontend - Next.js 14)
- [x] **Task 3.1**: Crear esquemas de validación Zod (`tenantOnboardingSchema`) en `src/lib/validators/tenant.ts` y archivo de datos de Ubigeos de Perú (`ubigeo-peru.json`).
- [x] **Task 3.2**: Construir el componente del Paso 1 (`Step1Identity`): Tipo de Identidad, Tipo Contribuyente, RUC con botón "Consultar RUC" de auto-llenado y Nombres Comercial/Legal.
- [x] **Task 3.3**: Construir el componente del Paso 2 (`Step2BranchHours`): Datos de Sede Principal, Selectores de Ubigeo en cascada, WhatsApp oficial y matriz de días/horarios de atención con botón "Aplicar a todos".
- [x] **Task 3.4**: Construir el componente del Paso 3 (`Step3Branding`): Drag & Drop de Logotipo con preview y selector de Rubro/Especialidad Principal.
- [x] **Task 3.5**: Integrar el Onboarding Wizard en `/onboarding` con persistencia de paso activo en LocalStorage/Redis y conectar el envío final con `POST /tenant/onboarding`.
- [x] **Task 3.6**: Actualizar `src/middleware.ts` para que los usuarios autenticados sin un `Tenant` activo o con onboarding incompleto sean redirigidos obligatoriamente a `/onboarding` al intentar acceder a `/dashboard`.