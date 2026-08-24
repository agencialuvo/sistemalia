"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import {
  createCategory,
  listCategories,
  removeCategory,
  updateCategory,
} from "@/lib/services/api";
import { DEFAULT_CATEGORY_NAME, categorySchema, type ServiceCategory } from "@/lib/validators/service";
import { cn } from "@/lib/utils";

/** What ConfirmDeleteDialog is currently guarding here — one row's trash
 *  icon, or the bulk action bar. `null` means it's closed. Mirrors the
 *  DeleteTarget pattern in the services page (spec §3). */
type DeleteTarget = { kind: "single"; category: ServiceCategory } | { kind: "bulk" } | null;

/** Palette offered as swatches. Any #RRGGBB is accepted — these are just the
 *  ones that stay legible against both themes in the calendar. */
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
  description: string;
  color: string;
  isActive: boolean;
}

const EMPTY_DRAFT: DraftCategory = {
  id: null,
  name: "",
  description: "",
  color: PRESET_COLORS[0],
  isActive: true,
};

/**
 * CRUD de categorías (spec §2.1 / §4.1 "Gestionar Categorías").
 *
 * Lives in a dialog rather than its own page because categories are only ever
 * managed in the middle of working on the catalogue — sending the user to a
 * separate route would lose the filters and the scroll position they came from.
 */
export function CategoryManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after any successful write so the grid and filters can reload. */
  onChanged: () => void;
}) {
  const t = useTranslations("Services");

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await listCategories());
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("categories.loadFailed")));
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

  // "Sin categoría" no se puede borrar (spec: es el cajón de reasignación
  // permanente), así que ni entra en "Seleccionar todo" ni tiene checkbox propio.
  const selectableCategories = categories.filter((c) => c.name !== DEFAULT_CATEGORY_NAME);
  const allSelected =
    selectableCategories.length > 0 && selectedIds.size === selectableCategories.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableCategories.map((c) => c.id)) : new Set());
  }

  function toggleSelected(category: ServiceCategory, checked: boolean) {
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

  function startEdit(category: ServiceCategory) {
    setErrors({});
    setDraft({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      color: category.color ?? PRESET_COLORS[0],
      isActive: category.isActive,
    });
  }

  async function save() {
    if (!draft) return;

    const parsed = categorySchema.safeParse({
      name: draft.name,
      description: draft.description || undefined,
      color: draft.color || undefined,
      isActive: draft.isActive,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "name");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        color: parsed.data.color || undefined,
        isActive: draft.isActive,
      };

      if (draft.id) {
        await updateCategory(draft.id, payload);
        toast.success(t("categories.updated"));
      } else {
        await createCategory(payload);
        toast.success(t("categories.created"));
      }

      setDraft(null);
      setErrors({});
      await load();
      onChanged();
    } catch (error) {
      // 409 when the name is taken — the API returns a Spanish message that
      // names the offending category, so it is shown verbatim.
      toast.error(getApiErrorMessage(error, t("categories.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  /** Runs once ConfirmDeleteDialog has been accepted — branches on a single
   *  row's trash icon vs. the bulk action bar, same shape as the services
   *  page's confirmDelete (spec §3). Services under a deleted category are
   *  reassigned to "Predeterminado" by the API, never left orphaned. */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        const result = await removeCategory(deleteTarget.category.id);
        toast.success(result.message);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.category.id);
          return next;
        });
      } else {
        const ids = [...selectedIds];
        const results = await Promise.allSettled(ids.map((id) => removeCategory(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("categories.bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("categories.bulk.deleted", { count: ids.length }));
        }
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("categories.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedIds, load, onChanged, t]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("categories.title")}</DialogTitle>
          <DialogDescription>{t("categories.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {draft ? (
            <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {draft.id ? t("categories.editTitle") : t("categories.newTitle")}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  <X className="size-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="category-name">{t("categories.nameLabel")}</Label>
                  <Input
                    id="category-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder={t("categories.namePlaceholder")}
                    className="mt-1.5"
                    autoFocus
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-destructive">{errors.name}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="category-description">
                    {t("categories.descriptionLabel")}
                  </Label>
                  <Textarea
                    id="category-description"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    placeholder={t("categories.descriptionPlaceholder")}
                    rows={2}
                    className="mt-1.5"
                  />
                  {errors.description && (
                    <p className="mt-1 text-xs text-destructive">{errors.description}</p>
                  )}
                </div>

                <div>
                  <Label>{t("categories.colorLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("categories.colorHelp")}
                  </p>
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
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                      aria-label={t("categories.colorCustom")}
                      className="size-7 cursor-pointer rounded-full border border-border bg-transparent p-0"
                    />
                  </div>
                  {errors.color && (
                    <p className="mt-1 text-xs text-destructive">{errors.color}</p>
                  )}
                </div>

                {draft.id && (
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={draft.isActive}
                      onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                      id="category-active"
                    />
                    <Label htmlFor="category-active" className="cursor-pointer">
                      {draft.isActive ? t("categories.active") : t("categories.inactive")}
                    </Label>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="mb-4" onClick={startCreate}>
              <Plus className="mr-1.5 size-4" />
              {t("categories.newButton")}
            </Button>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Tag className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">{t("categories.empty")}</p>
            </div>
          ) : (
            <>
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                />
                {t("categories.selectAll")}
              </label>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {categories.map((category) => {
                  const isDefault = category.name === DEFAULT_CATEGORY_NAME;
                  return (
                    <li key={category.id} className="flex items-center gap-3 p-3">
                      {isDefault ? (
                        <span className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <Checkbox
                          checked={selectedIds.has(category.id)}
                          onCheckedChange={(checked) => toggleSelected(category, checked === true)}
                          aria-label={t("categories.select")}
                        />
                      )}
                      <span
                        className="size-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: category.color ?? "transparent" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            category.isActive ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {category.name}
                          {isDefault && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {t("categories.defaultBadge")}
                            </span>
                          )}
                          {!category.isActive && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {t("categories.inactive")}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t("categories.serviceCount", { count: category._count?.services ?? 0 })}
                          {category.description ? ` · ${category.description}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(category)}
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {!isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ kind: "single", category })}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="flex shrink-0 items-center gap-3 border-t border-border/80 bg-muted/40 px-6 py-3">
            <span className="text-sm font-medium text-foreground">
              {t("categories.bulk.selectedCount", { count: selectedIds.size })}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              {t("categories.bulk.cancelSelection")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              onClick={() => setDeleteTarget({ kind: "bulk" })}
            >
              <Trash2 className="mr-1.5 size-4" />
              {t("categories.bulk.deleteSelected")}
            </Button>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmDeleteDialog
      open={deleteTarget !== null}
      onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
      loading={deleting}
      onConfirm={() => void confirmDelete()}
      title={
        deleteTarget?.kind === "single"
          ? t("categories.deleteConfirmTitle", { name: deleteTarget.category.name })
          : t("categories.bulk.deleteConfirmTitle", { count: selectedIds.size })
      }
      description={
        deleteTarget?.kind === "single"
          ? t("categories.deleteConfirmDescription")
          : t("categories.bulk.deleteConfirmDescription")
      }
    />
    </>
  );
}
