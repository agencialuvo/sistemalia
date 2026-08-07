# INSTRUCCIONES PARA EL AGENTE DE IA (SISTEMA LIA)

Estás trabajando en "LIA", un sistema SaaS para centros estéticos construido sobre la base del repositorio `wacrm`.

## REGLAS DE OPERACIÓN ESTRICTAS:
1. **Desarrollo Guiado por Especificaciones (SDD):** Antes de crear cualquier tabla, endpoint o componente de frontend, debes leer y cumplir estrictamente los requisitos en `docs/specs/`.
2. **Prioridad Actual:** Estamos implementando el módulo `01_onboarding_plans.spec.md`.
3. **Enfoque Multi-Tenant Inicial:** Aunque no hay planes de pago comerciales definidos aún, la base de datos DEBE quedar preparada para separar los datos. Cada registro nuevo debe asociarse a un `tenant_id` (Centro Estético).
4. **Stack Técnico:** Mantén el uso nativo de Next.js 16, Supabase Auth y Tailwind v4 provistos por `wacrm`.