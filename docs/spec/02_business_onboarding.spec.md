# ESPECIFICACIÓN: HISTORIA 2 - CONFIGURACIÓN INICIAL DEL CENTRO ESTÉTICO (TENANT PROVISIONING)
**Versión:** 1.0.0  
**Estado:** Listo para Implementación  
**Módulo:** Onboarding de Negocio e Identidad Corporativa (Multi-tenant)
**Código Base:** Adaptación sobre repositorio `wacrm` (Supabase + Next.js)

---

## 1. COMPORTAMIENTO GENERAL Y ACCESO
*   **Restricción de Acceso Global:** Cualquier usuario con una sesión activa (`ACTIVO`) que intente ingresar al Dashboard principal de LIA sin haber completado este formulario de 3 pasos, será interceptado y redirigido obligatoriamente a la interfaz de este Onboarding.
*   **Persistencia:** Si el usuario cierra el navegador o la pestaña en el Paso 2 o Paso 3, al reingresar el sistema debe recordar en qué pantalla se quedó para evitar la pérdida de progreso.

---

## 2. REQUISITOS DE COMPORTAMIENTO (FLUJO DE 3 PANTALLAS RÁPIDAS)

### Paso 1: Identidad del Negocio y Perfil Fiscal
La interfaz debe mutar de acuerdo al tipo de identidad y automatizar el llenado de datos legales.

*   **Campos y Controles:**
    1.  **Tipo de Identidad:** Selector obligatorio exclusivo: `Centro Estético (Empresa)` o `Marca Personal (Profesional Independiente)`.
    2.  **Tipo de Contribuyente:** Selector obligatorio exclusivo: `RUC 10 - Persona Natural con Negocio` o `RUC 20 - Persona Jurídica (S.A.C., E.I.R.L., S.R.L.)`.
    3.  **Número de RUC:** Entrada numérica estricta de exactamente 11 dígitos.
    4.  **Botón "Consultar RUC":** Al hacer clic, el backend se conecta con la API de consulta de SUNAT.
        *   *Caso Exitoso:* Extrae y auto-llena automáticamente los campos **Razón Social** y el **Estado del Contribuyente** (Debe figurar como ACTIVO / HABIDO).
        *   *Caso Fallido:* Si el RUC no existe, el campo se marca en rojo y muestra el error: `[Error] El número de RUC no es válido o no fue encontrado en la base de datos de SUNAT.`
    5.  **Razón Social / Nombres Completos:** Campo de texto (Bloqueado para edición si se auto-llenó exitosamente mediante la consulta de la API de SUNAT).
    6.  **Nombre Comercial:** Campo de texto libre y obligatorio. *(Nota crítica: Este valor será el nombre que use el chatbot de WhatsApp para presentarse con los pacientes/clientes).*
*   **Acción del Botón "Siguiente":** Valida que todos los campos obligatorios estén llenos y avanza al Paso 2.

### Paso 2: Configuración de la Primera Sede o Consultorio
Todo centro estético o marca personal requiere una ubicación base, esencial para la asignación de agendas de profesionales y la emisión de comprobantes autorizados.

*   **Campos y Controles:**
    1.  **Nombre de la Sede o Espacio:** Campo de texto obligatorio. Por defecto precargado con el valor `"Sede Principal"`. El usuario puede cambiarlo (ej: `"Consultorio San Isidro"` o `"Estudio a Domicilio"`).
    2.  **Dirección Física:** Campo de texto obligatorio. (Calle, avenida, jirón, número, departamento, oficina o interior).
    3.  **Ubigeo Regional:** Tres selectores desplegables en cascada obligatorios: `Departamento` ➔ `Provincia` ➔ `Distrito`. Es mandatorio mapear la selección con los códigos de Ubigeo oficiales de SUNAT de 6 dígitos.
    4.  **WhatsApp de Atención:** Entrada de texto con máscara telefónica de 9 dígitos. Campo obligatorio para las coordinaciones internas y alertas iniciales de las citas.
*   **Acción del Botón "Siguiente":** Valida la información de la ubicación y avanza al Paso 3.

### Paso 3: Identidad Visual y Especialidad
Personalización del espacio de trabajo para inicializar las plantillas especializadas del sistema.

*   **Campos y Controles:**
    1.  **Logotipo / Foto de Perfil:** Control de arrastrar y soltar archivo (Drag & Drop).
        *   *Limitaciones:* Formatos permitidos `.jpg`, `.jpeg`, `.png`. Tamaño máximo del archivo: 2MB.
        *   *Destino:* Se almacena de manera segura en un bucket público de Supabase Storage. *(Nota crítica: El sistema usará este logo para estamparlo de manera automática en las historias clínicas digitales, recetas impresas y consentimientos informados firmados digitalmente).*
    2.  **Rubro Principal:** Lista desplegable obligatoria de selección exclusiva:
        *   `Medicina Estética`
        *   `Cosmetología y Spa`
        *   `Cejas y Pestañas`
        *   `Salón de Belleza / Peluquería`
*   **Acción del Botón "Finalizar Registro":** En este punto el backend ejecuta el aprovisionamiento técnico del espacio de trabajo (*Tenant Provisioning*):
    1. Crea el registro en la tabla `tenants`.
    2. Crea la primera sede en la tabla `branches`.
    3. Vincula al usuario con el rol de `ADMIN_OWNER` del negocio.
    4. Pre-carga en el catálogo de servicios de este usuario una lista básica de servicios y plantillas de consentimientos informados de acuerdo al **Rubro Principal** seleccionado.
    5. Redirige automáticamente al usuario al Dashboard principal ya inicializado.

---

## 3. ARQUITECTURA TÉCNICA (EXTENSIÓN DE LA BASE DE DATOS DE SUPABASE)

Para que la base de `wacrm` soporte múltiples centros estéticos independientes de forma segura utilizando aislamiento multi-inquilino (*multi-tenant*), el agente de IA aplicará este esquema estructural en las migraciones de PostgreSQL:

```typescript
interface Tenant {
  id: string; // UUID v4 (Identificador único del negocio para políticas RLS)
  owner_id: string; // Relación con auth.users.id
  identity_type: 'empresa' | 'marca_personal';
  tax_id_type: 'RUC10' | 'RUC20';
  tax_id: string; // El número de RUC de 11 dígitos
  legal_name: string; // Razón Social o Nombres Completos de SUNAT
  commercial_name: string; // Nombre Comercial (Usado por el bot de WhatsApp)
  main_category: 'medicina_estetica' | 'cosmetologia_spa' | 'cejas_pestanas' | 'salon_belleza';
  logo_url: string | null; // URL pública del bucket de Supabase Storage
  plan_id: 'PLAN_PROVISIONAL_TOTAL'; // Se mantiene quemado en esta fase inicial
  created_at: string; // ISO 8601
}

interface Branch {
  id: string; // UUID v4
  tenant_id: string; // Relación obligatoria con Tenant.id para el aislamiento RLS
  name: string; // Ej. "Sede Principal"
  address: string;
  ubigeo_code: string; // Código de 6 dígitos oficial de SUNAT (Departamento/Provincia/Distrito)
  whatsapp_number: string;
  created_at: string;
}
```

### Reglas Estrictas de Seguridad (RLS)
*   **PROHIBIDO** permitir que un usuario vea el menú o use las funciones de `wacrm` si no posee un `tenant_id` activo en sus variables de sesión.
*   Todas las tablas originales del repositorio (`contacts`, `conversations`, `messages`, `pipelines`) deberán incluir una columna `tenant_id` para garantizar que un centro estético jamás pueda ver o cruzar datos con los clientes de otro.

---

## 4. CRITERIOS DE ACEPTACIÓN Y VERIFICACIÓN
*   [ ] Si un usuario digita un RUC que no contiene exactamente 11 dígitos o ingresa letras, el frontend deshabilita el botón de "Consultar RUC" y muestra una advertencia visual.
*   [ ] Un usuario que complete satisfactoriamente el Onboarding de negocio debe poder refrescar la página en la raíz (`/`) y entrar directo al Dashboard sin volver a ver las pantallas de registro.
*   [ ] El logotipo subido en el paso 3 debe guardarse en el storage de Supabase renombrado bajo el ID del inquilino (ej: `logos/tenant_uuid.png`) para evitar colisiones de archivos y sobreescrituras.