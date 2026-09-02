import { api } from "@/lib/api";

/**
 * Thin typed wrapper over Módulo 10 (`/marketing/channels*`). `x-tenant-id`
 * is NOT set here — the axios request interceptor in src/lib/api.ts attaches
 * it to every call once AuthProvider knows the active centro estético (same
 * contract as lib/integrations/google-calendar.ts).
 */

export const SOCIAL_CHANNEL_PROVIDERS = [
  "META_FACEBOOK",
  "META_INSTAGRAM",
  "TIKTOK",
  "WHATSAPP_OFFICIAL",
] as const;
export type SocialChannelProvider = (typeof SOCIAL_CHANNEL_PROVIDERS)[number];

export type SocialChannelStatus = "ACTIVE" | "EXPIRED" | "DISCONNECTED";

/** SocialChannel tal como lo devuelve la API — nunca trae accessToken ni
 *  refreshToken (backend/.../serializers/social-channel.serializer.ts los
 *  descarta antes de responder). */
export interface SocialChannel {
  id: string;
  tenantId: string;
  provider: SocialChannelProvider;
  externalId: string;
  name: string;
  expiresAt: string | null;
  status: SocialChannelStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /marketing/channels. */
export async function listSocialChannels(): Promise<SocialChannel[]> {
  const { data } = await api.get<SocialChannel[]>("/marketing/channels");
  return data;
}

/** POST /marketing/channels/meta/connect — `accessToken` es el token corto
 *  de usuario que devuelve `FB.login()` en el navegador. */
export async function connectMetaChannel(accessToken: string): Promise<SocialChannel[]> {
  const { data } = await api.post<SocialChannel[]>("/marketing/channels/meta/connect", { accessToken });
  return data;
}

export interface ConnectWhatsAppPayload {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/** POST /marketing/channels/whatsapp/connect — `code`/`wabaId`/`phoneNumberId`
 *  vienen del flujo de Meta Embedded Signup (ver useMetaSdk). */
export async function connectWhatsAppChannel(payload: ConnectWhatsAppPayload): Promise<SocialChannel> {
  const { data } = await api.post<SocialChannel>("/marketing/channels/whatsapp/connect", payload);
  return data;
}

/** DELETE /marketing/channels/:id. */
export async function disconnectSocialChannel(id: string): Promise<{ id: string }> {
  const { data } = await api.delete<{ id: string }>(`/marketing/channels/${id}`);
  return data;
}
