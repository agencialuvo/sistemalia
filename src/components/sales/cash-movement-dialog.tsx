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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { registerCashMovement } from "@/lib/sales/api";
import {
  CASH_MOVEMENT_TYPE_LABELS,
  cashMovementSchema,
  MANUAL_CASH_MOVEMENT_TYPES,
  type ManualCashMovementType,
} from "@/lib/validators/sales";

const EMPTY_DRAFT = { type: "EXPENSE_OUT" as ManualCashMovementType, amount: "", concept: "" };
type Draft = typeof EMPTY_DRAFT;

/** Modal de ingreso/egreso manual de caja (Módulo 08 Fase 2, Task 2.2) —
 *  ej. "Pago de movilidad, compra de insumo menor" (plan.md §1 Pestaña 3). */
export function CashMovementDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
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
    const parsed = cashMovementSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "amount");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await registerCashMovement({
        type: parsed.data.type,
        amount: Number(parsed.data.amount),
        concept: parsed.data.concept.trim(),
      });
      toast.success(t("cashMovement.registered"));
      onOpenChange(false);
      onRegistered();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("cashMovement.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cashMovement.title")}</DialogTitle>
          <DialogDescription>{t("cashMovement.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>{t("cashMovement.typeLabel")}</Label>
            <Select
              value={draft.type}
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, type: (value as ManualCashMovementType) ?? d.type }))
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue>
                  {(value: string | null) =>
                    CASH_MOVEMENT_TYPE_LABELS[(value as ManualCashMovementType) ?? "EXPENSE_OUT"]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MANUAL_CASH_MOVEMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CASH_MOVEMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="cash-movement-amount">{t("cashMovement.amountLabel")}</Label>
            <Input
              id="cash-movement-amount"
              type="number"
              min={0}
              step="0.01"
              value={draft.amount}
              onChange={(event) => setDraft((d) => ({ ...d, amount: event.target.value }))}
              placeholder="0.00"
              className="mt-1.5"
            />
            {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount}</p>}
          </div>

          <div>
            <Label htmlFor="cash-movement-concept">{t("cashMovement.conceptLabel")}</Label>
            <Textarea
              id="cash-movement-concept"
              value={draft.concept}
              onChange={(event) => setDraft((d) => ({ ...d, concept: event.target.value }))}
              placeholder={t("cashMovement.conceptPlaceholder")}
              rows={2}
              className="mt-1.5"
            />
            {errors.concept && <p className="mt-1 text-xs text-destructive">{errors.concept}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("cashMovement.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
