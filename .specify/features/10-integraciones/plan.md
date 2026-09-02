# Plan de Arquitectura Técnica: Módulo Integraciones

## 1. Arquitectura de Datos (Prisma Schema)

```prisma
enum Provider {
  META_FACEBOOK
  META_INSTAGRAM
  TIKTOK
  WHATSAPP_OFFICIAL
}

enum ChannelStatus {
  ACTIVE
  EXPIRED
  DISCONNECTED
}

model SocialChannel {
  id           String        @id @default(uuid())
  tenantId     String
  provider     Provider
  externalId   String        // ID de la Página / WABA / TikTok Account
  name         String        // Nombre de la Página / Número de WhatsApp
  accessToken  String        // Token encriptado (AES-256)
  refreshToken String?       // Token de refresco si aplica
  expiresAt    DateTime?     // Expiración del token
  status       ChannelStatus @default(ACTIVE)
  metadata     Json?         // Foto de perfil, teléfono, permisos
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([tenantId, provider, externalId])
  @@index([tenantId])
}




Método,Ruta,Descripción
GET,/api/v1/marketing/channels,Lista todos los canales vinculados del Tenant.
POST,/api/v1/marketing/channels/meta/connect,Recibe el accessToken temporal del SDK y guarda páginas/cuentas conectadas.
POST,/api/v1/marketing/channels/whatsapp/connect,Procesa la respuesta de Embedded Signup para registrar la WABA y número.
POST,/api/v1/marketing/channels/tiktok/connect,Intercambia el code de TikTok por access_token publicitario.
DELETE,/api/v1/marketing/channels/:id,Elimina la conexión y desconecta los webhooks asociados.
GET,/api/v1/webhooks/meta,Verificación de challenge para Webhooks de Meta.
POST,/api/v1/webhooks/meta,Recepción de eventos en tiempo real (Leads y Mensajes).

3. Seguridad e Incriptación (Crypto Service)
Módulo EncryptionService utilitario usando el algoritmo nativo aes-256-gcm de Node.js.

Clave de encriptación master leída desde variable de entorno ENCRYPTION_KEY.

4. Componentes Frontend (Next.js 14 App Router)
Ruta /panel/marketing/canales/page.tsx

Componentes:

ChannelCard: Tarjeta individual para cada red social con indicador de estado (Badge).

MetaConnectButton: Botón con el SDK oficial FB.login().

WhatsAppConnectButton: Botón con la experiencia modal de Embedded Signup.

TikTokConnectButton: Ventana emergente OAuth 2.0 para TikTok.