"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowUpRight, Loader2, Phone, Radio, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api";
import {
  CHANNEL_PROVIDER_LABELS,
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_LABELS,
  updateConversation,
  type ConversationDetail,
  type ConversationStatus,
} from "@/lib/marketing-inbox/api";

/**
 * Columna 3 (spec RF-3) — estado del hilo, datos del contacto y acceso
 * rápido a la Ficha 360° del Paciente/Prospecto vinculado (`prospect`/
 * `patient`, resueltos por teléfono en la ingesta — ver
 * InboxService.findOrCreateConversation en el backend).
 *
 * Sin selector de asignación a un usuario del equipo: no existe todavía un
 * endpoint de "listar miembros del tenant" consumible desde el frontend —
 * mismo gap que Prospectos (Feature 11), que tampoco lo construyó. El
 * usuario asignado se muestra de solo lectura; queda documentado como
 * pendiente en tasks.md.
 */
export function ContactPanel({
  conversation,
  onChanged,
}: {
  conversation: ConversationDetail | null;
  onChanged: (patch: Partial<ConversationDetail>) => void;
}) {
  const t = useTranslations("UnifiedInbox");
  const router = useRouter();
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!conversation) {
    return (
      <div className="hidden h-full w-72 shrink-0 border-l border-border lg:block" />
    );
  }

  async function handleStatusChange(status: ConversationStatus) {
    if (!conversation || status === conversation.status) return;
    setUpdatingStatus(true);
    try {
      await updateConversation(conversation.id, { status });
      onChanged({ status });
      toast.success(t("panel.statusUpdated"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("panel.statusUpdateFailed")));
    } finally {
      setUpdatingStatus(false);
    }
  }

  const displayName = conversation.contactName || conversation.contactPhone || t("list.unknownContact");

  return (
    <div className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-border p-4 lg:flex">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{displayName}</h3>
        <p className="text-xs text-muted-foreground">{t("panel.title")}</p>
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-border p-3 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Radio className="size-4 shrink-0 text-muted-foreground" />
          {CHANNEL_PROVIDER_LABELS[conversation.channel.provider]} · {conversation.channel.name}
        </div>
        {conversation.contactPhone && (
          <div className="flex items-center gap-2 text-foreground">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            {conversation.contactPhone}
          </div>
        )}
        <div className="flex items-center gap-2 text-foreground">
          <UserCheck className="size-4 shrink-0 text-muted-foreground" />
          {conversation.assignedUser ? conversation.assignedUser.fullName : t("panel.unassigned")}
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>{t("panel.statusLabel")}</Label>
        <Select
          value={conversation.status}
          onValueChange={(value) => value && void handleStatusChange(value as ConversationStatus)}
          disabled={updatingStatus}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{() => CONVERSATION_STATUS_LABELS[conversation.status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CONVERSATION_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {CONVERSATION_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>{t("panel.crmLabel")}</Label>
        {conversation.patient ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => router.push(`/pacientes/${conversation.patient!.id}`)}
          >
            <span className="truncate">
              {conversation.patient.firstName} {conversation.patient.lastName}
            </span>
            <ArrowUpRight className="size-4 shrink-0" />
          </Button>
        ) : conversation.prospect ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => router.push("/marketing/prospectos")}
          >
            <span className="truncate">{conversation.prospect.fullName}</span>
            <ArrowUpRight className="size-4 shrink-0" />
          </Button>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-center">
            <Badge variant="outline" className="mb-1">
              {t("panel.noCrmLink")}
            </Badge>
            <p className="text-xs text-muted-foreground">{t("panel.noCrmLinkHelp")}</p>
          </div>
        )}
      </div>

      {updatingStatus && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t("panel.saving")}
        </div>
      )}
    </div>
  );
}
