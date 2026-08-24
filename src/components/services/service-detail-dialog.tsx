"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration, formatSoles, type Service } from "@/lib/validators/service";

/**
 * Read-only preview opened by clicking a service card (spec: "abre un modal
 * de lectura/vista previa... mostrando toda la información del servicio
 * organizada por bloques"). Editing still goes through ServiceFormDialog —
 * this one has no inputs, just an "Editar" shortcut in the footer.
 */
export function ServiceDetailDialog({
  open,
  onOpenChange,
  service,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
  onEdit: (service: Service) => void;
}) {
  const t = useTranslations("Services");
  if (!service) return null;

  const isPackage = service.structureType === "SESSIONS";
  const isDeposit = service.paymentMethods.includes("DEPOSIT");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="relative h-44 w-full shrink-0 bg-muted">
          {service.mainImageUrl ? (
            <Image
              src={service.mainImageUrl}
              alt={service.name}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="size-10 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute right-3 top-3">
            <Badge variant={service.isActive ? "default" : "secondary"}>
              {service.isActive ? t("card.active") : t("card.inactive")}
            </Badge>
          </div>
        </div>

        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-5 pb-5">
          <span
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: service.category.color ?? "var(--color-muted-foreground)" }}
            />
            {service.category.name}
          </span>
          <DialogTitle className="text-lg">{service.name}</DialogTitle>
          {service.commercialDescription && (
            <DialogDescription>{service.commercialDescription}</DialogDescription>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <DetailBlock title={t("detail.pricingTitle")}>
            <DetailRow label={t("detail.priceLabel")} value={formatSoles(service.singlePrice)} />
            {isPackage &&
              service.packages.map((pkg) => (
                <div key={pkg.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {t("detail.packageSessions", { count: pkg.sessionCount })}
                    {pkg.frequencyDays !== null &&
                      ` · ${t("detail.frequencyEvery", { count: pkg.frequencyDays })}`}
                  </span>
                  <span className="font-medium text-foreground">{formatSoles(pkg.price)}</span>
                </div>
              ))}
          </DetailBlock>

          {service.requiresEvaluation && (
            <DetailBlock title={t("detail.evaluationTitle")}>
              <DetailRow
                label={t("detail.evaluationServiceLabel")}
                value={service.evaluationService?.name ?? t("detail.evaluationMissing")}
              />
              <DetailRow label={t("detail.evaluationCostLabel")} value={formatSoles(service.evaluationCost)} />
              {service.isEvaluationDeductible && (
                <DetailRow
                  label={t("detail.deductibleLabel")}
                  value={
                    service.deductibleExpirationDays
                      ? t("detail.days", { count: service.deductibleExpirationDays })
                      : t("detail.deductibleNoExpiration")
                  }
                />
              )}
            </DetailBlock>
          )}

          <DetailBlock title={t("detail.timingTitle")}>
            <DetailRow
              label={t("detail.durationLabel")}
              value={formatDuration(service.durationMinutes, service.bufferMinutes)}
            />
            {service.contraindications.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {service.contraindications.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {service.prePostCare && (
              <p className="pt-1 text-sm text-foreground">{service.prePostCare}</p>
            )}
          </DetailBlock>

          <DetailBlock title={t("detail.paymentTitle")}>
            <DetailRow
              label={t("detail.paymentMethodLabel")}
              value={service.paymentMethods.map((method) => t(`form.payment.${method}`)).join(" · ")}
            />
            {isDeposit && (
              <DetailRow
                label={t("detail.depositLabel")}
                value={
                  service.depositIsPercentage
                    ? `${service.depositAmount}%`
                    : formatSoles(service.depositAmount)
                }
              />
            )}
          </DetailBlock>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(service);
            }}
          >
            <Pencil className="mr-1.5 size-4" />
            {t("common.edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
