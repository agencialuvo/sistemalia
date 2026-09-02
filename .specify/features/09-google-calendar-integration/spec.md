# Spec - Módulo 09: Integración con Google Calendar Jerárquico (1-Clic estilo Metricool)

## 1. Visión General
El Módulo 09 sincroniza la Agenda (Módulo 06) con Google Calendar mediante una conexión de **1-clic** a nivel de tenant: el dueño del centro autoriza una sola vez con OAuth2 y el sistema crea/mantiene una jerarquía de calendarios en la cuenta de Google conectada — un **calendario padre** con la agenda completa del centro y un **calendario hijo por profesional** con solo sus propias citas. Cada `Appointment` se refleja como un evento en ambos calendarios (padre + hijo del profesional asignado), manteniéndose sincronizado en creación, reprogramación y cancelación.

Los tokens OAuth2 (access/refresh) se guardan **encriptados en reposo** — nunca en texto plano — porque otorgan acceso de escritura al Google Calendar del usuario.

## 2. Modelo de Datos (Prisma)

### Campos nuevos en `Tenant`
- `googleAccessToken` (String?): access token de Google, **encriptado con AES-256-GCM** antes de persistir (ver §3.1). Vive poco (~1h) pero igual se encripta por defensa en profundidad.
- `googleRefreshToken` (String?): refresh token de Google, **encriptado con AES-256-GCM**. De larga duración — es el secreto más sensible del módulo, ya que por sí solo permite reobtener access tokens indefinidamente.
- `googleCalendarParentId` (String?): id del calendario padre en Google Calendar (creado por el sistema en Fase 3, "Calendario LIA — {commercialName}").
- `googleSyncEnabled` (Boolean, default false): interruptor maestro — si es `false`, `AppointmentsService` no debe intentar ninguna llamada a Google, sin importar si hay tokens guardados (permite pausar la sincronización sin desconectar la cuenta).

### Campos nuevos en `StaffMember`
- `googleCalendarChildId` (String?): id del calendario hijo de este profesional dentro de la cuenta de Google conectada por el tenant. Null hasta que Fase 3 lo aprovisiona.
- `googleEmail` (String?): correo Google del profesional — informativo hoy (a futuro podría usarse para compartir el calendario hijo directamente con él).

### Campos nuevos en `Appointment`
- `googleParentEventId` (String?): id del evento espejo en el calendario padre.
- `googleChildEventId` (String?): id del evento espejo en el calendario hijo del profesional asignado.

Ningún campo nuevo es obligatorio ni tiene default distinto de lo listado — un tenant que nunca conecta Google sigue funcionando exactamente igual que hoy (todos los campos quedan `null`/`false`).

## 3. Reglas de Negocio & Algoritmos

### 3.1 Encriptación de tokens (Fase 1)
- Todo texto que se escriba en `Tenant.googleAccessToken`/`googleRefreshToken` pasa antes por `EncryptionService.encrypt()`; toda lectura pasa por `EncryptionService.decrypt()`. Ningún otro servicio del backend maneja estos campos en crudo.
- Algoritmo: **AES-256-GCM** (autenticado — detecta manipulación del dato cifrado, no solo lo oculta).
- La clave de 32 bytes sale de la variable de entorno `GOOGLE_TOKEN_ENCRYPTION_KEY` (hex de 64 caracteres). Igual que `JWT_SECRET`/`RECAPTCHA_SECRET_KEY`, si falta en desarrollo el servicio no debe tumbar el arranque: cae a una clave derivada de un valor fijo (con `Logger.warn`), pero en producción (`NODE_ENV=production`) debe fallar rápido si la variable no está — un token de Google guardado con la clave de desarrollo por error es un incidente de seguridad.
- Formato persistido: `iv:authTag:ciphertext` (todo en hex, separado por `:`) para que la fila sea auto-contenida — no depende de una tabla de IVs aparte.

### 3.2 Interruptor de sincronización
- `googleSyncEnabled` controla si `AppointmentsService` (Fase 3) intenta reflejar una cita en Google. Se apaga automáticamente si Google revoca el acceso (refresh token inválido) — no está en el alcance de Fase 1, pero el campo ya nace pensado para eso.

### 3.3 Jerarquía de calendarios (implementación en Fase 3, modelada desde Fase 1)
- 1 calendario padre por tenant = todas las citas de todos los profesionales.
- 1 calendario hijo por `StaffMember` = solo las citas de ese profesional.
- Una `Appointment` nunca se refleja en Google sin profesional asignado (el modelo ya exige `staffMemberId` no-nulo desde el Módulo 06).

## 4. Fases de Implementación
1. **Fase 1 — Base de Datos y Encriptación** (este documento cubre su alcance completo): campos de schema arriba listados, migración, `EncryptionService` (AES-256-GCM) en `backend/src/common/services/`.
2. **Fase 2 — OAuth2 del backend**: flujo de autorización separado del login (`GoogleStrategy` existente en `auth/` es solo para "Continuar con Google" con scopes `email profile`; este módulo necesita scope `https://www.googleapis.com/auth/calendar` + `access_type=offline` para obtener refresh token), endpoints para iniciar conexión, callback, estado de conexión y desconexión.
3. **Fase 3 — Motor de sincronización y UI**: aprovisionamiento de calendario padre/hijos, espejado de citas (crear/reprogramar/cancelar) enganchado a `AppointmentsService`, pantalla en Ajustes para conectar/desconectar y ver el estado por profesional.

## 5. Fuera de Alcance (Fase 1)
- Cualquier llamada real a la API de Google Calendar (Fase 2/3).
- UI de conexión en el frontend (Fase 3).
- Reintentos/backoff ante fallas de Google o revocación de tokens (Fase 3).
