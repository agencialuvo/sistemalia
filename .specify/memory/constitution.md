# Constitución de Sistemalia

## Principios Fundamentales

### I. Aislamiento y Seguridad Multiusuario (NO NEGOCIABLE)
Todos los datos, consultas y lógica de negocio DEBEN garantizar una estricta separación entre usuarios (Seguridad a Nivel de Fila / Contexto de Usuario). No se permiten fugas de datos entre usuarios. Los datos confidenciales de los pacientes (historial médico, fotos, consentimientos informados) deben estar cifrados tanto en reposo como en tránsito, cumpliendo con los estándares de protección de datos sanitarios.

### II. Arquitectura Monolítica Modular
El backend principal debe construirse como un monolito modular utilizando NestJS. Los módulos (Agenda, Membresías, Historial Médico, WhatsAppBot, Finanzas) deben permanecer débilmente acoplados con límites claros. Se deben utilizar eventos de dominio y colas (BullMQ/Redis) para efectos secundarios asíncronos (por ejemplo, envío de recordatorios, procesamiento de pagos de suscripciones recurrentes).

### III. Desarrollo basado en contratos y desarrollo basado en pruebas (TDD)
Los contratos de API, los esquemas de Prisma y las interfaces de TypeScript deben definirse antes de la implementación. La lógica de negocio principal (deducción de cuotas de membresía, detección de conflictos de citas, comisiones automatizadas y facturación recurrente) DEBE seguir un TDD estricto: se deben escribir pruebas unitarias/de integración y verificar que fallen antes de que se confirme el código de la funcionalidad.

### IV. Resiliencia en WhatsApp e integraciones asíncronas
Todas las comunicaciones con terceros (API de WhatsApp, pasarelas de pago, API de Claude) deben gestionarse de forma asíncrona mediante colas de mensajes resilientes (BullMQ + Redis) con estrategias de reintento explícitas, retrocesos exponenciales y colas de mensajes no entregados (DLQ). El sistema nunca debe bloquear las operaciones de los usuarios debido a la latencia o las interrupciones del servicio externo.

### V. Auditabilidad y trazabilidad
Cada transacción financiera (cargos de membresía, comisiones), edición de historial médico y cambio de cita DEBE generar una entrada inmutable en el registro de auditoría. Los formularios de consentimiento del paciente y las fotos del historial médico requieren un sellado de tiempo a prueba de manipulaciones y un almacenamiento seguro de objetos (S3/Cloudflare R2 con URL firmadas).

## Tecnología y restricciones

### Frontend
- **Framework**: Next.js 14+ (App Router, Server Actions, React Server Components).

- **Estilo e interfaz de usuario**: TailwindCSS, Shadcn UI, Radix UI.

- **Obtención de estado y datos**: TanStack Query (React Query) para el estado del lado del cliente y el almacenamiento en caché.

### Backend y API
- **Framework**: NestJS (TypeScript) con arquitectura modular.

- **Base de datos**: PostgreSQL con Prisma ORM. Seguridad a nivel de fila / Middleware de inquilino implementado.

- **Almacenamiento en caché y colas**: Redis + BullMQ (tareas programadas, notificaciones con retraso, reintentos de facturación).
- **Agente de IA**: API Claude (3.5 Sonnet / Haiku) para reservas en lenguaje natural y atención al cliente automatizada a través de WhatsApp.

- **Mensajería**: API Meta WhatsApp Business Cloud / API Evolution.

- **Pagos**: Stripe (Suscripciones/Membresías) y Mercado Pago (Pagos recurrentes en Latinoamérica / Tarjetas locales).

### Almacenamiento e Infraestructura
- **Almacenamiento**: Cloudflare R2 / AWS S3 (Consentimientos informados, fotos de progreso, historiales médicos mediante URL firmadas de corta duración).

- **Alojamiento/Despliegue**: Contenedores Docker, Vercel/Cloudflare (Frontend), AWS / Railway / Render (Backend y Redis).

## Flujo de trabajo de desarrollo y controles de calidad

### 1. Cumplimiento de la especificación
Ninguna funcionalidad o tarea se desarrollará sin una Especificación aprobada (`spec.md`) y un Plan de implementación (`plan.md`) generados mediante el proceso Spec Kit. Claude y los desarrolladores humanos deben cumplir con las tareas definidas en `tasks.md`.

### 2. Calidad y formato del código
- TypeScript estricto (`strict: true`). No se permiten tipos `any` en la lógica de dominio ni en los contratos de la API.

- Las reglas de ESLint y Prettier deben superarse antes de que se fusione cualquier solicitud de extracción (Pull Request).

- Las solicitudes de extracción deben incluir la cobertura de pruebas para los nuevos endpoints o cambios en la lógica de negocio.

### 3. Migraciones de bases de datos
- Todos los cambios en la base de datos deben ejecutarse mediante Prisma Migrations.

- Los scripts de migración destructivos en bases de datos de producción están estrictamente prohibidos sin un plan de reversión y una copia de seguridad de los datos.

## Gobernanza

- Esta Constitución prevalece sobre cualquier otra documentación, comentario o convención informal dentro del proyecto.

- Las modificaciones a esta Constitución requieren una justificación explícita, un número de versión actualizado y una aprobación arquitectónica documentada.

- Los agentes de IA (Claude Code, Cursor) que lean este repositorio DEBEN aplicar estos principios durante los procesos de generación, refactorización y revisión del código.

**Versión**: 1.0.0 | **Ratificado**: 18/08/2026 | **Última modificación**: 18/08/2026