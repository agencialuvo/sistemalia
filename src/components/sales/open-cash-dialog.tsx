"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { openCashRegister } from "@/lib/sales/api";
import { openCashSchema } from "@/lib/validators/sales";

const EMPTY_DRAFT = { initialBalance: "", notes: "" };
type Draft = typeof EMPTY_DRAFT;

/** Modal de apertura de caja (Módulo 08 Fase 2, Task 2.2) — exige un monto
 *  inicial antes de permitir cobros (spec §3.1). */
export function OpenCashDialog({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: () => void;
}) {
  const t = useTranslations("Sales");

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(EMPTY_DRAFT);
      setErrors({});
    }
  }, [open]);

  async function save() {
    const parsed = openCashSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "initialBalance");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await openCashRegister({
        initialBalance: Number(parsed.data.initialBalance),
        notes: parsed.data.notes?.trim() || undefined,
      });
      toast.success(t("openCash.opened"));
      onOpenChange(false);
      onOpened();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("openCash.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("openCash.title")}</DialogTitle>
          <DialogDescription>{t("openCash.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="open-cash-balance">{t("openCash.initialBalanceLabel")}</Label>
            <Input
              id="open-cash-balance"
              autoFocus
              type="number"
              min={0}
              step="0.01"
              value={draft.initialBalance}
              onChange={(event) => setDraft((d) => ({ ...d, initialBalance: event.target.value }))}
              placeholder="0.00"
              className="mt-1.5"
            />
            {errors.initialBalance && (
              <p className="mt-1 text-xs text-destructive">{errors.initialBalance}</p>
            )}
          </div>

          <div>
            <Label htmlFor="open-cash-notes">{t("openCash.notesLabel")}</Label>
            <Textarea
              id="open-cash-notes"
              value={draft.notes}
              onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
              placeholder={t("openCash.notesPlaceholder")}
              rows={2}
              className="mt-1.5"
            />
            {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("openCash.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
