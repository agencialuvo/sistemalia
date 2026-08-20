"use client";

import { useCallback, useMemo, useState } from "react";
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
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryManagerDialog } from "@/components/services/category-manager-dialog";
import { ExcelImportDialog } from "@/components/services/excel-import-dialog";
import { ServiceCard } from "@/components/services/service-card";
import { ServiceFormDialog } from "@/components/services/service-form-dialog";
import { useServicesCatalog, type StatusFilter } from "@/hooks/use-services";
import { getApiErrorMessage } from "@/lib/api";
import { deactivateService, downloadTemplate, reactivateService } from "@/lib/services/api";
import { needsEvaluationLink, type Service } from "@/lib/validators/service";

const ALL_CATEGORIES = "__all__";
const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "inactive"];

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

  const { services, categories, refresh } = catalog;

  const pendingEvaluationLinks = useMemo(
    () => services.filter(needsEvaluationLink).length,
    [services],
  );

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
        await refresh();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("card.toggleFailed")));
      } finally {
        setTogglingId(null);
      }
    },
    [refresh, t],
  );

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
            <SelectValue placeholder={t("filters.allCategories")} />
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
            <SelectValue />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={openEdit}
                onToggleActive={(target) => void toggleActive(target)}
                busy={togglingId === service.id}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("resultCount", { count: services.length })}
          </p>
        </div>
      )}

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={editing}
        categories={categories}
        services={services}
        onSaved={() => void refresh()}
      />
      <CategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        onChanged={() => void refresh()}
      />
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void refresh()}
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
