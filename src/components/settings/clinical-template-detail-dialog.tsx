"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, MapPin, Pencil } from "lucide-react";

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
import type { ClinicalFormTemplate } from "@/lib/validators/patient";
import {
  FORM_FIELD_TYPE_LABELS,
  resolveCategoryColor,
  type ClinicalTemplateCategoryOption,
} from "@/lib/validators/clinical-template";

/**
 * Read-only preview opened by clicking a template card at /plantillas-clinicas
 * (same "card is clickable, Editar stays a separate step" contract as
 * ServiceDetailDialog) — lists every field the Form Builder configured plus
 * whether the ficha carries Mapeo Facial, without opening the builder itself.
 */
export function ClinicalTemplateDetailDialog({
  open,
  onOpenChange,
  template,
  categories,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ClinicalFormTemplate | null;
  categories: ClinicalTemplateCategoryOption[];
  onEdit: (template: ClinicalFormTemplate) => void;
}) {
  const t = useTranslations("Settings.clinicalTemplates");
  if (!template) return null;

  const color = resolveCategoryColor(template.fieldsSchema.category, categories);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-2">
            <Badge variant="secondary" style={{ backgroundColor: `${color}1A`, color }}>
              {template.fieldsSchema.category}
            </Badge>
            <Badge variant={template.isActive ? "default" : "secondary"}>
              {template.isActive ? t("card.active") : t("card.inactive")}
            </Badge>
          </div>
          <DialogTitle className="text-lg">{template.name}</DialogTitle>
          {template.description && <DialogDescription>{template.description}</DialogDescription>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {template.fieldsSchema.hasFaceMapping && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
              <MapPin className="size-4 shrink-0 text-primary" />
              {t("detail.hasFaceMapping")}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("detail.fieldsTitle", { count: template.fieldsSchema.fields.length })}
            </h3>
            <div className="space-y-2">
              {template.fieldsSchema.fields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {FORM_FIELD_TYPE_LABELS[field.type]}
                      {field.type === "SELECT" && field.options && field.options.length > 0
                        ? ` · ${field.options.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  {field.required && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5" />
                      {t("detail.required")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("detail.close")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(template);
            }}
          >
            <Pencil className="mr-1.5 size-4" />
            {t("card.edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
