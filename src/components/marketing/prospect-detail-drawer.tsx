"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Mail, Megaphone, Phone, UserCheck } from "lucide-react";

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getApiErrorMessage } from "@/lib/api";
import {
  convertProspectToPatient,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUSES,
  SOURCE_PROVIDER_LABELS,
  updateProspect,
  type Prospect,
  type ProspectStatus,
} from "@/lib/prospects/api";

/**
 * Módulo 11, Fase 3 (Task 3.2). El detalle completo ya viaja en el mismo
 * objeto `Prospect` que la tabla usa para la fila (`formAnswers` incluido:
 * backend/.../prospects.service.ts usa el mismo `include` para list y
 * detail) — así que este drawer no hace su propio fetch, solo recibe el
 * prospecto seleccionado y notifica al padre cuándo refrescar.
 */
export function ProspectDetailDrawer({
  open,
  onOpenChange,
  prospect,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: Prospect | null;
  onChanged: () => void;
}) {
  const t = useTranslations("Prospects");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [converting, setConverting] = useState(false);

  if (!prospect) return null;

  async function handleStatusChange(status: ProspectStatus) {
    if (!prospect || status === prospect.status) return;
    setUpdatingStatus(true);
    try {
      await updateProspect(prospect.id, { status });
      toast.success(t("detail.statusUpdated"));
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.statusUpdateFailed")));
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleConvert() {
    if (!prospect) return;
    setConverting(true);
    try {
      await convertProspectToPatient(prospect.id);
      toast.success(t("detail.convertSuccess"));
      onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("detail.convertFailed")));
    } finally {
      setConverting(false);
    }
  }

  const formAnswerEntries = Object.entries(prospect.formAnswers ?? {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border/80">
          <SheetTitle>{prospect.fullName}</SheetTitle>
          <SheetDescription>
            {t("detail.sourceLine", { provider: SOURCE_PROVIDER_LABELS[prospect.sourceProvider] })}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div>
            <Label>{t("detail.statusLabel")}</Label>
            <Select
              value={prospect.status}
              onValueChange={(value) => value && void handleStatusChange(value as ProspectStatus)}
              disabled={updatingStatus || prospect.status === "CONVERTIDO"}
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue>{() => PROSPECT_STATUS_LABELS[prospect.status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROSPECT_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {PROSPECT_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center gap-2 text-foreground">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              {prospect.phone}
            </div>
            {prospect.email && (
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                {prospect.email}
              </div>
            )}
            {prospect.assignedUser && (
              <div className="flex items-center gap-2 text-foreground">
                <UserCheck className="size-4 shrink-0 text-muted-foreground" />
                {t("detail.assignedTo", { name: prospect.assignedUser.fullName })}
              </div>
            )}
          </div>

          {(prospect.campaignName || prospect.adName) && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Megaphone className="size-3.5" />
                {t("detail.originLabel")}
              </Label>
              <div className="rounded-lg border border-border p-3 text-sm">
                {prospect.campaignName && (
                  <p>
                    <span className="text-muted-foreground">{t("detail.campaignLabel")}: </span>
                    {prospect.campaignName}
                  </p>
                )}
                {prospect.adName && (
                  <p>
                    <span className="text-muted-foreground">{t("detail.adLabel")}: </span>
                    {prospect.adName}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("detail.formAnswersLabel")}</Label>
            {formAnswerEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noFormAnswers")}</p>
            ) : (
              <div className="space-y-2">
                {formAnswerEntries.map(([question, answer]) => (
                  <div key={question} className="rounded-lg border border-border p-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">{question}</p>
                    <p className="mt-0.5 text-foreground">{answer || t("detail.emptyAnswer")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {prospect.patientId ? (
            <Badge variant="outline" className="gap-1">
              <UserCheck className="size-3" />
              {t("detail.alreadyConverted")}
            </Badge>
          ) : (
            <Button className="w-full" onClick={() => void handleConvert()} disabled={converting}>
              {converting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("detail.convertButton")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
