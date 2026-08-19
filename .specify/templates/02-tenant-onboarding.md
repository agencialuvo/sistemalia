# ESPECIFICACIÓN: HISTORIA 2 - CONFIGURACIÓN INICIAL DEL CENTRO ESTÉTICO (TENANT PROVISIONING)
**Módulo:** Onboarding de Negocio e Identidad Corporativa (Multi-tenant)  
**Stack:** Next.js 14 + NestJS + PostgreSQL (Prisma) + Redis + Cloudflare R2 / S3  

---

## 1. COMPORTAMIENTO GENERAL Y ACCESO

* **Restricción de Acceso Global:** Cualquier usuario autenticado (`ACTIVE`) que intente ingresar al Dashboard sin un `Tenant` asociado o con estado de onboarding incompleto será interceptado y redirigido obligatoriamente a la ruta `/onboarding`.
* **Persistencia del Estado:** El progreso se guarda automáticamente en Redis (`onboarding_step:{userId}`) o en el borrador del `Tenant` en PostgreSQL. Si el usuario cierra la ventana en el Paso 2 o 3, al regresar retomará la pantalla exacta donde se quedó.

---

## 2. FLUJO DE CONFIGURACIÓN (3 PASOS COMPACTOS)

### Paso 1: Identidad del Negocio y Perfil Fiscal

* **Campos y Controles:**
  1. **Tipo de Identidad:** Selector obligatorio: `Centro Estético / Clínica (Empresa)` o `Marca Personal (Profesional Independiente)`.
  2. **Tipo de Contribuyente:** Selector obligatorio: `RUC 10 - Persona Natural con Negocio` o `RUC 20 - Persona Jurídica (S.A.C., E.I.R.L., S.R.L.)`.
  3. **Número de RUC:** Entrada de 11 dígitos numéricos con validación de algoritmo Módulo 11 en frontend.
  4. **Botón "Consultar RUC":**
     * Invoca el endpoint del API NestJS `/api/v1/tax/sunat/:ruc`.
     * **Cache:** NestJS busca en Redis si el RUC ya fue consultado recientemente. Si no, consulta al servicio externo de SUNAT.
     * **Caso Exitoso:** Extrae y autocompleta: **Razón Social**, **Dirección Fiscal** y **Estado/Condición del Contribuyente** (Debe ser `ACTIVO` y `HABIDO`).
     * **Caso Fallido:** Muestra un mensaje de error: `[Error] El número de RUC no fue encontrado o se encuentra Inactivo en SUNAT.` Permite edición manual previa confirmación visual.
  5. **Razón Social / Nombre Legal:** Campo de texto (autocompletado por la consulta RUC).
  6. **Nombre Comercial / Nombre del Negocio:** Campo libre y obligatorio. *(Nota: Este es el nombre con el que se identificará la clínica en los recordatorios y el Bot de WhatsApp).*

---

### Paso 2: Sede Principal, Contacto y Horarios de Atención

* **Configuración de Ubicación:**
  1. **Nombre de la Sede:** Texto libre, valor por defecto: `"Sede Principal"`.
  2. **Dirección Física:** Texto libre obligatorio.
  3. **Ubigeo Regional:** Desplegables en cascada: `Departamento` ➔ `Provincia` ➔ `Distrito` (asociado a códigos oficiales de Ubigeo).
  4. **WhatsApp Oficial de la Sede:** Formato telefónico con código de país (ej. `+51 9XXXXXXXX`). Usado para el envío de notificaciones e integración inicial con la API de WhatsApp.

* **Configuración de Días y Horarios de Atención (NUEVO):**
  1. **Selector de Días Laborables:** Casillas para activar/desactivar días de la semana (`Lunes` a `Domingo`).
  2. **Rango Horario por Día:**
     * Horario de Apertura y Cierre (ej. `09:00` a `19:00`).
     * Soporte opcional para **Pausa de Almuerzo / Descanso** (ej. `13:00` a `14:00`).
     * Opción de replicar el mismo horario para días seleccionados mediante un botón *"Aplicar a todos los días laborables"*.
  3. **Duración Estándar de Citas:** Dropdown (`30 min`, `45 min`, `60 min`, `90 min`) usado como base para el motor de la Agenda.

---

### Paso 3: Identidad Visual, Rubro y Finalización

* **Campos y Controles:**
  1. **Logotipo / Fotografía:** Control Drag & Drop.
     * *Formatos:* `.jpg`, `.jpeg`, `.png`, `.webp`. Tamaño máximo: 5MB.
     * *Almacenamiento:* Se procesa y sube a Cloudflare R2 / AWS S3 vía NestJS backend en el bucket de la clínica (`tenants/{tenantId}/logo.png`).
     * *Uso:* Estampado en cabeceras de Historias Clínicas, Consentimientos Informados y Recetas Médicas.
  2. **Rubro / Especialidad Principal:**
     * `Medicina Estética`
     * `Cosmetología y Spa`
     * `Cejas y Pestañas / Lashista`
     * `Salón de Belleza / Peluquería`
     * `Dermatología / Clínica Médica`

* **Acción "Finalizar y Configurar Mi Centro":**
  Al presionar este botón, NestJS ejecuta en una sola transacción SQL (vía Prisma Transaction):
  1. Crea la entidad `Tenant`.
  2. Crea la primera `Branch` (Sede Principal) vinculada al `Tenant`.
  3. Guarda la configuración de `BranchWorkingHours` (Días y horarios seleccionados).
  4. Asigna al usuario el rol de `ADMIN_OWNER` con alcance sobre este `Tenant`.
  5. Pre-carga la semilla de datos (*Seeding*): Plantillas de consentimientos informados y categorías de servicios según el **Rubro** seleccionado.
  6. Invalida el caché de onboarding del usuario en Redis y redirige al Dashboard principal.

---

## 3. MODELO DE DATOS EN POSTGRESQL (PRISMA ORM)

```prisma
enum TenantIdentityType {
  EMPRESA
  MARCA_PERSONAL
}

enum TaxIdType {
  RUC10
  RUC20
}

enum SpecialtyCategory {
  MEDICINA_ESTETICA
  COSMETOLOGIA_SPA
  CEJAS_PESTANAS
  SALON_BELLEZA
  DERMATOLOGIA
}

model Tenant {
  id              String             @id @default(uuid())
  ownerId         String             
  identityType    TenantIdentityType
  taxIdType       TaxIdType
  taxId           String             @db.VarChar(11)
  legalName       String
  commercialName  String
  specialty       SpecialtyCategory
  logoUrl         String?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  branches        Branch[]
  users           TenantUser[]

  @@index([taxId])
}

model Branch {
  id              String             @id @default(uuid())
  tenantId        String
  tenant          Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String
  address         String
  ubigeoCode      String             @db.VarChar(6)
  whatsappNumber  String
  isMain          Boolean            @default(true)
  createdAt       DateTime           @default(now())

  workingHours    BranchWorkingHour[]

  @@index([tenantId])
}

model BranchWorkingHour {
  id          String   @id @default(uuid())
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  dayOfWeek   Int      // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  isOpen      Boolean  @default(true)
  openTime    String   // Formato "HH:mm" (ej. "09:00")
  closeTime   String   // Formato "HH:mm" (ej. "19:00")
  breakStart  String?  // Formato "HH:mm" (ej. "13:00")
  breakEnd    String?  // Formato "HH:mm" (ej. "14:00")

  @@unique([branchId, dayOfWeek])
}

#### 4. CRITERIOS DE ACEPTACIÓN

[ ] Consultar un RUC de 11 dígitos válido autocompleta la Razón Social y Dirección Fiscal en menos de 2 segundos. Si el servicio externo falla, el sistema permite la edición manual sin bloquear el flujo.

[ ] Los días y horarios de atención guardados en la base de datos restringen correctamente las horas disponibles en el calendario de agendamiento y en las respuestas del Bot de WhatsApp.

[ ] La subida del logotipo valida el tipo MIME y peso del archivo en el servidor antes de subirlo a S3/R2.

[ ] Tras finalizar el Paso 3, las peticiones HTTP subsiguientes del usuario llevan adjunto el encabezado/contexto de x-tenant-id para garantizar el aislamiento multi-tenant en NestJS.

