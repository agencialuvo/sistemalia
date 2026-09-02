"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ClipboardList,
  Copy,
  Eye,
  FileSpreadsheet,
  FileUp,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClinicalTemplateCategoryManagerDialog } from "@/components/settings/clinical-template-category-manager-dialog";
import { ClinicalTemplateDetailDialog } from "@/components/settings/clinical-template-detail-dialog";
import { ClinicalTemplateFormDialog } from "@/components/settings/clinical-template-form-dialog";
import { ImportTemplateDialog } from "@/components/settings/import-template-dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  createClinicalTemplate,
  deleteClinicalTemplate,
  exportClinicalTemplates,
  getClinicalTemplateCategories,
  getClinicalTemplates,
  updateClinicalTemplate,
} from "@/lib/patients/api";
import type { ClinicalFormTemplate } from "@/lib/validators/patient";
import { resolveCategoryColor, type ClinicalTemplateCategoryOption } from "@/lib/validators/clinical-template";

const ALL_CATEGORIES = "__all__";
type StatusFilter = "all" | "active" | "inactive";
const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "inactive"];

/**
 * /plantillas-clinicas — Form Builder de Plantillas Clínicas (Módulo 05,
 * Fase 4), enriquecido con categorías dinámicas, exportación/importación
 * masiva y duplicado de plantillas. Vive como ruta plana de nivel superior,
 * mismo criterio de slug en español sin prefijo que /pacientes, /servicios,
 * /personal.
 *
 * The list is small per tenant (a handful of design-time fichas, not a
 * transactional table), so filtering happens client-side against one
 * unpaginated GET /clinical-templates — same "fetch once, filter in memory"
 * call the specialty/category managers make, instead of a debounced
 * server-query hook like /pacientes.
 */
export default function ClinicalTemplatesPage() {
  const t = useTranslations("Settings.clinicalTemplates");

  const [templates, setTemplates] = useState<ClinicalFormTemplate[]>([]);
  const [categories, setCategories] = useState<ClinicalTemplateCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalFormTemplate | null>(null);
  const [viewing, setViewing] = useState<ClinicalFormTemplate | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClinicalFormTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const load = useCallback(() => {
    setLoading(true);
    getClinicalTemplates()
      .then(setTemplates)
      .catch((error) => toast.error(getApiErrorMessage(error, t("loadFailed"))))
      .finally(() => setLoading(false));
  }, [t]);

  const loadCategories = useCallback(() => {
    getClinicalTemplateCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    load();
    loadCategories();
  }, [load, loadCategories]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (needle && !template.name.toLowerCase().includes(needle)) return false;
      if (category && template.fieldsSchema.category !== category) return false;
      if (status === "active" && !template.isActive) return false;
      if (status === "inactive" && template.isActive) return false;
      return true;
    });
  }, [templates, search, category, status]);

  const hasFilters = search.trim() !== "" || category !== "" || status !== "all";

  function clearFilters() {
    setSearch("");
    setCategory("");
    setStatus("all");
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(template: ClinicalFormTemplate) {
    setEditing(template);
    setFormOpen(true);
  }

  async function toggleActive(template: ClinicalFormTemplate) {
    setTogglingId(template.id);
    try {
      await updateClinicalTemplate(template.id, { isActive: !template.isActive });
      toast.success(
        template.isActive
          ? t("deactivated", { name: template.name })
          : t("reactivated", { name: template.name }),
      );
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deactivateFailed")));
    } finally {
      setTogglingId(null);
    }
  }

  /** "Duplicar Plantilla" — un POST normal con el mismo fieldsSchema y un
   *  nombre sufijado, sin endpoint propio: crear una plantilla ya hace
   *  exactamente esto. */
  async function duplicateTemplate(template: ClinicalFormTemplate) {
    setDuplicatingId(template.id);
    try {
      await createClinicalTemplate({
        name: t("card.duplicateName", { name: template.name }),
        description: template.description ?? undefined,
        fieldsSchema: template.fieldsSchema,
      });
      toast.success(t("card.duplicated"));
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.duplicateFailed")));
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportClinicalTemplates();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("export.failed")));
    } finally {
      setExporting(false);
    }
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClinicalTemplate(deleteTarget.id);
      toast.success(t("deleted", { name: deleteTarget.name }));
      setDeleteTarget(null);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load, t]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
            <Tag className="mr-1.5 size-4" />
            {t("actions.manageCategories")}
          </Button>

          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1.5 size-4" />
            )}
            {t("actions.export")}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-1.5 size-4" />
            {t("actions.import")}
          </Button>

          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t("newButton")}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
            aria-label={t("filters.searchPlaceholder")}
          />
        </div>

        <Select
          value={category || ALL_CATEGORIES}
          onValueChange={(value) => setCategory(!value || value === ALL_CATEGORIES ? "" : value)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filters.allCategories")}>
              {(value: string | null) => (!value || value === ALL_CATEGORIES ? t("filters.allCategories") : value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t("filters.allCategories")}</SelectItem>
            {categories.map((option) => (
              <SelectItem key={option.id} value={option.name}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(value) => setStatus((value as StatusFilter | null) ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue>{(value: StatusFilter | null) => t(`filters.status.${value ?? "all"}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`filters.status.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" />
            {t("filters.clear")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <ClipboardList className="size-7 text-primary" />
          </div>
          <div className="max-w-sm">
            <h2 className="text-base font-semibold text-foreground">
              {hasFilters ? t("empty.filteredTitle") : t("empty.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters ? t("empty.filteredDescription") : t("empty.description")}
            </p>
          </div>
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t("filters.clear")}
            </Button>
          ) : (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              {t("newButton")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => {
            const color = resolveCategoryColor(template.fieldsSchema.category, categories);
            const busy = togglingId === template.id || duplicatingId === template.id;
            return (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewing(template)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setViewing(template);
                  }
                }}
                className={`flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md ${
                  !template.isActive ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="secondary" style={{ backgroundColor: `${color}1A`, color }}>
                    {template.fieldsSchema.category}
                  </Badge>
                  <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <Badge variant={template.isActive ? "default" : "secondary"}>
                      {template.isActive ? t("card.active") : t("card.inactive")}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted disabled:opacity-50"
                        aria-label={t("card.options")}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewing(template)}>
                          <Eye className="mr-2 size-4" />
                          {t("card.viewDetail")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(template)}>
                          <Pencil className="mr-2 size-4" />
                          {t("card.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void duplicateTemplate(template)}>
                          <Copy className="mr-2 size-4" />
                          {t("card.duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void toggleActive(template)}>
                          <Power className="mr-2 size-4" />
                          {template.isActive ? t("card.deactivate") : t("card.reactivate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(template)}>
                          <Trash2 className="mr-2 size-4" />
                          {t("card.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                  {template.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                  )}
                </div>

                <p className="mt-auto text-xs text-muted-foreground">
                  {t("card.fieldCount", { count: template.fieldsSchema.fields.length })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <ClinicalTemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        onSaved={() => {
          load();
          loadCategories();
        }}
      />
      <ClinicalTemplateDetailDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        template={viewing}
        categories={categories}
        onEdit={openEdit}
      />
      <ClinicalTemplateCategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        onChanged={() => {
          loadCategories();
          load();
        }}
      />
      <ImportTemplateDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          load();
          loadCategories();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        title={deleteTarget ? t("card.deleteConfirmTitle", { name: deleteTarget.name }) : ""}
        description={t("card.deleteConfirmDescription")}
      />
    </div>
  );
}
