# Spec - Módulo 03: Catálogo de Servicios y Categorías

## Contexto y Visión
El módulo de Servicios gestiona el inventario de tratamientos y procedimientos ofertados por el centro médico/estético. Actúa como la "fuente única de verdad" (Base de Conocimiento RAG) para la IA de ventas, el motor de agendamiento y la facturación. Permite la creación individual y la carga masiva mediante plantilla estándar de Excel/CSV.

---

## 1. Entidades y Estructura de Datos (Prisma)

### 1.1 `ServiceCategory`
Categorización jerárquica o agrupada de los tratamientos (ej: "Dermatología", "Corporal", "Facial", "Láser").
- `id`: String (UUID) - Primary Key
- `tenantId`: String - Foreign Key (Tenant)
- `name`: String - Nombre de la categoría (ej: "Depilación Láser")
- `description`: String? - Descripción opcional
- `color`: String? - Código HEX para visualización en el calendario
- `isActive`: Boolean (default: `true`)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 1.2 `Service`
Registro principal del servicio estético/médico.
- `id`: String (UUID) - Primary Key
- `tenantId`: String - Foreign Key (Tenant)
- `categoryId`: String - Foreign Key (`ServiceCategory`)
- `name`: String - Nombre comercial del servicio
- `commercialDescription`: Text - Descripción para venta y base de conocimiento de la IA
- `mainImageUrl`: String? - Imagen principal promocional
- `testimonioGallery`: String[] - Array de URLs de fotos antes/después
- `structureType`: Enum (`SINGLE`, `SESSIONS`) - Tipo de tratamiento
- `sessionCount`: Int? - Cantidad de sesiones (si es `SESSIONS`)
- `frequencyDays`: Int? - Días mínimos entre sesiones (para control de agenda de la IA)
- `singlePrice`: Decimal - Precio unitario o por sesión suelta
- `packagePrice`: Decimal? - Precio total del paquete de sesiones
- `requiresEvaluation`: Boolean (default: `false`) - Exige consulta previa
- `evaluationServiceId`: String? - Foreign Key autorreferencial a otro `Service` (Servicio de valoración asociado)
- `evaluationCost`: Decimal? - Monto de la cita de evaluación
- `isEvaluationDeductible`: Boolean (default: `false`) - Si el pago de evaluación se descuenta del total
- `deductibleExpirationDays`: Int? - Días de validez para descontar la evaluación
- `availabilityType`: Enum (`GENERAL`, `CUSTOM`) - Si sigue el horario de la sede o un rango propio
- `customSchedule`: Json? - Matriz horaria específica (si es `CUSTOM`)
- `durationMinutes`: Int - Duración neta del tratamiento en minutos
- `bufferMinutes`: Int (default: 0) - Tiempo de preparación/limpieza entre citas
- `contraindications`: String[] - Tags/Enums de alertas médicas (ej: `["EMBARAZO", "MARCAPASOS"]`)
- `prePostCare`: Text? - Cuidados previos y posteriores (instrucciones para la IA / paciente)
- `paymentMethod`: Enum (`IN_PERSON`, `ONLINE`, `DEPOSIT`) - Regla de cobro
- `depositAmount`: Decimal? - Monto o porcentaje de anticipo requerido
- `depositIsPercentage`: Boolean (default: `false`)
- `isActive`: Boolean (default: `true`)
- `createdAt`: DateTime
- `updatedAt`: DateTime

---

## 2. Requerimientos Funcionales

### 2.1 Gestión de Categorías
- CRUD completo de categorías por Tenant.
- Desactivación lógica (`isActive = false`) para no romper historiales de citas.

### 2.2 Gestión de Servicios (CRUD Formulario)
- **Bloque 1: Identificación y Multimedia**: Nombre, categoría, descripción comercial, foto principal y galería de testimonios (subida a `/upload`).
- **Bloque 2: Estructura Comercial y Paquetes**: Toggle `Único` vs `Sesiones`. Lógica condicional de UI para mostrar `sessionCount`, `frequencyDays` y `packagePrice`.
- **Bloque 3: Filtro Clínico y Valoración**: Checkbox `requiereEvaluacion`. Si es true, despliega selector de servicio de evaluación, costo, deductibilidad y días de caducidad.
- **Bloque 4: Tiempos y Operativa**: Duración neta en minutos, tiempo de buffer (limpieza/restauración de cabina) y tags de contraindicaciones.
- **Bloque 5: Métodos de Pago**: Configuración de cobranza en caja, pago online o anticipo.

### 2.3 Carga Masiva vía Excel/CSV (`/services/import`)
- Endpoint y modal de interfaz para subir archivo `.xlsx` / `.csv`.
- Endpoint `/services/template` para descargar la plantilla oficial con encabezados, instrucciones y pestañas con listas desplegables para categorías y tipos.
- Parser con validación fila por fila:
  - Creación automática de categorías inexistentes o vinculación por nombre.
  - Validación de tipos de datos, precios positivos y enums válidos.
  - Reporte de errores detallado indicando número de fila y columna en caso de fallas de validación.

---

## 3. Endpoints de Backend (NestJS)

- `GET /services/categories` - Listar categorías del tenant.
- `POST /services/categories` - Crear categoría.
- `PATCH /services/categories/:id` - Actualizar categoría.
- `DELETE /services/categories/:id` - Eliminar/desactivar categoría.
- `GET /services` - Listar servicios (con filtros por categoría, búsqueda por texto e `isActive`).
- `GET /services/:id` - Obtener detalle de servicio por ID.
- `POST /services` - Crear servicio.
- `PATCH /services/:id` - Actualizar servicio.
- `DELETE /services/:id` - Desactivar servicio.
- `GET /services/template` - Descargar plantilla Excel de importación masiva.
- `POST /services/import` - Procesar archivo Excel/CSV e importar servicios.

---

## 4. Requerimientos de UI/UX (Next.js `/servicios`)

1. **Header & Acciones**: Botón "Nuevo Servicio", Botón "Gestionar Categorías", Botón "Importar Excel" y "Descargar Plantilla".
2. **Listado de Servicios**: Filtro rápido por categoría, barra de búsqueda en tiempo real, vista en tarjetas/grid o tabla con estado (`Activo`/`Inactivo`), precio y badge de duración (`45 min + 10 min buffer`).
3. **Modal/Drawer de Formulario (Wizard/Tabs)**:
   - Tab 1: General & Multimedia
   - Tab 2: Precio & Paquetes
   - Tab 3: Valoración & Evaluación
   - Tab 4: Tiempos & Contraindicaciones
   - Tab 5: Condiciones de Pago
4. **Modal de Importación Masiva**: Zone Drag & Drop para Excel, vista previa de filas procesadas correctamente y tabla de errores antes de confirmar el guardado definitivo.