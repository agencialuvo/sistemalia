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
import { closeCashRegister } from "@/lib/sales/api";
import { closeCashSchema, formatSolesAmount, type CashRegisterSummary } from "@/lib/validators/sales";

const EMPTY_DRAFT = { finalBalance: "", notes: "" };
type Draft = typeof EMPTY_DRAFT;

/** Modal de arqueo y cierre de caja (Módulo 08 Fase 2, Task 2.2, spec §3.5) —
 *  el usuario ingresa el conteo físico real; el backend calcula
 *  `expectedBalance` y `difference` server-side, nunca confía en lo que
 *  llega del cliente. */
export function CloseCashDialog({
  open,
  onOpenChange,
  register,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  register: CashRegisterSummary | null;
  onClosed: () => void;
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
    const parsed = closeCashSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "finalBalance");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const closed = await closeCashRegister({
        finalBalance: Number(parsed.data.finalBalance),
        notes: parsed.data.notes?.trim() || undefined,
      });
      const difference = Number(closed.difference ?? 0);
      toast.success(
        difference === 0
          ? t("closeCash.closedExact")
          : difference > 0
            ? t("closeCash.closedSurplus", { amount: formatSolesAmount(closed.difference) })
            : t("closeCash.closedShortage", { amount: formatSolesAmount(closed.difference) }),
      );
      onOpenChange(false);
      onClosed();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("closeCash.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (!register) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("closeCash.title")}</DialogTitle>
          <DialogDescription>{t("closeCash.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("closeCash.expectedLabel")}</span>
              <span className="font-semibold text-foreground">{formatSolesAmount(register.runningBalance)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("closeCash.expectedHint")}</p>
          </div>

          <div>
            <Label htmlFor="close-cash-balance">{t("closeCash.finalBalanceLabel")}</Label>
            <Input
              id="close-cash-balance"
              autoFocus
              type="number"
              min={0}
              step="0.01"
              value={draft.finalBalance}
              onChange={(event) => setDraft((d) => ({ ...d, finalBalance: event.target.value }))}
              placeholder="0.00"
              className="mt-1.5"
            />
            {errors.finalBalance && (
              <p className="mt-1 text-xs text-destructive">{errors.finalBalance}</p>
            )}
          </div>

          <div>
            <Label htmlFor="close-cash-notes">{t("closeCash.notesLabel")}</Label>
            <Textarea
              id="close-cash-notes"
              value={draft.notes}
              onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
              placeholder={t("closeCash.notesPlaceholder")}
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
          <Button variant="destructive" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("closeCash.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
