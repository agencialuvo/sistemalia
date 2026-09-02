# Especificación Funcional: Módulo de Prospectos (Ingesta & CRM)

## 1. Visión General
El módulo de Prospectos centraliza todos los clientes potenciales generados a través de formularios instantáneos (Meta Lead Ads, TikTok Lead Ads), mensajes entrantes o registros manuales. Permite clasificar el origen del lead (campaña, anuncio, formulario), asignar responsables en recepción y conectar el prospecto con el expediente oficial de Pacientes una vez que agenda su primera cita.

---

## 2. Historias de Usuario
- **Como Director de Marketing:** Quiero que los leads capturados en formularios de Meta/TikTok ingresen automáticamente al sistema en menos de 5 segundos con toda su información (nombre, teléfono, email, respuestas personalizadas).
- **Como Recepcionista:** Quiero ver una lista de nuevos prospectos con etiquetas claras del canal de origen (Facebook, Instagram, WhatsApp, TikTok) para contactarlos inmediatamente.
- **Como Administrador:** Quiero convertir un Prospecto en Paciente con un solo clic al momento de agendar su cita para no duplicar datos.

---

## 3. Requisitos Funcionales

### RF-1: Ingesta Automática por Webhook (Meta & TikTok Lead Ads)
- Al recibir un webhook de evento `leadgen`, el sistema debe consultar la Graph API de Meta para obtener las respuestas del formulario de manera asíncrona.
- Mapear automáticamente los campos estándar: Nombre completo, Teléfono, Correo electrónico y notas/respuestas a preguntas personalizadas.
- Prevenir prospectos duplicados actualizando el registro existente si coincide el número telefónico dentro del mismo Tenant.

### RF-2: Gestión de Prospectos
- Búsqueda, filtrado por estado (`NUEVO`, `CONTACTADO`, `CITADO`, `NO_INTERESADO`, `CONVERTIDO`) y por origen de canal.
- Asignación de etiquetas personalizadas y notas de seguimiento.

### RF-3: Conversión Prospecto -> Paciente
- Transición automática o manual que crea un registro en el módulo de **Pacientes** vinculando el ID del prospecto para conservar la trazabilidad publicitaria.