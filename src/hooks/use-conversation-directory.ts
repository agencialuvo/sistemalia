"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listConversations,
  type Conversation,
  type ConversationStatus,
} from "@/lib/marketing-inbox/api";
import type { SocialChannelProvider } from "@/lib/social-channels/api";

/** Same debounce as useProspectDirectory/usePatientDirectory. */
const SEARCH_DEBOUNCE_MS = 300;

/** No hay websocket/SSE en este backend todavía — el "tiempo real" de RF-2
 *  es best-effort vía polling, mismo criterio que use-presence.ts. 15s es un
 *  compromiso entre frescura de la lista y no saturar la API con cada
 *  agente con el Inbox abierto en una pestaña. */
const POLL_INTERVAL_MS = 15000;

export type ConversationStatusFilter = "all" | ConversationStatus;
export type ConversationProviderFilter = "all" | SocialChannelProvider;

function toFilters(
  search: string,
  status: ConversationStatusFilter,
  provider: ConversationProviderFilter,
) {
  return {
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    provider: provider === "all" ? undefined : provider,
  };
}

export interface ConversationDirectoryState {
  conversations: Conversation[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  status: ConversationStatusFilter;
  setStatus: (value: ConversationStatusFilter) => void;
  provider: ConversationProviderFilter;
  setProvider: (value: ConversationProviderFilter) => void;
  total: number;
  refresh: () => Promise<void>;
  /** Aplica un patch optimista a una conversación de la lista (estado,
   *  asignación, último mensaje) sin esperar el próximo poll. */
  patchConversation: (id: string, patch: Partial<Conversation>) => void;
}

/** Carga el directorio de conversaciones y lo mantiene sincronizado con los
 *  filtros — mismo shape que useProspectDirectory. El filtrado ocurre en el
 *  SERVIDOR (GET /marketing/inbox/conversations toma search/status/provider). */
export function useConversationDirectory(): ConversationDirectoryState {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<ConversationStatusFilter>("all");
  const [provider, setProviderState] = useState<ConversationProviderFilter>("all");
  const [total, setTotal] = useState(0);

  const setSearch = useCallback((value: string) => setSearchState(value), []);
  const setStatus = useCallback((value: ConversationStatusFilter) => setStatusState(value), []);
  const setProvider = useCallback((value: ConversationProviderFilter) => setProviderState(value), []);

  const requestId = useRef(0);

  const load = useCallback(async (filters: ReturnType<typeof toFilters>, silent: boolean) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const result = await listConversations(filters);
      if (id !== requestId.current) return;
      setConversations(result.data);
      setTotal(result.total);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      if (!silent) setError("No se pudo cargar el listado de conversaciones.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(toFilters(search, status, provider), false);
  }, [load, search, status, provider]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, status, provider), false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, status, provider]);

  // Polling silencioso — no dispara el spinner de carga completo, solo
  // refresca la data en segundo plano (ver POLL_INTERVAL_MS).
  useEffect(() => {
    const interval = setInterval(() => {
      void load(toFilters(search, status, provider), true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load, search, status, provider]);

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  return {
    conversations,
    loading,
    initialLoading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    provider,
    setProvider,
    total,
    refresh,
    patchConversation,
  };
}
