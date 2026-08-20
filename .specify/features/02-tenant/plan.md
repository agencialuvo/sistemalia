# IMPLEMENTATION PLAN: Feature 02 - Tenant Onboarding & Multi-Tenant Provisioning

## 1. Arquitectura & Stack Tecnológico Específico

### Backend (NestJS API & Data Layer)
- **Modelado Prisma**: Modelos `Tenant`, `Branch`, `BranchWorkingHour`, y la tabla de unión `TenantUser` (soporte para roles `OWNER`, `ADMIN`, `MEMBER`).
- **SUNAT Integration Service**: Módulo `SunatModule` con `SunatService` con soporte de caché Redis (`sunat:ruc:{ruc}`) de TTL 24h y fallback resiliente para ingreso manual en caso de indisponibilidad externa.
- **Multi-Tenant Context Guard & Interceptor**:
  - `TenantContextInterceptor`: Extrae el `x-tenant-id` del header o la cookie activa y la inyecta en la request (`req.tenantId`).
  - Update al `src/middleware.ts` del Frontend para validar el estado de Onboarding antes de permitir acceso a `/dashboard`.
- **Media Uploading**: Módulo de subida de archivos (Logotipo) a Cloudflare R2 / AWS S3 usando `@aws-sdk/client-s3` con validación estricta de MIME type (`image/png`, `image/jpeg`, `image/webp`) y límite de 5MB.
- **Seeding de Inicialización**: Transaction de Prisma (`$transaction`) que atomiza la creación de `Tenant`, `Branch`, `BranchWorkingHour`, vinculación `TenantUser` y sembrado de plantillas según el `SpecialtyCategory`.

### Frontend (Next.js 14 Web App)
- **Ruta de Onboarding Wizard**: `/onboarding` con wizard de 3 pasos y estado persistido en Redis/LocalStorage.
- **Componentes Formulario**: React Hook Form + Zod (`tenantOnboardingSchema`), Shadcn UI (Select, Switch, InputOTP, FileUpload, Multi-select/Checkboxes para días laborables).
- **Ubigeo Selector**: Dataset ligero de Ubigeos del Perú (Departamento -> Provincia -> Distrito).

---

## 2. Estructura de Directorios

```text
sistemalia/
├── backend/
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/ (tenant.decorator.ts)
│   │   │   └── guards/ (tenant.guard.ts)
│   │   ├── modules/
│   │   │   ├── sunat/ (sunat.controller.ts, sunat.service.ts)
│   │   │   ├── upload/ (upload.controller.ts, upload.service.ts)
│   │   │   └── tenant/
│   │   │       ├── dto/ (create-tenant.dto.ts, query-ruc.dto.ts)
│   │   │       ├── tenant.controller.ts
│   │   │       └── tenant.service.ts
│   └── prisma/
│       └── schema.prisma (Modelos Tenant, Branch, BranchWorkingHour, TenantUser)
└── frontend/
    ├── src/
    │   ├── app/
    │   │   └── onboarding/page.tsx
    │   ├── components/onboarding/
    │   │   ├── step1-identity.tsx
    │   │   ├── step2-branch-hours.tsx
    │   │   └── step3-branding.tsx
    │   └── lib/
    │       ├── data/ubigeo-peru.json
    │       └── validators/tenant.ts