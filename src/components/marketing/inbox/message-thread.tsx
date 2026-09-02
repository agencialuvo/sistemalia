"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, MessageCircle, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNEL_PROVIDER_LABELS,
  type ConversationDetail,
  type Message,
} from "@/lib/marketing-inbox/api";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/** Columna 2 (spec RF-2) — hilo cronológico diferenciando INBOUND/OUTBOUND,
 *  con entrada de texto y soporte visual para mensajes `FAILED`. */
export function MessageThread({
  conversation,
  loading,
  sending,
  onSend,
}: {
  conversation: ConversationDetail | null;
  loading: boolean;
  sending: boolean;
  onSend: (body: string) => Promise<boolean>;
}) {
  const t = useTranslations("UnifiedInbox");
  const [draft, setDraft] = useState("");
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.length, conversation?.id]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    const success = await onSend(body);
    if (success) setDraft("");
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 text-center">
        <MessageCircle className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("thread.emptyState")}</p>
      </div>
    );
  }

  const displayName = conversation.contactName || conversation.contactPhone || t("list.unknownContact");

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground">{CHANNEL_PROVIDER_LABELS[conversation.channel.provider]}</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversation.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("thread.noMessages")}</p>
          ) : (
            conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={scrollBottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t("thread.composerPlaceholder")}
            className="min-h-16 resize-none"
            disabled={sending}
          />
          <Button onClick={() => void handleSend()} disabled={sending || !draft.trim()} size="icon">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const t = useTranslations("UnifiedInbox");
  const isOutbound = message.direction === "OUTBOUND";
  const failed = message.status === "FAILED";

  return (
    <div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          failed && "border border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <div className="mt-1 flex items-center gap-1.5 px-1">
        <span className="text-[11px] text-muted-foreground">{formatTime(message.createdAt)}</span>
        {failed && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertCircle className="size-3" />
            {t("thread.messageFailed")}
          </Badge>
        )}
      </div>
    </div>
  );
}
