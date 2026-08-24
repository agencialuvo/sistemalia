"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ConciergeBell,
  Download,
  FileUp,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { CategoryManagerDialog } from "@/components/services/category-manager-dialog";
import { ExcelImportDialog } from "@/components/services/excel-import-dialog";
import { ServiceCard } from "@/components/services/service-card";
import { ServiceDetailDialog } from "@/components/services/service-detail-dialog";
import { ServiceFormDialog } from "@/components/services/service-form-dialog";
import { useServicesCatalog, type StatusFilter } from "@/hooks/use-services";
import { getApiErrorMessage } from "@/lib/api";
import {
  deactivateService,
  deleteServicePermanently,
  downloadTemplate,
  listServices,
  reactivateService,
  SERVICE_PAGE_SIZES,
} from "@/lib/services/api";
import { needsEvaluationLink, type Service } from "@/lib/validators/service";

const ALL_CATEGORIES = "__all__";
const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "inactive"];

/** What the confirm-delete dialog is currently guarding: one card's "Eliminar",
 *  or the bulk "Eliminar seleccionados" bar. `null` means it's closed. */
type DeleteTarget = { kind: "single"; service: Service } | { kind: "bulk" } | null;

/**
 * /servicios — Catálogo de Servicios (Módulo 03, spec §4).
 *
 * Top-level Spanish slug, no /dashboard prefix; the middleware protects
 * everything that is not explicitly public, so this route is gated by virtue
 * of existing.
 */
export default function ServicesPage() {
  const t = useTranslations("Services");
  const catalog = useServicesCatalog();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [viewing, setViewing] = useState<Service | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const { services, categories, refresh } = catalog;

  // The grid is paginated, but "how many services still need an evaluation
  // link" and "which services can serve as one" (the form's valoración
  // picker) both need the WHOLE catalogue, not just the page on screen — so
  // they get their own unpaginated fetch, refreshed alongside the grid.
  const [allServices, setAllServices] = useState<Service[]>([]);
  const refreshAllServices = useCallback(async () => {
    try {
      const result = await listServices();
      setAllServices(result.data);
    } catch {
      // Non-fatal: the banner/picker just falls back to an empty list.
      setAllServices([]);
    }
  }, []);
  useEffect(() => {
    void refreshAllServices();
  }, [refreshAllServices]);

  const pendingEvaluationLinks = useMemo(
    () => allServices.filter(needsEvaluationLink).length,
    [allServices],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshAllServices()]);
  }, [refresh, refreshAllServices]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((service: Service) => {
    setEditing(service);
    setFormOpen(true);
  }, []);

  const toggleActive = useCallback(
    async (service: Service) => {
      setTogglingId(service.id);
      try {
        if (service.isActive) {
          await deactivateService(service.id);
          toast.success(t("card.deactivated", { name: service.name }));
        } else {
          await reactivateService(service.id);
          toast.success(t("card.reactivated", { name: service.name }));
        }
        await refreshAll();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("card.toggleFailed")));
      } finally {
        setTogglingId(null);
      }
    },
    [refreshAll, t],
  );

  const toggleSelected = useCallback((service: Service, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(service.id);
      else next.delete(service.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /** Runs the actual hard delete once ConfirmDeleteDialog has been accepted —
   *  branches on single-card "Eliminar" vs. the bulk action bar (spec §6). */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        await deleteServicePermanently(deleteTarget.service.id);
        toast.success(t("card.deleted", { name: deleteTarget.service.name }));
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.service.id);
          return next;
        });
      } else {
        const ids = [...selectedIds];
        const results = await Promise.allSettled(ids.map((id) => deleteServicePermanently(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("bulk.deleted", { count: ids.length }));
        }
        clearSelection();
      }
      setDeleteTarget(null);
      await refreshAll();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedIds, refreshAll, clearSelection, t]);

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      await downloadTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("import.templateFailed")));
    } finally {
      setDownloading(false);
    }
  }

  const hasFilters =
    catalog.search.trim() !== "" || catalog.categoryId !== "" || catalog.status !== "all";

  function clearFilters() {
    catalog.setSearch("");
    catalog.setCategoryId("");
    catalog.setStatus("all");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
            <Tag className="mr-1.5 size-4" />
            {t("actions.categories")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            {t("actions.downloadTemplate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-1.5 size-4" />
            {t("actions.import")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t("actions.new")}
          </Button>
        </div>
      </header>

      {pendingEvaluationLinks > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          {t("pendingEvaluationLinks", { count: pendingEvaluationLinks })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={catalog.search}
            onChange={(event) => catalog.setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
            aria-label={t("filters.searchPlaceholder")}
          />
        </div>

        <Select
          value={catalog.categoryId || ALL_CATEGORIES}
          // base-ui hands back `string | null` (a Select can be cleared);
          // an empty categoryId means "todas", which is the same thing here.
          onValueChange={(value) =>
            catalog.setCategoryId(!value || value === ALL_CATEGORIES ? "" : value)
          }
        >
          <SelectTrigger className="w-48">
            {/* Base UI's Select.Value falls back to the raw stored value
                (a category id, or the "__all__" sentinel) unless it is told
                how to resolve a label itself. */}
            <SelectValue placeholder={t("filters.allCategories")}>
              {(value: string | null) =>
                !value || value === ALL_CATEGORIES
                  ? t("filters.allCategories")
                  : (categories.find((category) => category.id === value)?.name ??
                    t("filters.allCategories"))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t("filters.allCategories")}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={catalog.status}
          onValueChange={(value) => catalog.setStatus((value as StatusFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue>
              {(value: StatusFilter | null) => t(`filters.status.${value ?? "all"}`)}
            </SelectValue>
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

      {catalog.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{catalog.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : catalog.initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          hasFilters={hasFilters}
          onClearFilters={clearFilters}
          onCreate={openCreate}
        />
      ) : (
        <div
          className={
            // Dimmed while a filter request is in flight, instead of unmounting
            // the grid — replacing it with a spinner on every keystroke makes
            // the page flash and loses the scroll position.
            catalog.loading ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === services.length}
              onCheckedChange={(checked) =>
                setSelectedIds(checked === true ? new Set(services.map((s) => s.id)) : new Set())
              }
            />
            {t("card.selectAll")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onView={setViewing}
                onEdit={openEdit}
                onToggleActive={(target) => void toggleActive(target)}
                onDelete={(target) => setDeleteTarget({ kind: "single", service: target })}
                selected={selectedIds.has(service.id)}
                onToggleSelected={toggleSelected}
                busy={togglingId === service.id}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("resultCount", { count: catalog.total })}
            </p>
            <Pagination
              page={catalog.page}
              totalPages={catalog.totalPages}
              pageSize={catalog.pageSize}
              pageSizeOptions={SERVICE_PAGE_SIZES}
              onPageChange={catalog.setPage}
              onPageSizeChange={catalog.setPageSize}
              perPageLabel={t("pagination.perPage")}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-popover px-4 py-2.5 shadow-lg">
            <span className="text-sm font-medium text-foreground">
              {t("bulk.selectedCount", { count: selectedIds.size })}
            </span>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t("bulk.cancelSelection")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteTarget({ kind: "bulk" })}
            >
              <Trash2 className="mr-1.5 size-4" />
              {t("bulk.deleteSelected")}
            </Button>
          </div>
        </div>
      )}

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={editing}
        categories={categories}
        services={allServices}
        onSaved={() => void refreshAll()}
      />
      <CategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        onChanged={() => void refreshAll()}
      />
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void refreshAll()}
      />
      <ServiceDetailDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        service={viewing}
        onEdit={openEdit}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        title={
          deleteTarget?.kind === "single"
            ? t("card.deleteConfirmTitle", { name: deleteTarget.service.name })
            : t("bulk.deleteConfirmTitle", { count: selectedIds.size })
        }
        description={
          deleteTarget?.kind === "single"
            ? t("card.deleteConfirmDescription")
            : t("bulk.deleteConfirmDescription")
        }
      />
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClearFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  const t = useTranslations("Services");

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <ConciergeBell className="size-7 text-primary" />
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
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          {t("filters.clear")}
        </Button>
      ) : (
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 size-4" />
          {t("actions.new")}
        </Button>
      )}
    </div>
  );
}
