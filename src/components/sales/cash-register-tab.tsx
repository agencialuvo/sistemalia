"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Lock, LockOpen, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CashMovementDialog } from "@/components/sales/cash-movement-dialog";
import { CloseCashDialog } from "@/components/sales/close-cash-dialog";
import { OpenCashDialog } from "@/components/sales/open-cash-dialog";
import { getCurrentCashRegister } from "@/lib/sales/api";
import {
  CASH_MOVEMENT_TYPE_LABELS,
  formatSolesAmount,
  PAYMENT_METHOD_LABELS,
  type CashRegisterSummary,
  type PaymentMethod,
} from "@/lib/validators/sales";

const PAYMENT_METHOD_ORDER: PaymentMethod[] = ["CASH", "YAPE", "PLIN", "CARD", "TRANSFER"];

/**
 * Pestaña "Caja Chica y Arqueo" (Módulo 08 Fase 2, Task 2.3, plan.md
 * Pestaña 3). Sondea GET /sales/cash-registers/current en cada montaje o
 * `refreshKey` — no hay websocket, así que el estado se refresca tras
 * cualquier acción que lo cambie (abrir, cerrar, movimiento manual, cobro).
 */
export function CashRegisterTab({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const t = useTranslations("Sales");

  const [register, setRegister] = useState<CashRegisterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCurrentCashRegister();
      setRegister(result);
      setError(null);
    } catch {
      setError(t("cashRegister.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  function handleChanged() {
    void refresh();
    onChanged();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
          {t("cashRegister.retry")}
        </Button>
      </div>
    );
  }

  if (!register) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <Lock className="size-8 text-muted-foreground/60" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("cashRegister.closedTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cashRegister.closedDescription")}</p>
        </div>
        <Button size="sm" onClick={() => setOpenDialogOpen(true)}>
          <LockOpen className="mr-1.5 size-4" />
          {t("cashRegister.openAction")}
        </Button>

        <OpenCashDialog open={openDialogOpen} onOpenChange={setOpenDialogOpen} onOpened={handleChanged} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t("cashRegister.openBadge")}</Badge>
          <span className="text-xs text-muted-foreground">
            {t("cashRegister.openedAt", { date: new Date(register.openedAt).toLocaleString("es-PE") })}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMovementDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            {t("cashRegister.movementAction")}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setCloseDialogOpen(true)}>
            <Lock className="mr-1.5 size-4" />
            {t("cashRegister.closeAction")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label={t("cashRegister.initialBalance")} value={formatSolesAmount(register.initialBalance)} />
        {PAYMENT_METHOD_ORDER.map((method) => (
          <SummaryCard
            key={method}
            label={PAYMENT_METHOD_LABELS[method]}
            value={formatSolesAmount(
              register.paymentsByMethod.find((row) => row.method === method)?.total ?? "0.00",
            )}
          />
        ))}
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">{t("cashRegister.expectedBalance")}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">
          {formatSolesAmount(register.runningBalance)}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">{t("cashRegister.movementsTitle")}</h3>
        {register.movements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t("cashRegister.noMovements")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{t("cashRegister.table.date")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("cashRegister.table.type")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("cashRegister.table.concept")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("cashRegister.table.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {register.movements.map((movement) => {
                  const isExpense = movement.type === "EXPENSE_OUT" || movement.type === "COMMISSION_PAYMENT";
                  return (
                    <tr key={movement.id}>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(movement.createdAt).toLocaleString("es-PE")}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{CASH_MOVEMENT_TYPE_LABELS[movement.type]}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{movement.concept ?? "—"}</td>
                      <td
                        className={
                          isExpense
                            ? "px-3 py-2.5 text-right font-medium text-destructive"
                            : "px-3 py-2.5 text-right font-medium text-foreground"
                        }
                      >
                        {isExpense ? "-" : "+"} {formatSolesAmount(movement.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CashMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        onRegistered={handleChanged}
      />
      <CloseCashDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        register={register}
        onClosed={handleChanged}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
