"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Stethoscope, Trash2, X } from "lucide-react";

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
  createSpecialty,
  listSpecialties,
  removeSpecialty,
  updateSpecialty,
} from "@/lib/staff/api";
import { DEFAULT_SPECIALTY_NAME, specialtySchema, type Specialty } from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

/** What ConfirmDeleteDialog is currently guarding here — one row's trash
 *  icon, or the bulk action bar. `null` means it's closed. Mirrors the
 *  DeleteTarget pattern in CategoryManagerDialog. */
type DeleteTarget = { kind: "single"; specialty: Specialty } | { kind: "bulk" } | null;

interface DraftSpecialty {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
}

const EMPTY_DRAFT: DraftSpecialty = { id: null, name: "", description: "", isActive: true };

/**
 * CRUD de especialidades (spec §2.1 / §4.1 "Gestionar Especialidades").
 *
 * Mirrors CategoryManagerDialog (components/services/category-manager-dialog.tsx)
 * end to end: a dialog rather than its own page (especialidades are only ever
 * managed while working on el directorio de personal), plus the same
 * multi-select + bulk-delete bar and system-row treatment for "Sin
 * especialidad" that CategoryManagerDialog gives "Sin categoría".
 */
export function SpecialtyManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after any successful write so the grid and filters can reload. */
  onChanged: () => void;
}) {
  const t = useTranslations("Staff");

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftSpecialty | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSpecialties(await listSpecialties());
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("specialties.loadFailed")));
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

  // "Sin especialidad" no se puede borrar (es la opción neutra del sistema),
  // así que ni entra en "Seleccionar todo" ni tiene checkbox propio.
  const selectableSpecialties = specialties.filter((s) => s.name !== DEFAULT_SPECIALTY_NAME);
  const allSelected =
    selectableSpecialties.length > 0 && selectedIds.size === selectableSpecialties.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableSpecialties.map((s) => s.id)) : new Set());
  }

  function toggleSelected(specialty: Specialty, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(specialty.id);
      else next.delete(specialty.id);
      return next;
    });
  }

  function startCreate() {
    setErrors({});
    setDraft({ ...EMPTY_DRAFT });
  }

  function startEdit(specialty: Specialty) {
    setErrors({});
    setDraft({
      id: specialty.id,
      name: specialty.name,
      description: specialty.description ?? "",
      isActive: specialty.isActive,
    });
  }

  async function save() {
    if (!draft) return;

    const parsed = specialtySchema.safeParse({
      name: draft.name,
      description: draft.description || undefined,
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
        isActive: draft.isActive,
      };

      if (draft.id) {
        await updateSpecialty(draft.id, payload);
        toast.success(t("specialties.updated"));
      } else {
        await createSpecialty(payload);
        toast.success(t("specialties.created"));
      }

      setDraft(null);
      setErrors({});
      await load();
      onChanged();
    } catch (error) {
      // 409 when the name is taken — the API returns a Spanish message that
      // names the offending especialidad, so it is shown verbatim.
      toast.error(getApiErrorMessage(error, t("specialties.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  /** Runs once ConfirmDeleteDialog has been accepted — branches on a single
   *  row's trash icon vs. the bulk action bar, same shape as
   *  CategoryManagerDialog.confirmDelete. The API itself decides per row
   *  whether that means a hard delete or a soft deactivate (still in use by
   *  a profesional) — either way the row leaves `selectedIds`. */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        const result = await removeSpecialty(deleteTarget.specialty.id);
        toast.success(result.message);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.specialty.id);
          return next;
        });
      } else {
        const ids = [...selectedIds];
        const results = await Promise.allSettled(ids.map((id) => removeSpecialty(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("specialties.bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("specialties.bulk.deleted", { count: ids.length }));
        }
        setSelectedIds(new Set());
      }
      setDeleteTarget(null);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("specialties.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedIds, load, onChanged, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
            <DialogTitle className="text-lg">{t("specialties.title")}</DialogTitle>
            <DialogDescription>{t("specialties.description")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {draft ? (
              <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {draft.id ? t("specialties.editTitle") : t("specialties.newTitle")}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="specialty-name">{t("specialties.nameLabel")}</Label>
                    <Input
                      id="specialty-name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder={t("specialties.namePlaceholder")}
                      className="mt-1.5"
                      autoFocus
                    />
                    {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                  </div>

                  <div>
                    <Label htmlFor="specialty-description">
                      {t("specialties.descriptionLabel")}
                    </Label>
                    <Textarea
                      id="specialty-description"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                      placeholder={t("specialties.descriptionPlaceholder")}
                      rows={2}
                      className="mt-1.5"
                    />
                    {errors.description && (
                      <p className="mt-1 text-xs text-destructive">{errors.description}</p>
                    )}
                  </div>

                  {draft.id && (
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                        id="specialty-active"
                      />
                      <Label htmlFor="specialty-active" className="cursor-pointer">
                        {draft.isActive ? t("specialties.active") : t("specialties.inactive")}
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
                {t("specialties.newButton")}
              </Button>
            )}

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : specialties.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Stethoscope className="size-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">{t("specialties.empty")}</p>
              </div>
            ) : (
              <>
                <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                  />
                  {t("specialties.selectAll")}
                </label>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {specialties.map((specialty) => {
                    const isDefault = specialty.name === DEFAULT_SPECIALTY_NAME;
                    return (
                      <li key={specialty.id} className="flex items-center gap-3 p-3">
                        {isDefault ? (
                          <span className="size-4 shrink-0" aria-hidden />
                        ) : (
                          <Checkbox
                            checked={selectedIds.has(specialty.id)}
                            onCheckedChange={(checked) =>
                              toggleSelected(specialty, checked === true)
                            }
                            aria-label={t("specialties.select")}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm font-medium",
                              specialty.isActive ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {specialty.name}
                            {isDefault && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                · {t("specialties.defaultBadge")}
                              </span>
                            )}
                            {!specialty.isActive && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                · {t("specialties.inactive")}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t("specialties.staffCount", {
                              count: specialty._count?.staffMembers ?? 0,
                            })}
                            {specialty.description ? ` · ${specialty.description}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(specialty)}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {!isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget({ kind: "single", specialty })}
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
                {t("specialties.bulk.selectedCount", { count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {t("specialties.bulk.cancelSelection")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                onClick={() => setDeleteTarget({ kind: "bulk" })}
              >
                <Trash2 className="mr-1.5 size-4" />
                {t("specialties.bulk.deleteSelected")}
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
            ? t("specialties.deleteConfirmTitle", { name: deleteTarget.specialty.name })
            : t("specialties.bulk.deleteConfirmTitle", { count: selectedIds.size })
        }
        description={
          deleteTarget?.kind === "single"
            ? t("specialties.deleteConfirmDescription")
            : t("specialties.bulk.deleteConfirmDescription")
        }
      />
    </>
  );
}
