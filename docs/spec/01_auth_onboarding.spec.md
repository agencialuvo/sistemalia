# ESPECIFICACIÓN: HISTORIA 1 - AUTENTICACIÓN Y REGISTRO DE USUARIOS
**Módulo:** Onboarding e Identidad (Basado en Supabase Auth)  

---

## 1. FLUJOS DE ENTRADA (MÉTODOS DE REGISTRO)

### 1.1 Flujo Tradicional (Correo y Contraseña)
Este flujo consta de dos etapas obligatorias antes de permitir el acceso al sistema.

*   **Etapa 1: Formulario de Captura**
    *   **Entradas requeridas:** Correo electrónico (`email`), Contraseña (`password`) y Token de Verificación Humana (`recaptcha_token`).
    *   **Regla de Validación - Correo:** Debe cumplir con la estructura estándar (`usuario@dominio.com`). El backend debe rechazar la solicitud si el dominio pertenece a un proveedor de correos temporales o desechables (ej. *mailinator.com*, *10minutemail.com*, *yopmail.com*).
    *   **Regla de Validación - Contraseña:** Nivel de seguridad intermedio. Debe exigir una longitud mínima de 8 caracteres, incluir al menos una letra mayúscula, una letra minúscula y un número.
    *   **Regla de Validación - Anti-Bot:** El formulario frontend debe incluir Google reCAPTCHA v3 de forma invisible. El backend validará el `recaptcha_token` con la API de Google antes de guardar datos; si el puntaje de confianza (score) es menor a `0.5`, se bloquea el registro de forma inmediata.
    *   **Acción del Botón "Registrarse":** 
        *   Crea el registro del usuario en Supabase Auth en estado **Inactivo / Pendiente de Verificación**.
        *   Genera un código OTP de 6 dígitos numéricos aleatorios (expira en 15 minutos).
        *   Envía el código por correo electrónico.
        *   Redirige automáticamente al usuario a la pantalla de verificación OTP.

*   **Etapa 2: Formulario de Verificación de Cuenta**
    *   **Entradas requeridas:** Código de verificación (`otp_code`) de 6 dígitos.
    *   **Acción del Botón "Verificar Cuenta":** Compara el código ingresado por el usuario.
        *   *Caso Exitoso:* Cambia el estado del usuario a `ACTIVO`, inicia su sesión y lo redirige automáticamente al flujo de creación del Centro Estético.
        *   *Casos Límite y Manejo de Errores:* 
            *   Si el código expiró o es incorrecto: Muestra el mensaje `[Error] El código ingresado es inválido o ha expirado.`.
            *   Permite un máximo de 3 intentos fallidos consecutivos. Al tercer fallo, el código se destruye por seguridad y la interfaz debe habilitar un botón para "Reenviar nuevo código".

### 1.2 Flujo Rápido (Autenticación con Google)
*   **Componente visual:** Botón nativo de "Continuar con Google".
*   **Comportamiento del Sistema:** Invoca el flujo de inicio de sesión federado utilizando Google OAuth2 (provisto nativamente por Supabase Auth).
*   **Lógica de Registro:**
    *   Al recibir la respuesta exitosa de Google, el sistema verifica si el correo electrónico ya existe.
    *   **Si es un usuario nuevo:** Se crea su perfil directamente con estado `ACTIVO`. **NO se le solicita crear una contraseña local ni pasar por reCAPTCHA/OTP**. El acceso se confía completamente a la identidad provista por Google.
    *   **Si el correo ya existía por método tradicional:** Supabase Auth vincula la identidad de Google a la cuenta existente de forma segura, permitiendo el ingreso directo.
    *   El usuario es redirigido de forma automática directamente al flujo de creación de su Centro Estético.

---

## 2. FLUJO DE RECUPERACIÓN DE CONTRASEÑA

Este flujo aplica **únicamente** para los usuarios que se registraron mediante el método tradicional (Correo/Contraseña).

*   **Enlace de acceso:** En la pantalla de Login, debe existir el enlace "¿Olvidaste tu contraseña?".
*   **Paso 1: Solicitud de Restablecimiento**
    *   El usuario ingresa su correo electrónico y hace clic en "Enviar enlace de recuperación".
    *   **Regla de Seguridad (Enumeración de usuarios):** Independientemente de si el correo existe o no en la base de datos, la interfaz de LIA siempre debe mostrar el mensaje de éxito: *"Si el correo coincide con una cuenta activa, recibirás un enlace para restablecer tu contraseña en unos minutos"*. Esto evita que atacantes adivinen qué correos están registrados.
    *   Si el correo existe y es local (no de Google), Supabase Auth genera un token seguro de recuperación y envía un enlace único al email del usuario (expira en 1 hora).
*   **Paso 2: Formulario de Nueva Contraseña**
    *   Al hacer clic en el enlace recibido en su correo, el sistema intercepta el token y abre una pantalla segura en LIA para ingresar la nueva contraseña.
    *   **Campos:** `Nueva contraseña` y `Confirmar nueva contraseña`.
    *   **Validación:** Debe cumplir con el mismo nivel de seguridad intermedio (mínimo 8 caracteres, mayúscula, minúscula y número).
    *   Al confirmar, la contraseña se actualiza en Supabase Auth, se destruye el token de un solo uso y se redirige al usuario a la pantalla de Login con un mensaje de éxito.

---

## 3. REGLAS TÉCNICAS Y LIMITACIONES (RESTRICCIONES PARA LA IA)
*   **Seguridad:** Las contraseñas deben ser administradas y hasheadas de manera nativa por el módulo de encriptación de Supabase Auth. Bajo ninguna circunstancia se debe almacenar o transmitir texto plano en variables de sesión o logs de la aplicación.
*   **Privacidad:** El código OTP de 6 dígitos jamás debe viajar expuesto en las respuestas HTTP hacia el frontend (inspección de red). El frontend solo envía el código ingresado por el usuario para que el backend lo verifique internamente.

---

## 4. CRITERIOS DE ACEPTACIÓN
*   [ ] Intentar registrarse con el correo `cliente@yopmail.com` dispara un mensaje de error y no genera registros en la base de datos.
*   [ ] Escribir una contraseña que sea solo números (ej: `123456789`) mantiene deshabilitado el botón de "Registrarse" o arroja un error de validación visual inmediato.
*   [ ] Un usuario registrado por el método tradicional no puede saltarse la pantalla de ingreso del código OTP para entrar al sistema mediante manipulaciones en la URL de Next.js.
*   [ ] Si un usuario registrado mediante Google intenta usar el flujo de "Olvidé mi contraseña", el sistema de correo le notificará de manera segura que su cuenta está vinculada a Google y debe iniciar sesión con ese botón.