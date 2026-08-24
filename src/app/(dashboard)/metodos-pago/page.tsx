"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CreditCard, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PaymentMethodCard } from "@/components/payment-methods/payment-method-card";
import { PaymentMethodFormDialog } from "@/components/payment-methods/payment-method-form-dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  deletePaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from "@/lib/payment-methods/api";
import type { PaymentMethodConfig } from "@/lib/validators/payment-methods";

/**
 * /metodos-pago — configuración de métodos de cobro que la IA usará más
 * adelante para generar el link de pago que le corresponde a cada uno.
 */
export default function PaymentMethodsPage() {
  const t = useTranslations("PaymentMethods");

  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethodConfig | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMethods(await listPaymentMethods());
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((method: PaymentMethodConfig) => {
    setEditing(method);
    setFormOpen(true);
  }, []);

  async function toggle(method: PaymentMethodConfig, isEnabled: boolean) {
    setTogglingId(method.id);
    try {
      const updated = await updatePaymentMethod(method.id, { isEnabled });
      setMethods((current) => current.map((item) => (item.id === method.id ? updated : item)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.toggleFailed")));
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePaymentMethod(deleteTarget.id);
      setMethods((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success(t("card.deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />
          {t("actions.new")}
        </Button>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : methods.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
            <CreditCard className="size-6 text-primary" />
          </div>
          <div className="max-w-sm">
            <h2 className="text-sm font-semibold text-foreground">{t("empty.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t("actions.new")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {methods.map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              onToggle={(target, enabled) => void toggle(target, enabled)}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              busy={togglingId === method.id}
            />
          ))}
        </div>
      )}

      <PaymentMethodFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        method={editing}
        onSaved={() => void load()}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        title={deleteTarget ? t("card.deleteConfirmTitle", { name: deleteTarget.label }) : ""}
        description={t("card.deleteConfirmDescription")}
      />
    </div>
  );
}
