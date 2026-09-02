import { api } from "@/lib/api";
import type { SocialChannelProvider } from "@/lib/social-channels/api";

/**
 * Thin typed wrapper over Módulo 11 (`/marketing/prospects*`). `x-tenant-id`
 * is NOT set here — the axios request interceptor in src/lib/api.ts attaches
 * it to every call once AuthProvider knows the active centro estético (same
 * contract as lib/social-channels/api.ts).
 */

export const PROSPECT_STATUSES = ["NUEVO", "CONTACTADO", "CITADO", "NO_INTERESADO", "CONVERTIDO"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  CITADO: "Citado",
  NO_INTERESADO: "No interesado",
  CONVERTIDO: "Convertido",
};

/** Badge de color por estado — mismo criterio semántico que
 *  PATIENT_STATUS_LABELS/APPOINTMENT_STATUS_COLORS: no es UI, pero vive acá
 *  para que el color de un estado no diverja entre la tabla y el drawer. */
export const PROSPECT_STATUS_BADGE_VARIANT: Record<ProspectStatus, "default" | "secondary" | "destructive" | "outline"> = {
  NUEVO: "default",
  CONTACTADO: "secondary",
  CITADO: "secondary",
  NO_INTERESADO: "destructive",
  CONVERTIDO: "outline",
};

/** Etiqueta legible del canal de origen — reusa SocialChannelProvider en vez
 *  de declarar su propio enum, así un proveedor nuevo (ej. TikTok cuando
 *  Integraciones lo conecte) no necesita tocar dos archivos. */
export const SOURCE_PROVIDER_LABELS: Record<SocialChannelProvider, string> = {
  META_FACEBOOK: "Facebook",
  META_INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  WHATSAPP_OFFICIAL: "WhatsApp",
};

export interface ProspectChannelRef {
  id: string;
  provider: SocialChannelProvider;
  name: string;
}

export interface ProspectAssignedUserRef {
  id: string;
  fullName: string;
}

/** Prospect tal como lo devuelve la API — `channel`/`assignedUser` vienen
 *  incluidos siempre (list y detail comparten el mismo include en el
 *  backend), a diferencia de Patient donde list/detail difieren. */
export interface Prospect {
  id: string;
  tenantId: string;
  channelId: string | null;
  channel: ProspectChannelRef | null;
  fullName: string;
  phone: string;
  email: string | null;
  status: ProspectStatus;
  sourceProvider: SocialChannelProvider;
  campaignName: string | null;
  adName: string | null;
  formAnswers: Record<string, string> | null;
  assignedUserId: string | null;
  assignedUser: ProspectAssignedUserRef | null;
  patientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PROSPECT_PAGE_SIZES = [12, 24, 48] as const;
export type ProspectPageSize = (typeof PROSPECT_PAGE_SIZES)[number];

export interface ProspectFilters {
  search?: string;
  status?: ProspectStatus;
  sourceProvider?: SocialChannelProvider;
  page?: number;
  pageSize?: ProspectPageSize;
}

export interface ProspectPage {
  data: Prospect[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listProspects(filters: ProspectFilters = {}): Promise<ProspectPage> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.sourceProvider) params.sourceProvider = filters.sourceProvider;
  if (filters.page !== undefined) params.page = String(filters.page);
  if (filters.pageSize !== undefined) params.pageSize = String(filters.pageSize);

  const { data } = await api.get<ProspectPage>("/marketing/prospects", { params });
  return data;
}

export async function getProspect(id: string): Promise<Prospect> {
  const { data } = await api.get<Prospect>(`/marketing/prospects/${id}`);
  return data;
}

export interface UpdateProspectPayload {
  status?: ProspectStatus;
  assignedUserId?: string | null;
  fullName?: string;
  phone?: string;
  email?: string;
}

export async function updateProspect(id: string, payload: UpdateProspectPayload): Promise<Prospect> {
  const { data } = await api.patch<Prospect>(`/marketing/prospects/${id}`, payload);
  return data;
}

/** POST /marketing/prospects/:id/convert — sin body, crea el Patient con los
 *  datos que el prospecto ya trae. */
export async function convertProspectToPatient(id: string): Promise<Prospect> {
  const { data } = await api.post<Prospect>(`/marketing/prospects/${id}/convert`);
  return data;
}
