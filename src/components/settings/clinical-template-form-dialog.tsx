"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getApiErrorMessage } from "@/lib/api";
import {
  createClinicalTemplate,
  createClinicalTemplateCategory,
  getClinicalTemplateCategories,
  updateClinicalTemplate,
} from "@/lib/patients/api";
import type { ClinicalFormTemplate } from "@/lib/validators/patient";
import {
  clinicalFormTemplateSchema,
  createEmptyClinicalFormField,
  FORM_FIELD_TYPES,
  FORM_FIELD_TYPE_LABELS,
  INJECTABLE_CATEGORY_NAME,
  type ClinicalFormField,
  type ClinicalTemplateCategoryOption,
  type FormFieldType,
} from "@/lib/validators/clinical-template";
import { cn } from "@/lib/utils";

/** Sentinel Select item that switches the category field into "crear
 *  categoría on-the-fly" mode — same contract as NEW_CATEGORY_SENTINEL in
 *  service-form-dialog.tsx (Servicios), the reference this mirrors. */
const NEW_CATEGORY_SENTINEL = "__new_category__";

/** Same palette ClinicalTemplateCategoryManagerDialog offers — a category
 *  created inline here should look the same as one created from its own
 *  dialog. */
const CATEGORY_COLOR_PRESETS = [
  "#E11D48",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#7C3AED",
  "#EC4899",
  "#64748B",
];

/** "Grasa, Mixta, Seca" -> ["Grasa","Mixta","Seca"] — same free-text-list
 *  parsing convention as PatientImportDialog's tags column. */
function parseOptions(raw: string): string[] {
  return raw
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

/**
 * Form Builder de Plantillas Clínicas (Módulo 05, Fase 4 — Configuración).
 *
 * `template` presente = edición (PATCH /clinical-templates/:id), `null` =
 * alta (POST /clinical-templates). Mismo contrato de un solo dialog para
 * crear/editar que PatientFormDialog.
 */
export function ClinicalTemplateFormDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ClinicalFormTemplate | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Settings.clinicalTemplates.form");
  const tc = useTranslations("Patients.common");

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(INJECTABLE_CATEGORY_NAME);
  const [hasFaceMapping, setHasFaceMapping] = useState(true);
  const [fields, setFields] = useState<ClinicalFormField[]>([]);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ClinicalTemplateCategoryOption[]>([]);

  // "+ Crear nueva categoría" (mismo patrón que ServiceFormDialog): el
  // Select se reemplaza por este bloque en vez de navegar a otro lado —
  // categoría del sistema, no se puede eliminar.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLOR_PRESETS[0]);

  useEffect(() => {
    if (!open) return;
    getClinicalTemplateCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    setCreatingCategory(false);
    setNewCategoryName("");
    setNewCategoryColor(CATEGORY_COLOR_PRESETS[0]);
    if (template) {
      setName(template.name);
      setCategory(template.fieldsSchema.category);
      setHasFaceMapping(template.fieldsSchema.hasFaceMapping);
      setFields(template.fieldsSchema.fields);
    } else {
      setName("");
      setCategory(INJECTABLE_CATEGORY_NAME);
      setHasFaceMapping(true);
      setFields([]);
    }
  }, [open, template]);

  /** El switch se prende solo al elegir "Inyectables" (valor por defecto
   *  para esa categoría), pero el usuario sigue pudiendo apagarlo o
   *  encenderlo a mano para cualquier categoría después — este handler solo
   *  fija el default en el momento del cambio, no lo fuerza en cada render. */
  function selectCategory(next: string) {
    setCategory(next);
    if (next === INJECTABLE_CATEGORY_NAME) setHasFaceMapping(true);
  }

  function addField() {
    setFields((current) => [...current, createEmptyClinicalFormField()]);
  }

  function updateField(id: string, patch: Partial<ClinicalFormField>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function removeField(id: string) {
    setFields((current) => current.filter((field) => field.id !== id));
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const submit = useCallback(async () => {
    // "+ Crear nueva categoría" en curso: valida su propio nombre antes que
    // nada — nunca llega a clinicalFormTemplateSchema como `category` hasta
    // que la categoría exista de verdad.
    if (creatingCategory && !newCategoryName.trim()) {
      toast.error(t("category.newNameRequired"));
      return;
    }

    const effectiveCategory = creatingCategory ? newCategoryName.trim() : category;
    const parsed = clinicalFormTemplateSchema.safeParse({
      name,
      category: effectiveCategory,
      hasFaceMapping,
      fields,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("validationFailed"));
      return;
    }

    setSaving(true);
    try {
      // La categoría tiene que existir antes de que la plantilla pueda
      // nombrarla — se crea primero, igual que ServiceFormDialog crea la
      // categoría antes de sustituir su id en el payload del servicio.
      if (creatingCategory) {
        await createClinicalTemplateCategory({ name: parsed.data.category, color: newCategoryColor });
      }

      const fieldsSchema = {
        category: parsed.data.category,
        hasFaceMapping: parsed.data.hasFaceMapping,
        fields: parsed.data.fields,
      };
      if (template) {
        await updateClinicalTemplate(template.id, { name: parsed.data.name, fieldsSchema });
        toast.success(t("updated"));
      } else {
        await createClinicalTemplate({ name: parsed.data.name, fieldsSchema });
        toast.success(t("created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }, [
    name,
    category,
    hasFaceMapping,
    fields,
    template,
    onOpenChange,
    onSaved,
    t,
    creatingCategory,
    newCategoryName,
    newCategoryColor,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{template ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">{t("nameLabel")}</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>{t("categoryLabel")}</Label>
              {!creatingCategory ? (
                <Select
                  value={category}
                  onValueChange={(value) => {
                    if (value === NEW_CATEGORY_SENTINEL) {
                      setCreatingCategory(true);
                      return;
                    }
                    selectCategory(value ?? INJECTABLE_CATEGORY_NAME);
                  }}
                >
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue>{(value: string | null) => value ?? INJECTABLE_CATEGORY_NAME}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((option) => (
                      <SelectItem key={option.id} value={option.name}>
                        {option.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_CATEGORY_SENTINEL}>
                      <span className="flex items-center gap-2 font-medium text-primary">
                        <Plus className="size-3.5" />
                        {t("category.createNew")}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1.5 space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-primary">{t("category.creatingNew")}</p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                      onClick={() => {
                        setCreatingCategory(false);
                        setNewCategoryName("");
                        setNewCategoryColor(CATEGORY_COLOR_PRESETS[0]);
                      }}
                    >
                      {t("category.cancelNew")}
                    </button>
                  </div>
                  <div>
                    <Label htmlFor="new-template-category-name">{t("category.newNameLabel")}</Label>
                    <Input
                      id="new-template-category-name"
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      placeholder={t("category.newNamePlaceholder")}
                      className="mt-1.5"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label>{t("category.newColorLabel")}</Label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {CATEGORY_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewCategoryColor(color)}
                          aria-label={color}
                          className={cn(
                            "size-6 rounded-full border-2 transition-transform",
                            newCategoryColor.toUpperCase() === color.toUpperCase()
                              ? "scale-110 border-foreground"
                              : "border-transparent hover:scale-105",
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!creatingCategory && category === INJECTABLE_CATEGORY_NAME && (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs text-foreground">{t("injectableBanner")}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <div>
              <Label htmlFor="template-face-mapping" className="cursor-pointer text-sm font-normal">
                {t("faceMappingLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("faceMappingHelp")}</p>
            </div>
            <Switch id="template-face-mapping" checked={hasFaceMapping} onCheckedChange={setHasFaceMapping} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>{t("fieldsLabel")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-1.5 size-3.5" />
                {t("addField")}
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t("noFields")}
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-0.5 pt-1">
                        <button
                          type="button"
                          onClick={() => moveField(index, -1)}
                          disabled={index === 0}
                          className="rounded p-0.5 text-muted-foreground hover:bg-background disabled:opacity-30"
                          aria-label={t("moveUp")}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(index, 1)}
                          disabled={index === fields.length - 1}
                          className="rounded p-0.5 text-muted-foreground hover:bg-background disabled:opacity-30"
                          aria-label={t("moveDown")}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 space-y-2.5">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            value={field.label}
                            onChange={(event) => updateField(field.id, { label: event.target.value })}
                            placeholder={t("fieldLabelPlaceholder")}
                            className="h-8"
                          />
                          <Select
                            value={field.type}
                            onValueChange={(value) =>
                              updateField(field.id, { type: (value as FormFieldType) ?? "TEXT" })
                            }
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue>
                                {(value: string | null) =>
                                  FORM_FIELD_TYPE_LABELS[(value as FormFieldType) ?? "TEXT"]
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {FORM_FIELD_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {FORM_FIELD_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {field.type === "SELECT" && (
                          <Input
                            value={(field.options ?? []).join(", ")}
                            onChange={(event) =>
                              updateField(field.id, { options: parseOptions(event.target.value) })
                            }
                            placeholder={t("optionsPlaceholder")}
                            className="h-8"
                          />
                        )}

                        <label className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={field.required}
                            onCheckedChange={(checked) => updateField(field.id, { required: checked === true })}
                          />
                          {t("requiredLabel")}
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeField(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("removeField")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {template ? tc("saveChanges") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

