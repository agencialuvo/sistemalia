# Lista de Tareas - Módulo 09: Integración con Google Calendar Jerárquico

## Fase 1: Base de Datos y Encriptación
- [ ] **Task 1.1:** Agregar campos `googleAccessToken`, `googleRefreshToken`, `googleCalendarParentId`, `googleSyncEnabled` a `Tenant`; `googleCalendarChildId`, `googleEmail` a `StaffMember`; `googleParentEventId`, `googleChildEventId` a `Appointment` en `prisma/schema.prisma`.
- [ ] **Task 1.2:** Generar y aplicar la migración de Prisma `add_google_calendar_integration`.
- [ ] **Task 1.3:** Implementar `EncryptionService` (AES-256-GCM) en `backend/src/common/services/encryption.service.ts` — `encrypt(plainText)` / `decrypt(cipherText)`, clave desde `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- [ ] **Task 1.4:** Documentar `GOOGLE_TOKEN_ENCRYPTION_KEY` en `backend/.env.example`.
- [ ] **Task 1.5:** Verificación: `npx tsc --noEmit` y `npx prisma generate` sin errores.

## Fase 2: Endpoints OAuth2 del Backend
- [ ] **Task 2.1:** Endpoint para iniciar la conexión (redirige a Google con scope `calendar` + `access_type=offline` + `prompt=consent`).
- [ ] **Task 2.2:** Endpoint de callback — intercambia el código por tokens, los encripta con `EncryptionService` y los guarda en `Tenant`.
- [ ] **Task 2.3:** Endpoint de estado de conexión (`googleSyncEnabled`, fecha de conexión, calendario padre creado o no).
- [ ] **Task 2.4:** Endpoint de desconexión (revoca el token en Google si es posible, limpia los campos en `Tenant`).
- [ ] **Task 2.5:** Verificación: `npx tsc --noEmit` y `nest build` sin errores.

## Fase 3: Motor de Sincronización y UI
- [ ] **Task 3.1:** Aprovisionar calendario padre (una vez, al conectar) y calendario hijo por `StaffMember` (al activar sincronización o al crear un profesional con la sync ya activa).
- [ ] **Task 3.2:** Enganchar `AppointmentsService` (crear/reprogramar/cancelar) para espejar el evento en el calendario padre y en el hijo del profesional, guardando `googleParentEventId`/`googleChildEventId`.
- [ ] **Task 3.3:** Pantalla en Ajustes: conectar/desconectar cuenta de Google, ver estado de sincronización por profesional.
- [ ] **Task 3.4:** Verificación final de tipos, lint y build en frontend y backend.
