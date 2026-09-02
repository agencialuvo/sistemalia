# Plan de Arquitectura Técnica: Módulo Inbox Unificado

## 1. Modelo de Datos (Prisma Schema)

```prisma
enum ConversationStatus {
  ABIERTA
  EN_ESPERA
  RESUELTA
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

model Conversation {
  id              String             @id @default(uuid())
  tenantId        String
  channelId       String
  externalUserId  String             // ID scoped del usuario de Meta/WhatsApp
  contactName     String?
  contactPhone    String?
  status          ConversationStatus @default(ABIERTA)
  assignedUserId  String?
  prospectId      String?
  patientId       String?
  lastMessageAt   DateTime           @default(now())
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  channel         SocialChannel      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  messages        Message[]

  @@unique([tenantId, channelId, externalUserId])
  @@index([tenantId])
  @@index([status])
}

model Message {
  id             String           @id @default(uuid())
  conversationId String
  externalId     String?          // Message ID asignado por la red social
  direction      MessageDirection
  body           String
  attachments    Json?            // URLs de imágenes/documentos
  status         String?          // SENT, DELIVERED, READ, FAILED
  sentByUserId   String?          // ID del usuario de LIA que respondió
  createdAt      DateTime         @default(now())

  conversation   Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}

2. Endpoints API (NestJS)

Método,Ruta,Descripción
GET,/api/v1/marketing/inbox/conversations,Lista de hilos de conversación con paginación y filtros.
GET,/api/v1/marketing/inbox/conversations/:id,Detalle del hilo y mensajes.
POST,/api/v1/marketing/inbox/conversations/:id/messages,Envia una respuesta al cliente a través de la API externa.
PATCH,/api/v1/marketing/inbox/conversations/:id,Cambia estado o asigna un usuario responsable.

3. Integración con Meta API para Envío
MessagingSenderService: Servicio que determina la API destino según el provider del SocialChannel:

Facebook/Instagram: POST /v20.0/me/messages

WhatsApp: POST /v20.0/{phone_number_id}/messages