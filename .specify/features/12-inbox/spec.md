# Especificación Funcional: Módulo Inbox Unificado

## 1. Visión General
El módulo Inbox Unificado consolida en una sola pantalla de chat el hilo de conversaciones entrantes y salientes de Facebook Messenger, Instagram Direct y WhatsApp Official API. Permite a los recepcionistas y asesores responder mensajes en tiempo real, asignar conversaciones a miembros del equipo, enviar plantillas de WhatsApp y vincular chats con la ficha de un Prospecto o Paciente.

---

## 2. Historias de Usuario
- **Como Recepcionista:** Quiero responder mensajes de Facebook, Instagram y WhatsApp desde una misma pantalla sin tener que abrir múltiples pestañas o teléfonos.
- **Como Administrador:** Quiero asignar conversaciones a recepcionistas específicos para asegurar un tiempo de respuesta rápido.
- **Como Recepcionista:** Quiero ver la ficha técnica del paciente/prospecto en el panel derecho del chat para conocer su historial médico o citas agendadas mientras converso.

---

## 3. Requisitos Funcionales

### RF-1: Gestión de Hilos de Conversación
- Agrupar mensajes por contacto (`Conversation`) asociándolos al canal correspondiente (`SocialChannel`).
- Estados de conversación: `ABIERTA`, `EN_ESPERA`, `RESUELTA`.
- Indicador visual del canal de origen (icono de WhatsApp, Instagram o Messenger).

### RF-2: Envío y Recepción de Mensajes Multicanal
- Ingesta en tiempo real vía Webhooks (`messages`, `messaging_postbacks`, `whatsapp_business_messaging`).
- Envío de respuestas en texto plano y adjuntos (imágenes/documentos) utilizando las Graph APIs de Meta / Cloud API de WhatsApp.
- Soporte para plantillas aprobadas de WhatsApp (*HSM - Highly Structured Messages*).

### RF-3: Vinculación con CRM y Ficha 360°
- Reconocimiento de contacto por número telefónico o ID de usuario de red social.
- Panel lateral derecho que despliega la información del Prospecto/Paciente, con acceso rápido a agendar una cita.