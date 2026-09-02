"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createAbsence, listAbsences, removeAbsence } from "@/lib/staff/api";
import {
  absenceSchema,
  EXCEPTION_TYPES,
  type ExceptionType,
  type StaffAbsence,
  type StaffMember,
} from "@/lib/validators/staff";

const EMPTY_DRAFT = {
  type: "CUSTOM_OFF" as ExceptionType,
  reason: "",
  internalNote: "",
  startDate: "",
  endDate: "",
};

/** "2026-09-01T00:00:00.000Z" -> "1 sept 2026". */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Ausencias/vacaciones de un profesional (spec §2.2 Bloque 4 / §4 "Modal de
 * Ausencias"). Lives in its own dialog, opened from StaffCard's menu — a
 * StaffMember can have many ausencias over time, so this isn't a tab on the
 * main form, it's a separate flow scoped to one professional.
 */
export function AbsenceDialog({
  open,
  onOpenChange,
  staff,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
  /** Fired after any successful write so the grid's summary can reload. */
  onChanged: () => void;
}) {
  const t = useTranslations("Staff");

  const [absences, setAbsences] = useState<StaffAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staff) return;
    setLoading(true);
    try {
      setAbsences(await listAbsences(staff.id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("absences.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [staff, t]);

  useEffect(() => {
    if (open && staff) {
      void load();
      setDraft(null);
      setErrors({});
    }
  }, [open, staff, load]);

  async function save() {
    if (!draft || !staff) return;

    const parsed = absenceSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "reason");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await createAbsence(staff.id, {
        type: parsed.data.type,
        reason: parsed.data.reason,
        internalNote: parsed.data.internalNote?.trim() || undefined,
        startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`).toISOString(),
        endDate: new Date(`${parsed.data.endDate}T00:00:00.000Z`).toISOString(),
      });
      toast.success(t("absences.created"));
      setDraft(null);
      setErrors({});
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("absences.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function remove(absence: StaffAbsence) {
    if (!window.confirm(t("absences.confirmDelete", { reason: absence.reason }))) return;

    setDeletingId(absence.id);
    try {
      await removeAbsence(absence.id);
      toast.success(t("absences.deleted"));
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("absences.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("absences.title")}</DialogTitle>
          <DialogDescription>
            {staff ? t("absences.description", { name: `${staff.firstName} ${staff.lastName}` }) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {draft ? (
            <div className="mb-5 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <div>
                <Label htmlFor="absence-type">{t("absences.typeLabel")}</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) =>
                    setDraft({ ...draft, type: (value as ExceptionType | null) ?? "CUSTOM_OFF" })
                  }
                >
                  <SelectTrigger id="absence-type" className="mt-1.5 w-full">
                    <SelectValue>
                      {(value: ExceptionType | null) => t(`absences.types.${value ?? "CUSTOM_OFF"}`)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`absences.types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(`absences.typeHelp.${draft.type}`)}
                </p>
              </div>

              <div>
                <Label htmlFor="absence-reason">{t("absences.reasonLabel")}</Label>
                <Input
                  id="absence-reason"
                  value={draft.reason}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                  placeholder={t("absences.reasonPlaceholder")}
                  className="mt-1.5"
                  autoFocus
                />
                {errors.reason && <p className="mt-1 text-xs text-destructive">{errors.reason}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="absence-start">{t("absences.startLabel")}</Label>
                  <Input
                    id="absence-start"
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
                    className="mt-1.5"
                  />
                  {errors.startDate && (
                    <p className="mt-1 text-xs text-destructive">{errors.startDate}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="absence-end">{t("absences.endLabel")}</Label>
                  <Input
                    id="absence-end"
                    type="date"
                    value={draft.endDate}
                    onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                    className="mt-1.5"
                  />
                  {errors.endDate && (
                    <p className="mt-1 text-xs text-destructive">{errors.endDate}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="absence-internal-note">{t("absences.internalNoteLabel")}</Label>
                <Textarea
                  id="absence-internal-note"
                  value={draft.internalNote}
                  onChange={(event) => setDraft({ ...draft, internalNote: event.target.value })}
                  placeholder={t("absences.internalNotePlaceholder")}
                  rows={2}
                  className="mt-1.5"
                />
                {errors.internalNote && (
                  <p className="mt-1 text-xs text-destructive">{errors.internalNote}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mb-4"
              onClick={() => {
                setErrors({});
                setDraft({ ...EMPTY_DRAFT });
              }}
            >
              <Plus className="mr-1.5 size-4" />
              {t("absences.newButton")}
            </Button>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : absences.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarOff className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t("absences.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {absences.map((absence) => (
                <li key={absence.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {absence.reason}
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t(`absences.types.${absence.type}`)}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(absence.startDate)} — {formatDate(absence.endDate)}
                    </p>
                    {absence.internalNote && (
                      <p className="truncate text-xs text-muted-foreground/80">
                        {absence.internalNote}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(absence)}
                    disabled={deletingId === absence.id}
                    aria-label={t("common.delete")}
                  >
                    {deletingId === absence.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
