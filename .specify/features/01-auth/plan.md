# IMPLEMENTATION PLAN: Feature 01 - Autenticación y Registro Multi-Tenant

## 1. Arquitectura & Stack Tecnológico Específico

### Backend (NestJS API Gateway & Core)
- **Framework**: NestJS con arquitectura en módulos (`AuthModule`, `MailModule`, `RedisModule`).
- **Autenticación**: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `passport-google-oauth20`.
- **Hashing**: `argon2` para hashing seguro de contraseñas.
- **Validación de Entradas**: `class-validator` y `class-transformer` para DTOs.
- **ORM & DB**: Prisma ORM sobre PostgreSQL.
- **Caché y Colas**: `ioredis` (para almacenamiento temporal de OTPs y tokens de recuperación) + `bullmq` (para tareas asíncronas de envío de correos).

### Frontend (Next.js 14 Web App)
- **Framework**: Next.js 14+ (App Router, Server Actions, Route Handlers).
- **UI Components**: Shadcn UI (Form, Input, Button, Toast), TailwindCSS, Lucide Icons.
- **Validación de Formularios**: `react-hook-form` + `zod`.
- **Estado y Peticiones**: `@tanstack/react-query` y `axios` con interceptores para refresco automático de JWT.

---

## 2. Estructura de Directorios a Crear/Modificar

```text
sistemalia/
├── backend/ (NestJS)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── dto/ (register.dto.ts, login.dto.ts, verify-otp.dto.ts)
│   │   │   │   ├── guards/ (jwt-auth.guard.ts, recaptcha.guard.ts)
│   │   │   │   ├── strategies/ (jwt.strategy.ts, google.strategy.ts)
│   │   │   │   ├── auth.controller.ts
│   │   │   │   └── auth.service.ts
│   │   │   ├── redis/
│   │   │   └── mail/
│   │   └── prisma/
│   │       └── schema.prisma
└── frontend/ (Next.js)
    ├── src/
    │   ├── app/
    │   │   ├── (auth)/
    │   │   │   ├── login/page.tsx
    │   │   │   ├── register/page.tsx
    │   │   │   ├── verify-otp/page.tsx
    │   │   │   └── reset-password/page.tsx
    │   └── lib/
    │       ├── api.ts
    │       └── validators/auth.ts
```

---

## 3. Estrategia de Pruebas (TDD)
Unit Tests: Pruebas en NestJS (auth.service.spec.ts) para verificar expiración de OTP, hashing de Argon2 y bloqueo de correos temporales (yopmail.com, etc.).

Integration Tests: Validación de flujo JWT + Redis TTL en NestJS e interceptores en Next.js.

---

El desglose de tareas ejecutables para esta feature vive en [`tasks.md`](./tasks.md).
