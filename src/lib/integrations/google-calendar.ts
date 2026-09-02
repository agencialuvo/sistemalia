import { api } from "@/lib/api";

/**
 * Thin typed wrapper over the Módulo 09 endpoints (`/integrations/google/*`).
 *
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call once AuthProvider knows the active
 * centro estético (same contract as lib/sales/api.ts y lib/inventory/api.ts).
 * The one exception is GET /integrations/google/callback, which the browser
 * hits directly as a full-page redirect from Google — never through this
 * client, and never carrying that header (see backend's controller doc
 * comment on why that route resolves its tenant from `state` instead).
 */

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
}

export interface GoogleIntegrationStatus {
  connected: boolean;
  syncEnabled: boolean;
  parentCalendarId: string | null;
}

/** GET /integrations/google/connect — la UI abre la URL devuelta (1-clic
 *  estilo Metricool) en vez de que el backend redirija él mismo. */
export async function getGoogleConnectUrl(): Promise<string> {
  const { data } = await api.get<{ url: string }>("/integrations/google/connect");
  return data.url;
}

export async function getGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  const { data } = await api.get<GoogleIntegrationStatus>("/integrations/google/status");
  return data;
}

export async function listGoogleCalendars(): Promise<GoogleCalendar[]> {
  const { data } = await api.get<GoogleCalendar[]>("/integrations/google/calendars");
  return data;
}

export async function selectGoogleParentCalendar(calendarId: string): Promise<void> {
  await api.post("/integrations/google/select-parent", { calendarId });
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await api.delete("/integrations/google/disconnect");
}
