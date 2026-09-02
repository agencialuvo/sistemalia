# Plan de Arquitectura Técnica: Módulo Prospectos

## 1. Modelo de Datos (Prisma Schema)

```prisma
enum ProspectStatus {
  NUEVO
  CONTACTADO
  CITADO
  NO_INTERESADO
  CONVERTIDO
}

model Prospect {
  id              String         @id @default(uuid())
  tenantId        String
  channelId       String?        // Relación opcional con SocialChannel
  fullName        String
  phone           String
  email           String?
  status          ProspectStatus @default(NUEVO)
  sourceProvider  SocialChannelProvider
  campaignName    String?        // Nombre de la campaña publicitaria
  adName          String?        // Nombre del anuncio
  formAnswers     Json?          // Preguntas y respuestas del formulario
  assignedUserId  String?        // Recepcionista / Asesor asignado
  patientId       String?        // ID del Paciente si fue convertido
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  channel         SocialChannel? @relation(fields: [channelId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([phone])
  @@index([status])
}

2. Endpoints API (NestJS)   

Método,Ruta,Descripción
GET,/api/v1/marketing/prospects,Lista paginada de prospectos con filtros por estado y canal.
GET,/api/v1/marketing/prospects/:id,"Detalle completo del prospecto (respuestas de formulario, historial)."
PATCH,/api/v1/marketing/prospects/:id,"Actualiza estado, notas o usuario asignado."
POST,/api/v1/marketing/prospects/:id/convert,Convierte el prospecto en Paciente oficial.

3. Procesamiento Asíncrono de Webhooks
Creación de MetaLeadProcessorService para procesar payloads de Meta en segundo plano.

Solicitud a Meta Graph API GET /v20.0/{leadgen_id} utilizando el accessToken cifrado del SocialChannel correspondiente.