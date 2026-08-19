# TASK LIST: Feature 01 - Autenticación y Registro Multi-Tenant

## Fase 1: Base de Datos y Modelado (Backend - NestJS & Prisma)
- [x] **Task 1.1**: Configurar modelo `User` y `RefreshToken` en `schema.prisma` con estados (`ACTIVE`, `PENDING_VERIFICATION`), proveedores (`LOCAL`, `GOOGLE`) y ejecutar migración inicial.
- [x] **Task 1.2**: Implementar `RedisModule` en NestJS para gestión de claves OTP con TTL (expiración automática de 15 min).

## Fase 2: Lógica de Autenticación y API (Backend - NestJS)
- [x] **Task 2.1**: Crear `RegisterDto` con validaciones estricta de contraseña (mayúscula, minúscula, número, min 8 chars) y validador personalizado para correos desechables (`yopmail`, `mailinator`, etc.).
- [x] **Task 2.2**: Implementar `RecaptchaGuard` para validar token de Google reCAPTCHA v3 con score >= 0.5.
- [x] **Task 2.3**: Desarrollar en `AuthService` el flujo de registro local: creación de usuario en estado `PENDING_VERIFICATION`, generación de OTP de 6 dígitos en Redis y encolado de correo.
- [x] **Task 2.4**: Crear endpoint `/auth/verify-otp` para validar código de 6 dígitos, activar usuario y emitir cookies HTTP-Only de Access Token (15m) y Refresh Token (7d).
- [x] **Task 2.5**: Configurar `PassportGoogleStrategy` y endpoint de callback para autenticación y vinculación directa con Google OAuth2.
- [x] **Task 2.6**: Implementar flujo seguro de recuperación de contraseña (anti-enumeración de usuarios + token temporal en Redis).

## Fase 3: Interfaz de Usuario y Formularios (Frontend - Next.js 14)
- [x] **Task 3.1**: Configurar esquemas de validación Zod en Next.js para formularios de Login, Registro, OTP y Recuperación de Contraseña.
- [x] **Task 3.2**: Crear la vista de Registro (`/register`) con Shadcn UI e integración transparente de Google reCAPTCHA v3.
- [x] **Task 3.3**: Crear la vista de Verificación OTP (`/verify-otp`) con casilla de 6 dígitos (Input OTP component) y botón de reenvío con temporizador.
- [x] **Task 3.4**: Crear la vista de Inicio de Sesión (`/login`) con soporte para credenciales tradicionales y botón "Continuar con Google".
- [x] **Task 3.5**: Configurar cliente Axios con interceptor para manejo automático de refresco de tokens (`Refresh Token`) y re-direccionamiento en expiración de sesión.

> **Nota de rutas (actualizada — cutover ejecutado):** las vistas se publicaron inicialmente bajo `/auth/*` para no pisar el flujo Supabase en vivo. Por decisión explícita del usuario, se hizo el corte: `src/app/(auth)/login/page.tsx` y `src/app/(auth)/forgot-password/page.tsx` (Supabase) fueron **sobrescritos** con las vistas NestJS, y se agregaron `src/app/(auth)/register`, `verify-otp`, `reset-password` en el mismo route group. `/signup` (Supabase) se dejó intacto — el registro nuevo vive en `/register`. `src/app/auth/*` fue eliminado. **Pendiente:** `middleware.ts` sigue gateando `/dashboard`, `/onboarding` y demás rutas protegidas únicamente con la sesión de Supabase (`supabase.auth.getUser()`); no reconoce las cookies JWT que emite el backend NestJS. Un usuario que complete login/verify-otp por el nuevo flujo será rebotado a `/login` por el middleware al intentar entrar a esas rutas — corregir esto es parte del trabajo de integración (probablemente junto con Módulo 02).

## Fase 2.1: Cierre de Backend Auth (endpoints faltantes identificados en Fase 3)
- [x] **Task 2.1.1**: `POST /auth/login` — valida credenciales `LOCAL` con `argon2.verify()`, rechaza `GOOGLE`/inexistentes con 401, rechaza `PENDING_VERIFICATION` con 403, emite cookies de sesión si `ACTIVE`.
- [x] **Task 2.1.2**: `POST /auth/refresh` — lee la cookie `refresh_token`, valida el JWT y su hash contra `RefreshToken` en Prisma (`revoked: false`, no expirado), rota el token (revoca el viejo, emite un par nuevo).
- [x] **Task 2.1.3**: `POST /auth/resend-otp` — reenvía OTP a un usuario `PENDING_VERIFICATION` con cooldown de 60s en Redis, limpiando el contador de intentos previo.

## Fase 2.2: Validación E2E contra Postgres/Redis reales
- [x] **Infra**: `backend/docker-compose.yml` (Postgres 16 en `:5434`, Redis 7 en `:6380` — puertos no-default porque el host ya tenía `velia-postgres`/`velia-redis` y un Postgres nativo ocupando 5432/5433/6379). `backend/.env.example` actualizado para apuntar a estos puertos.
- [x] **Migración real**: `npx prisma migrate dev --name init_auth` aplicada contra Postgres real (`prisma/migrations/20260818235459_init_auth/`). Tablas `User` y `RefreshToken` verificadas con `psql \dt`.
- [x] **Smoke test**: [`backend/scripts/smoke-test.sh`](../../../backend/scripts/smoke-test.sh) — register → lee OTP real de Redis → verify-otp → login → refresh, más 2 casos negativos (password incorrecta, registro duplicado). 8/8 checks, corrido 4 veces consecutivas sin fallos.
- [x] **Bug real encontrado y corregido**: `AuthService.issueTokens()` podía generar el mismo JWT de refresh (mismo payload + mismo `iat` de resolución de 1s) si se emitían dos tokens para el mismo usuario dentro del mismo segundo (ej. verify-otp seguido de login inmediato) → mismo hash SHA-256 → choque con `RefreshToken.tokenHash @unique` → `500 Internal Server Error`. Corregido agregando un `jti` aleatorio (`randomBytes(16)`) al payload del refresh token.

## Fase 2.3: middleware.ts consciente de sesión NestJS + smoke test en TS
- [x] **`src/middleware.ts`**: rutas protegidas (`/dashboard`, `/onboarding`, etc.) ahora dejan pasar si existe cookie `access_token` o `refresh_token` de NestJS, además del chequeo Supabase existente (coexistencia — cualquiera de las dos sesiones basta). Es un chequeo de **presencia**, no de firma/expiración — la validación criptográfica real la sigue haciendo el backend NestJS en cada request. El gate de onboarding (`get_my_tenant_id()`) sigue siendo exclusivo de sesiones Supabase; falta su equivalente para sesiones NestJS (Módulo 02). 8/8 tests de `middleware.test.ts` siguen pasando.
- [x] **`backend/scripts/smoke-test.mts`**: versión Node/TS del smoke test (corre directo con `node scripts/smoke-test.mts`, sin build — usa el type-stripping nativo de Node 24). Mismos 9 checks que la versión bash, más verificación explícita de que el refresh token viejo queda `revoked=true` en Postgres tras la rotación. Corrido 2 veces consecutivas, 9/9 ambas.
- [x] **Fix de build encontrado**: agregar `scripts/` al mismo directorio que `src/` sin acotar el `tsconfig.json` de Nest rompía `nest build` (`tsc` incluía `scripts/**` y `dist/main.js` pasaba a `dist/src/main.js`, dejando el punto de entrada del `Dockerfile`/`npm start` roto). Corregido con `"include": ["src/**/*"]` en `backend/tsconfig.json`.
