import { api } from "@/lib/api";
import type { SocialChannelProvider } from "@/lib/social-channels/api";

/**
 * Thin typed wrapper over Módulo 12 (`/marketing/inbox/conversations*`).
 * `x-tenant-id` is NOT set here — the axios request interceptor in
 * src/lib/api.ts attaches it to every call (same contract as
 * lib/prospects/api.ts).
 *
 * Named `marketing-inbox` (not `inbox`) on purpose: `src/lib/inbox/` already
 * holds the legacy wacrm Supabase-backed Bandeja de entrada (`/bandeja`,
 * Sidebar "main" group) — an unrelated, still-live feature with its own
 * Conversation/Message shape. This module is the NEW Inbox Unificado
 * (Feature 12) that talks to the NestJS backend instead.
 */

export const CONVERSATION_STATUSES = ["ABIERTA", "EN_ESPERA", "RESUELTA"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  ABIERTA: "Abierta",
  EN_ESPERA: "En espera",
  RESUELTA: "Resuelta",
};

/** Mismo criterio que PROSPECT_STATUS_BADGE_VARIANT: no es UI, pero vive acá
 *  para que el color de un estado no diverja entre la lista y el panel. */
export const CONVERSATION_STATUS_BADGE_VARIANT: Record<
  ConversationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ABIERTA: "default",
  EN_ESPERA: "secondary",
  RESUELTA: "outline",
};

export const MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/** Reusa SocialChannelProvider en vez de declarar su propio enum — mismo
 *  criterio que Prospect.sourceProvider. */
export const CHANNEL_PROVIDER_LABELS: Record<SocialChannelProvider, string> = {
  META_FACEBOOK: "Messenger",
  META_INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  WHATSAPP_OFFICIAL: "WhatsApp",
};

export interface ConversationChannelRef {
  id: string;
  provider: SocialChannelProvider;
  name: string;
}

export interface ConversationAssignedUserRef {
  id: string;
  fullName: string;
}

export interface ConversationProspectRef {
  id: string;
  fullName: string;
}

export interface ConversationPatientRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MessageAttachment {
  type: string;
  url: string;
}

export interface Message {
  id: string;
  conversationId: string;
  externalId: string | null;
  direction: MessageDirection;
  body: string;
  attachments: MessageAttachment[] | null;
  /** SENT/DELIVERED/READ/FAILED — string libre, ver Message.status en el
   *  schema (cada proveedor reporta sus propios estados de entrega). */
  status: string | null;
  sentByUserId: string | null;
  createdAt: string;
}

/** Conversation tal como la devuelve GET /marketing/inbox/conversations —
 *  list y detail comparten el mismo include en el backend (mismo criterio
 *  que Prospect). `messages` trae solo el último mensaje en la lista (preview
 *  de una línea, Columna 1) y el hilo completo en el detalle (`getConversation`,
 *  ver ConversationDetail abajo). */
export interface Conversation {
  id: string;
  tenantId: string;
  channelId: string;
  channel: ConversationChannelRef;
  externalUserId: string;
  contactName: string | null;
  contactPhone: string | null;
  status: ConversationStatus;
  assignedUserId: string | null;
  assignedUser: ConversationAssignedUserRef | null;
  prospectId: string | null;
  prospect: ConversationProspectRef | null;
  patientId: string | null;
  patient: ConversationPatientRef | null;
  /** Solo el último mensaje (0 o 1 elemento) fuera del detalle. */
  messages: Message[];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Mismo shape que Conversation, pero `messages` trae el hilo completo en
 *  orden cronológico ascendente. */
export type ConversationDetail = Conversation;

export const CONVERSATION_PAGE_SIZE = 30;

export interface ConversationFilters {
  search?: string;
  status?: ConversationStatus;
  provider?: SocialChannelProvider;
  page?: number;
  pageSize?: number;
}

export interface ConversationPage {
  data: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listConversations(filters: ConversationFilters = {}): Promise<ConversationPage> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.provider) params.provider = filters.provider;
  params.page = String(filters.page ?? 1);
  params.pageSize = String(filters.pageSize ?? CONVERSATION_PAGE_SIZE);

  const { data } = await api.get<ConversationPage>("/marketing/inbox/conversations", { params });
  return data;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const { data } = await api.get<ConversationDetail>(`/marketing/inbox/conversations/${id}`);
  return data;
}

export interface UpdateConversationPayload {
  status?: ConversationStatus;
  assignedUserId?: string | null;
}

export async function updateConversation(id: string, payload: UpdateConversationPayload): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/marketing/inbox/conversations/${id}`, payload);
  return data;
}

export async function sendConversationMessage(id: string, body: string): Promise<Message> {
  const { data } = await api.post<Message>(`/marketing/inbox/conversations/${id}/messages`, { body });
  return data;
}
