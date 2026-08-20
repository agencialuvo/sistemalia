"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Clock,
  ImageIcon,
  Layers,
  MoreVertical,
  Pencil,
  Power,
  Stethoscope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatDuration,
  formatSoles,
  needsEvaluationLink,
  type Service,
} from "@/lib/validators/service";
import { cn } from "@/lib/utils";

export function ServiceCard({
  service,
  onEdit,
  onToggleActive,
  busy,
}: {
  service: Service;
  onEdit: (service: Service) => void;
  onToggleActive: (service: Service) => void;
  busy: boolean;
}) {
  const t = useTranslations("Services");
  const isPackage = service.structureType === "SESSIONS";
  const missingEvaluation = needsEvaluationLink(service);

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md",
        !service.isActive && "opacity-70",
      )}
    >
      <div className="relative h-36 w-full bg-muted">
        {service.mainImageUrl ? (
          <Image
            src={service.mainImageUrl}
            alt={service.name}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/40" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur"
            title={service.category.name}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: service.category.color ?? "var(--color-muted-foreground)" }}
            />
            {service.category.name}
          </span>
        </div>

        <div className="absolute right-2 top-2">
          <Badge variant={service.isActive ? "default" : "secondary"}>
            {service.isActive ? t("card.active") : t("card.inactive")}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{service.name}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted disabled:opacity-50"
              aria-label={t("card.options")}
              disabled={busy}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(service)}>
                <Pencil className="mr-2 size-4" />
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(service)}>
                <Power className="mr-2 size-4" />
                {service.isActive ? t("card.deactivate") : t("card.reactivate")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground">
          {service.commercialDescription}
        </p>

        <div className="mt-auto space-y-1.5 pt-1">
          <p className="text-base font-semibold text-foreground">
            {formatSoles(service.singlePrice)}
            {isPackage && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {t("card.perSession")}
              </span>
            )}
          </p>

          {isPackage && service.packagePrice && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="size-3.5" />
              {t("card.package", {
                sessions: service.sessionCount ?? 0,
                price: formatSoles(service.packagePrice),
              })}
            </p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {formatDuration(service.durationMinutes, service.bufferMinutes)}
          </p>

          {service.requiresEvaluation && !missingEvaluation && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Stethoscope className="size-3.5" />
              {t("card.requiresEvaluation")}
            </p>
          )}
        </div>

        {/* The bulk template cannot carry evaluationServiceId, so imported
            services that need a valoración arrive without one. Flagged here
            because otherwise they look complete while the agenda has no
            consult to book before the treatment. */}
        {missingEvaluation && (
          <button
            type="button"
            onClick={() => onEdit(service)}
            className="mt-1 flex w-full items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-left"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
            <span className="text-[11px] leading-tight text-foreground">
              {t("card.missingEvaluationLink")}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
