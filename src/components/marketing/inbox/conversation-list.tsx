"use client";

import { useTranslations } from "next-intl";
import { Loader2, MessageCircle, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CHANNEL_PROVIDER_LABELS,
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_BADGE_VARIANT,
  CONVERSATION_STATUS_LABELS,
  type Conversation,
} from "@/lib/marketing-inbox/api";
import type { ConversationStatusFilter } from "@/hooks/use-conversation-directory";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: ConversationStatusFilter[] = ["all", ...CONVERSATION_STATUSES];

function contactInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

/** Columna 1 (spec RF-1) — lista de hilos con badge de proveedor, último
 *  mensaje (vía `lastMessageAt`, ver denormalización en Conversation) y
 *  filtro por estado. */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  search,
  onSearchChange,
  status,
  onStatusChange,
  loading,
  initialLoading,
  error,
  onRetry,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conversation: Conversation) => void;
  search: string;
  onSearchChange: (value: string) => void;
  status: ConversationStatusFilter;
  onStatusChange: (value: ConversationStatusFilter) => void;
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("UnifiedInbox");

  return (
    <div className="flex h-full w-full flex-col border-r border-border sm:w-80 sm:shrink-0">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("list.searchPlaceholder")}
            className="pl-8"
            aria-label={t("list.searchPlaceholder")}
          />
        </div>
        <Select value={status} onValueChange={(value) => onStatusChange((value as ConversationStatusFilter | null) ?? "all")}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: ConversationStatusFilter | null) =>
                !value || value === "all" ? t("list.status.all") : CONVERSATION_STATUS_LABELS[value]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? t("list.status.all") : CONVERSATION_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <button className="mt-2 text-sm text-primary underline" onClick={onRetry}>
              {t("retry")}
            </button>
          </div>
        ) : initialLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessageCircle className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          </div>
        ) : (
          <ul className={cn(loading && "opacity-60 transition-opacity")}>
            {conversations.map((conversation) => {
              const displayName = conversation.contactName || conversation.contactPhone || t("list.unknownContact");
              const isActive = conversation.id === activeId;
              const lastMessage = conversation.messages[0] ?? null;
              const lastMessagePreview = lastMessage
                ? `${lastMessage.direction === "OUTBOUND" ? `${t("list.youPrefix")} ` : ""}${lastMessage.body}`
                : t("list.noMessagesYet");
              return (
                <li key={conversation.id}>
                  <button
                    onClick={() => onSelect(conversation)}
                    className={cn(
                      "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      isActive && "bg-muted",
                    )}
                  >
                    <Avatar size="sm" className="mt-0.5">
                      <AvatarFallback>{contactInitials(conversation.contactName).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {CHANNEL_PROVIDER_LABELS[conversation.channel.provider]}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted-foreground">{lastMessagePreview}</p>
                        <Badge variant={CONVERSATION_STATUS_BADGE_VARIANT[conversation.status]} className="shrink-0 text-[10px]">
                          {CONVERSATION_STATUS_LABELS[conversation.status]}
                        </Badge>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
