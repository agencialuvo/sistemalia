"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConversationList } from "@/components/marketing/inbox/conversation-list";
import { MessageThread } from "@/components/marketing/inbox/message-thread";
import { ContactPanel } from "@/components/marketing/inbox/contact-panel";
import { useConversationDirectory } from "@/hooks/use-conversation-directory";
import { getApiErrorMessage } from "@/lib/api";
import {
  getConversation,
  sendConversationMessage,
  type Conversation,
  type ConversationDetail,
} from "@/lib/marketing-inbox/api";
import { cn } from "@/lib/utils";

/** No hay websocket/SSE en este backend — el hilo activo se refresca por
 *  polling mientras está abierto (ver POLL_INTERVAL_MS en
 *  use-conversation-directory.ts, mismo criterio, intervalo más corto
 *  porque acá sí importa ver el mensaje entrante casi al toque). */
const THREAD_POLL_INTERVAL_MS = 6000;

/**
 * /bandeja-entrada — Módulo 12 (Inbox Unificado), Fase 3. Layout clásico de
 * 3 columnas (spec RF-1/RF-2/RF-3): lista de hilos, chat activo, ficha del
 * contacto. Vive en "Principal", debajo de "Panel" — antes en
 * `/marketing/inbox`, movida acá a pedido del usuario para que sea LA
 * "Bandeja de entrada" del sistema (la legacy Supabase-backed en `/bandeja`
 * ya no tiene entrada de menú, ver dashboard-nav.ts).
 */
export default function UnifiedInboxPage() {
  const t = useTranslations("UnifiedInbox");
  const directory = useConversationDirectory();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const activeRequestId = useRef(0);

  const loadThread = useCallback(async (id: string, silent: boolean) => {
    const requestId = ++activeRequestId.current;
    if (!silent) setThreadLoading(true);
    try {
      const detail = await getConversation(id);
      if (requestId !== activeRequestId.current) return;
      setActiveConversation(detail);
    } catch (error) {
      if (requestId !== activeRequestId.current) return;
      if (!silent) toast.error(getApiErrorMessage(error, t("thread.loadFailed")));
    } finally {
      if (requestId === activeRequestId.current) setThreadLoading(false);
    }
  }, [t]);

  function handleSelect(conversation: Conversation) {
    if (conversation.id === activeId) return;
    setActiveId(conversation.id);
    setActiveConversation(null);
    void loadThread(conversation.id, false);
  }

  function handleBackToList() {
    setActiveId(null);
    setActiveConversation(null);
  }

  // Poll el hilo activo mientras esté abierto.
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => {
      void loadThread(activeId, true);
    }, THREAD_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeId, loadThread]);

  async function handleSend(body: string): Promise<boolean> {
    if (!activeId) return false;
    setSending(true);
    try {
      const message = await sendConversationMessage(activeId, body);
      setActiveConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, message] } : prev,
      );
      directory.patchConversation(activeId, { messages: [message], lastMessageAt: message.createdAt });
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("thread.sendFailed")));
      // Refresca el hilo igual: InboxService.sendMessage guarda un Message
      // con status FAILED aunque el envío haya fallado, así que el error
      // debe quedar visible en la conversación.
      void loadThread(activeId, true);
      return false;
    } finally {
      setSending(false);
    }
  }

  function handleContactPanelChange(patch: Partial<ConversationDetail>) {
    setActiveConversation((prev) => (prev ? { ...prev, ...patch } : prev));
    if (activeId) directory.patchConversation(activeId, patch);
  }

  const hasActiveConversation = activeId !== null;

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      <div className="flex flex-1 overflow-hidden">
        <div className={cn("flex h-full flex-1 sm:flex-none", hasActiveConversation ? "hidden sm:flex" : "flex")}>
          <ConversationList
            conversations={directory.conversations}
            activeId={activeId}
            onSelect={handleSelect}
            search={directory.search}
            onSearchChange={directory.setSearch}
            status={directory.status}
            onStatusChange={directory.setStatus}
            loading={directory.loading}
            initialLoading={directory.initialLoading}
            error={directory.error}
            onRetry={() => void directory.refresh()}
          />
        </div>

        <div className={cn("flex h-full min-w-0 flex-1", hasActiveConversation ? "flex" : "hidden sm:flex")}>
          <div className="flex h-full min-w-0 flex-1 flex-col">
            {hasActiveConversation && (
              <div className="flex shrink-0 items-center border-b border-border px-2 py-1.5 sm:hidden">
                <Button variant="ghost" size="sm" onClick={handleBackToList}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  {t("thread.backToList")}
                </Button>
              </div>
            )}
            <MessageThread
              conversation={activeConversation}
              loading={threadLoading}
              sending={sending}
              onSend={handleSend}
            />
          </div>

          <ContactPanel conversation={activeConversation} onChanged={handleContactPanelChange} />
        </div>
      </div>
    </div>
  );
}
