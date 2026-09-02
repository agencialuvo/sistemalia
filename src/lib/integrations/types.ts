import type { ReactNode } from "react";

/**
 * Marketplace de Integraciones — modelo declarativo compartido por
 * /integraciones. Cada proveedor (Google Calendar, Meta, WhatsApp, TikTok
 * Ads, y cualquier futuro: Stripe, Zapier...) es UNA entrada de este tipo,
 * no un bloque de JSX propio — así la card, el grid, los filtros y la
 * búsqueda son 100% genéricos y agregar una integración nueva no toca el
 * layout, solo el registro (ver registry.ts).
 */

export type IntegrationCategory = "messaging" | "scheduling" | "ads" | "payments" | "automation";

export type IntegrationStatus = "connected" | "not_connected" | "coming_soon" | "error";

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  messaging: "Mensajería",
  scheduling: "Agenda",
  ads: "Ads",
  payments: "Pagos",
  automation: "Automatización",
};

export interface IntegrationDefinition {
  id: string;
  name: string;
  /** Máximo 2-3 líneas — la card la trunca con line-clamp por si acaso. */
  shortDescription: string;
  category: IntegrationCategory;
  logo: ReactNode;
  status: IntegrationStatus;
  /** Detalle corto bajo el nombre cuando status === "connected" (ej. "3 páginas conectadas"). */
  connectedSummary?: string;
  /** true mientras esta integración puntual tiene una request en vuelo (connect/disconnect). */
  pending?: boolean;
  /** not_connected/error -> dispara el flujo de conexión (OAuth redirect, SDK modal...).
   *  connected -> abre el panel de configuración de esa integración (ver IntegrationSettingsDialog).
   *  coming_soon -> el botón está deshabilitado, nunca se llama. */
  onAction: () => void;
}
