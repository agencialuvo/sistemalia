"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Stethoscope, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { specialtySchema, type Specialty } from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

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
 * Mirrors CategoryManagerDialog (components/services/category-manager-dialog.tsx):
 * a dialog rather than its own page, because especialidades are only ever
 * managed while working on el directorio de personal.
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    }
  }, [open, load]);

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

  async function remove(specialty: Specialty) {
    const inUse = (specialty._count?.staffMembers ?? 0) > 0;
    const question = inUse
      ? t("specialties.confirmDeactivate", { count: specialty._count?.staffMembers ?? 0 })
      : t("specialties.confirmDelete", { name: specialty.name });

    if (!window.confirm(question)) return;

    setDeletingId(specialty.id);
    try {
      const result = await removeSpecialty(specialty.id);
      toast.success(result.message);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("specialties.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
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
            <ul className="divide-y divide-border rounded-lg border border-border">
              {specialties.map((specialty) => (
                <li key={specialty.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        specialty.isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {specialty.name}
                      {!specialty.isActive && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          · {t("specialties.inactive")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("specialties.staffCount", { count: specialty._count?.staffMembers ?? 0 })}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(specialty)}
                    disabled={deletingId === specialty.id}
                    aria-label={t("common.delete")}
                  >
                    {deletingId === specialty.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
