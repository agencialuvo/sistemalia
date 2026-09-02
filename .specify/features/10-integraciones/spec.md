# Especificación Funcional: Módulo de Integraciones No-Code

## 1. Visión General
El módulo de Integraciones permite a los administradores de la clínica vincular sus cuentas comerciales de Meta (Facebook, Instagram, WhatsApp) y TikTok Ads de forma 100% No-Code mediante flujos OAuth (Meta Embedded Signup y TikTok Login Kit). Una vez conectadas, el sistema recibe webhooks automáticos para sincronizar leads de formularios instantáneos, mensajes y métricas de pauta publicitaria.

---

## 2. Historias de Usuario
- **Como Administrador de Clínica:** Quiero conectar mi Facebook e Instagram con un solo clic para no tener que crear apps ni copiar tokens manualmente en Meta Developers.
- **Como Administrador de Clínica:** Quiero vincular mi número de WhatsApp Business API mediante Meta Embedded Signup para enviar y recibir mensajes directamente desde Sistema LIA.
- **Como Director de Marketing:** Quiero conectar TikTok Ads para capturar prospectos de formularios instantáneos de TikTok en tiempo real.
- **Como Recepcionista:** Quiero ver si los canales están activos o si requieren re-autenticación para asegurar que ningún cliente quede desatendido.

---

## 3. Requisitos Funcionales

### RF-1: Autenticación OAuth No-Code
- **Meta (Facebook Page & Instagram Business):** Integrar el SDK de Facebook Login con permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `instagram_basic`, `instagram_manage_messages`.
- **WhatsApp Business API:** Implementar el flujo *Meta Embedded Signup* para el registro de número y WABA (WhatsApp Business Account).
- **TikTok Business:** Integrar TikTok OAuth 2.0 con permisos de `ad.lead.read` y `user.info.basic`.

### RF-2: Gestión de Tokens y Ciclo de Vida
- Intercambiar tokens de corta duración (*short-lived*) por tokens de acceso de larga duración (*long-lived page/user tokens*, 60 días o indefinidos).
- Guardar tokens encriptados en la base de datos usando `AES-256-GCM`.
- Monitorear el estado de la conexión (`ACTIVE`, `EXPIRED`, `DISCONNECTED`) y alertar al usuario si el token vence o el permiso fue revocado en la red social.

### RF-3: Configuración Automática de Webhooks
- Al conectar una página o WABA, el backend debe suscribir automáticamente la aplicación a los webhooks de:
  - `leadgen` (Formularios instantáneos de Meta Lead Ads).
  - `messages` (Mensajes entrantes de Messenger e Instagram Direct).
  - `whatsapp_business_messaging` (Mensajes de WhatsApp).

---

## 4. Requisitos No Funcionales
- **Seguridad:** Ningún token de acceso debe ser expuesto en las respuestas JSON del Frontend ni almacenado en texto plano.
- **Usabilidad:** Proceso de conexión completado en menos de 3 clics desde la interfaz del sistema.
- **Disponibilidad:** El endpoint de recepción de Webhooks debe responder con HTTP 200 en menos de 200ms para evitar reintentos masivos por parte de Meta/TikTok.