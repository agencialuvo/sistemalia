"use client";

import { useTranslations } from "next-intl";
import { Building2, Landmark, Pencil, Smartphone, Trash2, Wallet } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_FIELDS, type PaymentMethodConfig } from "@/lib/validators/payment-methods";

const TYPE_ICON = {
  MERCADO_PAGO: Wallet,
  YAPE: Smartphone,
  PLIN: Smartphone,
  BANK_ACCOUNT: Landmark,
  OTHER: Building2,
} as const;

/** A secret field (Mercado Pago's access token) never gets rendered back on
 *  the card, even masked — it was already sent to the server, so there is no
 *  reason to keep showing it in the browser. */
export function PaymentMethodCard({
  method,
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  method: PaymentMethodConfig;
  onToggle: (method: PaymentMethodConfig, enabled: boolean) => void;
  onEdit: (method: PaymentMethodConfig) => void;
  onDelete: (method: PaymentMethodConfig) => void;
  busy: boolean;
}) {
  const t = useTranslations("PaymentMethods");
  const Icon = TYPE_ICON[method.type];
  const visibleFields = PAYMENT_METHOD_FIELDS[method.type].filter((field) => !field.secret);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4",
        !method.isEnabled && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{method.label}</p>
            <p className="text-xs text-muted-foreground">{t(`types.${method.type}`)}</p>
          </div>
        </div>
        <Switch
          checked={method.isEnabled}
          onCheckedChange={(checked) => onToggle(method, checked)}
          disabled={busy}
          aria-label={t("card.toggle")}
        />
      </div>

      {visibleFields.length > 0 && (
        <div className="space-y-1 rounded-lg bg-muted/40 p-2.5 text-xs">
          {visibleFields.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t(`fields.${field.labelKey}`)}</span>
              <span className="truncate font-medium text-foreground">
                {method.details[field.key] || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onEdit(method)}
          aria-label={t("common.edit")}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(method)}
          aria-label={t("common.delete")}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
