"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Palette, Pencil, Plus, Tag, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
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
import { getApiErrorMessage } from "@/lib/api";
import {
  createClinicalTemplateCategory,
  deleteClinicalTemplateCategory,
  getClinicalTemplateCategories,
  updateClinicalTemplateCategory,
} from "@/lib/patients/api";
import type { ClinicalTemplateCategoryOption } from "@/lib/validators/clinical-template";
import { cn } from "@/lib/utils";

/** What ConfirmDeleteDialog is currently guarding — one row's trash icon, or
 *  the bulk action bar. `null` means it's closed. Mirrors DeleteTarget in
 *  CategoryManagerDialog (Services). */
type DeleteTarget = { kind: "single"; category: ClinicalTemplateCategoryOption } | { kind: "bulk" } | null;

const PRESET_COLORS = [
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

interface DraftCategory {
  id: string | null;
  name: string;
  color: string;
  /** Bloquea el input de nombre — una categoría del sistema no se puede
   *  renombrar (el backend lo rechaza), solo recolorear. */
  nameLocked: boolean;
}

const EMPTY_DRAFT: DraftCategory = { id: null, name: "", color: PRESET_COLORS[0], nameLocked: false };

/**
 * "Gestionar Categorías" de Plantillas Clínicas — CRUD del catálogo que
 * reemplazó al enum cerrado de 7 valores. Copia el patrón exacto de
 * CategoryManagerDialog (Servicios): mismo color picker, mismo bulk-select
 * con checkboxes, misma confirmación de borrado. Las 7 categorías del
 * sistema se muestran igual que las demás pero sin checkbox ni botón de
 * eliminar, con una etiqueta "categoría del sistema" — mismo tratamiento que
 * "Sin especialidad" en SpecialtyManagerDialog, solo que aquí son 7 filas en
 * vez de 1.
 */
export function ClinicalTemplateCategoryManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after any successful write so the grid/filters/form can reload. */
  onChanged: () => void;
}) {
  const t = useTranslations("Settings.clinicalTemplates.categories");
  const tc = useTranslations("Patients.common");

  const [categories, setCategories] = useState<ClinicalTemplateCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await getClinicalTemplateCategories());
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      void load();
      setDraft(null);
      setErrors({});
      setSelectedIds(new Set());
    }
  }, [open, load]);

  const selectableCategories = categories.filter((c) => !c.isSystem);
  const allSelected = selectableCategories.length > 0 && selectedIds.size === selectableCategories.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableCategories.map((c) => c.id)) : new Set());
  }

  function toggleSelected(category: ClinicalTemplateCategoryOption, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(category.id);
      else next.delete(category.id);
      return next;
    });
  }

  function startCreate() {
    setErrors({});
    setDraft({ ...EMPTY_DRAFT });
  }

  function startEdit(category: ClinicalTemplateCategoryOption) {
    setErrors({});
    setDraft({ id: category.id, name: category.name, color: category.color, nameLocked: category.isSystem });
  }

  async function save() {
    if (!draft) return;

    const name = draft.name.trim();
    if (!name) {
      setErrors({ name: t("nameRequired") });
      return;
    }
    if (name.length > 60) {
      setErrors({ name: t("nameTooLong") });
      return;
    }

    setSaving(true);
    try {
      if (draft.id) {
        await updateClinicalTemplateCategory(draft.id, { name, color: draft.color });
        toast.success(t("updated"));
      } else {
        await createClinicalTemplateCategory({ name, color: draft.color });
        toast.success(t("created"));
      }
      setDraft(null);
      setErrors({});
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        const result = await deleteClinicalTemplateCategory(deleteTarget.category.id);
        toast.success(result.message);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.category.id);
          return next;
        });
      } else {
        const ids = [...selectedIds];
        const results = await Promise.allSettled(ids.map((id) => deleteClinicalTemplateCategory(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("bulk.deleted", { count: ids.length }));
        }
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedIds, load, onChanged, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
            <DialogTitle className="text-lg">{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {draft ? (
              <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {draft.id ? t("editTitle") : t("newTitle")}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="clinical-category-name">{t("nameLabel")}</Label>
                    <Input
                      id="clinical-category-name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder={t("namePlaceholder")}
                      className="mt-1.5"
                      autoFocus={!draft.nameLocked}
                      disabled={draft.nameLocked}
                    />
                    {draft.nameLocked && (
                      <p className="mt-1 text-xs text-muted-foreground">{t("nameLockedHelp")}</p>
                    )}
                    {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                  </div>

                  <div>
                    <Label>{t("colorLabel")}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("colorHelp")}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setDraft({ ...draft, color })}
                          aria-label={color}
                          className={cn(
                            "size-7 rounded-full border-2 transition-transform",
                            draft.color.toUpperCase() === color.toUpperCase()
                              ? "scale-110 border-foreground"
                              : "border-transparent hover:scale-105",
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}

                      {!PRESET_COLORS.some((preset) => preset.toUpperCase() === draft.color.toUpperCase()) && (
                        <button
                          type="button"
                          onClick={() => customColorInputRef.current?.click()}
                          aria-label={draft.color}
                          title={draft.color}
                          className="size-7 scale-110 rounded-full border-2 border-foreground"
                          style={{ backgroundColor: draft.color }}
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => customColorInputRef.current?.click()}
                        aria-label={t("colorCustom")}
                        title={t("colorCustom")}
                        className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground text-muted-foreground transition-transform hover:scale-105 hover:border-foreground hover:text-foreground"
                      >
                        <Palette className="size-3.5" />
                      </button>
                      <input
                        ref={customColorInputRef}
                        type="color"
                        value={draft.color}
                        onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                        className="sr-only"
                        aria-label={t("colorCustom")}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                      {tc("cancel")}
                    </Button>
                    <Button size="sm" onClick={() => void save()} disabled={saving}>
                      {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                      {tc("save")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="mb-4" onClick={startCreate}>
                <Plus className="mr-1.5 size-4" />
                {t("newButton")}
              </Button>
            )}

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Tag className="size-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              </div>
            ) : (
              <>
                <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                  />
                  {t("selectAll")}
                </label>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {categories.map((category) => (
                    <li key={category.id} className="flex items-center gap-3 p-3">
                      {category.isSystem ? (
                        <span className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <Checkbox
                          checked={selectedIds.has(category.id)}
                          onCheckedChange={(checked) => toggleSelected(category, checked === true)}
                          aria-label={t("select")}
                        />
                      )}
                      <span
                        className="size-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: category.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {category.name}
                          {category.isSystem && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {t("defaultBadge")}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t("templateCount", { count: category.templateCount })}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(category)} aria-label={tc("edit")}>
                        <Pencil className="size-4" />
                      </Button>
                      {!category.isSystem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ kind: "single", category })}
                          aria-label={tc("delete")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex shrink-0 items-center gap-3 border-t border-border/80 bg-muted/40 px-6 py-3">
              <span className="text-sm font-medium text-foreground">
                {t("bulk.selectedCount", { count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {t("bulk.cancelSelection")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={() => setDeleteTarget({ kind: "bulk" })}
              >
                <Trash2 className="mr-1.5 size-4" />
                {t("bulk.deleteSelected")}
              </Button>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        cancelLabel={tc("cancel")}
        title={
          deleteTarget?.kind === "single"
            ? t("deleteConfirmTitle", { name: deleteTarget.category.name })
            : t("bulk.deleteConfirmTitle", { count: selectedIds.size })
        }
        description={
          deleteTarget?.kind === "single" ? t("deleteConfirmDescription") : t("bulk.deleteConfirmDescription")
        }
      />
    </>
  );
}
