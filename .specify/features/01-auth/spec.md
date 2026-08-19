# ESPECIFICACIÓN: HISTORIA 1 - AUTENTICACIÓN Y REGISTRO MULTI-TENANT
**Módulo:** Onboarding e Identidad  
**Stack:** Next.js 14 (App Router) + NestJS + PostgreSQL (Prisma) + Redis + Google OAuth / Passport JWT

---

## 1. FLUJOS DE ENTRADA (MÉTODOS DE REGISTRO)

### 1.1 Flujo Tradicional (Correo y Contraseña)
Este flujo consta de dos etapas obligatorias antes de otorgar acceso o crear el token JWT de sesión.

* **Etapa 1: Formulario de Captura**
  * **Entradas requeridas:** Correo electrónico (`email`), Contraseña (`password`), Nombre completo (`fullName`), Token de Verificación Humana (`recaptchaToken`).
  * **Validación - Correo:** Expresión regular estándar + Filtro de correos temporales/desechables en el backend (ej. *mailinator.com*, *yopmail.com*).
  * **Validación - Contraseña:** Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número (validado vía `class-validator` en NestJS DTO y Zod en Next.js).
  * **Validación - Anti-Bot:** Google reCAPTCHA v3 validado en el API Gateway de NestJS. Si el puntaje (`score`) es < 0.5, la solicitud es rechazada.
  * **Acción del Backend:**
    * Registra al usuario en PostgreSQL (`User`) con estado `PENDING_VERIFICATION` e indicador `emailVerified = false`.
    * Genera un código OTP de 6 dígitos numéricos aleatorios y lo guarda en **Redis** con una clave `otp:{userId}` y expiración (TTL) de 15 minutos.
    * Dispara una tarea asíncrona mediante **BullMQ** para enviar el correo con el código OTP.
    * Devuelve un token temporal de verificación (`verificationToken`) firmado sin privilegios de acceso para la Etapa 2.

* **Etapa 2: Formulario de Verificación de Cuenta (OTP)**
  * **Entradas requeridas:** `verificationToken` (en headers/body) y Código de verificación (`otpCode`) de 6 dígitos.
  * **Acción del API Backend:**
    * Compara el `otpCode` recibido contra el almacenado en Redis.
    * *Caso Exitoso:* Actualiza el usuario a estado `ACTIVE` (`emailVerified = true`), elimina el OTP de Redis, emite la pareja de tokens **JWT Access Token (15m)** y **Refresh Token (7d)** en HTTP-Only Cookies, y responde con el perfil del usuario para redirigir al flujo de Creación/Unión de Tenant.
    * *Casos Límite y Manejo de Errores:*
      * Si el código expiró o es incorrecto: Retorna HTTP 400 `[Error] El código ingresado es inválido o ha expirado.`.
      * Mantiene un contador de reintentos en Redis. Al 3er intento fallido, destruye la clave y exige solicitar un nuevo reenvío.

### 1.2 Flujo Rápido (Autenticación con Google)
* **Componente visual:** Botón "Continuar con Google".
* **Comportamiento del Sistema:**
  * Inicia flujo OAuth2 mediante Passport-Google-OAuth20 en NestJS (o Auth.js / NextAuth en Next.js coordinado con el API de NestJS).
* **Lógica de Registro:**
  * Si el usuario no existe en la base de datos: Se crea el registro `User` con `provider = GOOGLE`, `emailVerified = true`, y estado `ACTIVE`. **Sin requerir contraseña local ni reCAPTCHA/OTP**.
  * Si el usuario ya existía por método tradicional: Se vincula el `googleId` a la cuenta del usuario de forma transparente.
  * Genera el par de JWTs de sesión e inicia la redirección automática al onboarding del Centro Estético / Salud.

---

## 2. FLUJO DE RECUPERACIÓN DE CONTRASEÑA

Aplica únicamente a usuarios registrados por método tradicional (`provider = LOCAL`).

* **Paso 1: Solicitud de Restablecimiento**
  * Usuario ingresa su correo en la interfaz de Next.js.
  * **Regla de Seguridad (Anti-Enumeración):** El API siempre responde `HTTP 200` con el mensaje: *"Si el correo coincide con una cuenta activa, recibirás instrucciones para restablecer tu contraseña en breve"*.
  * Si el correo existe y tiene `provider = LOCAL`:
    * Genera un token aleatorio criptográficamente seguro (UUID v4 / hash) guardado en Redis (`reset_token:{hash}`) con expiración de 1 hora.
    * Dispara el correo de recuperación a través del queue de tareas en NestJS.

* **Paso 2: Formulario de Nueva Contraseña**
  * El usuario ingresa a la URL con el token (`/auth/reset-password?token=XYZ`).
  * **Validación:** Comprueba la validez y expiración del token en Redis.
  * Al enviar la nueva contraseña, NestJS valida la complejidad, la hashea utilizando **Argon2** o **Bcrypt** (mínimo 10/12 salt rounds), actualiza la base de datos, destruye el token en Redis y revoca todas las sesiones anteriores activas.

---

## 3. REGLAS TÉCNICAS Y SEGURIDAD (CONSTITUCIÓN)
* **Hashing de Contraseñas:** Administrado mediante Argon2 / Bcrypt en NestJS backend. Nunca almacenar ni registrar contraseñas en texto plano.
* **Manejo de Sesión:** JWTs firmados con secretos seguros (`RS256` o `HS256`). Access Tokens con tiempo de vida corto (15 min) y Refresh Tokens almacenados con hash en base de datos/Redis.
* **Aislamiento Multi-Tenant:** El usuario autenticado, tras completar el OTP, obtiene acceso a crear o acceder al contexto de un `Tenant` (Centro Estético / Clínica). Todas las peticiones posteriores requerirán la cabecera/cookie del contexto del Tenant para aplicar Row-Level Security.

---

## 4. CRITERIOS DE ACEPTACIÓN
* [ ] Intento de registro con correos temporales (`*@yopmail.com`, etc.) retorna HTTP 400 y no crea ningún registro en la base de datos.
* [ ] Las contraseñas sin la complejidad mínima (mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número) son rechazadas tanto en el frontend como por las DTOs de NestJS.
* [ ] Un usuario `PENDING_VERIFICATION` que intente consumir endpoints protegidos recibe una respuesta `HTTP 403 Forbidden`.
* [ ] El código OTP de 6 dígitos no es expuesto en ningún payload de respuesta JSON del backend.
* [ ] Un usuario autenticado vía Google que solicite recuperación de contraseña recibe un correo indicando que debe usar el botón "Continuar con Google".
