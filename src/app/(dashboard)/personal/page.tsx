"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Download,
  FileUp,
  Loader2,
  Plus,
  Power,
  Search,
  Stethoscope,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AbsenceDialog } from "@/components/staff/absence-dialog";
import { SpecialtyManagerDialog } from "@/components/staff/specialty-manager-dialog";
import { StaffCard } from "@/components/staff/staff-card";
import { StaffDetailDialog } from "@/components/staff/staff-detail-dialog";
import { StaffExcelImportDialog } from "@/components/staff/staff-excel-import-dialog";
import { StaffFormDialog } from "@/components/staff/staff-form-dialog";
import { useStaffDirectory, type StaffStatusFilter } from "@/hooks/use-staff";
import { getApiErrorMessage } from "@/lib/api";
import {
  deactivateStaffMember,
  deleteStaffMemberPermanently,
  downloadStaffTemplate,
  getStaffMember,
  reactivateStaffMember,
  STAFF_PAGE_SIZES,
} from "@/lib/staff/api";
import { listCategories, listServices } from "@/lib/services/api";
import type { Service, ServiceCategory } from "@/lib/validators/service";
import type { StaffMember } from "@/lib/validators/staff";

const ALL_SPECIALTIES = "__all__";
const ALL_SERVICES = "__all__";
const STATUS_OPTIONS: StaffStatusFilter[] = ["all", "active", "inactive"];

/** What the confirm-delete dialog is currently guarding: one card's
 *  "Eliminar", or the bulk "Eliminar seleccionados" bar. `null` = closed. */
type DeleteTarget = { kind: "single"; staff: StaffMember } | { kind: "bulk" } | null;

/**
 * /personal — Gestión de Personal y Doctores (Módulo 04, spec §4).
 *
 * Top-level Spanish slug, no /dashboard prefix — same convention as
 * /servicios (see app/(dashboard)/servicios/page.tsx's doc comment).
 */
export default function PersonalPage() {
  const t = useTranslations("Staff");
  const directory = useStaffDirectory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [specialtiesOpen, setSpecialtiesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [absencesOpen, setAbsencesOpen] = useState(false);
  const [absenceTarget, setAbsenceTarget] = useState<StaffMember | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const [deactivatingBulk, setDeactivatingBulk] = useState(false);

  // Módulo 03's catalogue — needed for the "servicio asignado" filter and for
  // Tab 2 of the professional form. Fetched once; the catalogue rarely
  // changes mid-session and a stale entry here only means a checkbox lags a
  // few minutes behind, not a correctness issue.
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);

  useEffect(() => {
    void listServices()
      .then((result) => setServices(result.data))
      .catch(() => setServices([]));
    void listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const { staff, specialties, refresh } = directory;

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      await downloadStaffTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("import.templateFailed")));
    } finally {
      setDownloading(false);
    }
  }

  const openEdit = useCallback((member: StaffMember) => {
    setEditing(member);
    setFormOpen(true);
  }, []);

  const openAbsences = useCallback((member: StaffMember) => {
    setAbsenceTarget(member);
    setAbsencesOpen(true);
  }, []);

  /** The grid only carries the list-view shape (specialty, _count, schedules)
   *  — the detail dialog needs services/absences too, so it fetches the full
   *  record before opening rather than showing an incomplete preview. */
  const openDetail = useCallback(
    async (member: StaffMember) => {
      setDetailLoadingId(member.id);
      try {
        setViewing(await getStaffMember(member.id));
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("detail.loadFailed")));
      } finally {
        setDetailLoadingId(null);
      }
    },
    [t],
  );

  const toggleActive = useCallback(
    async (member: StaffMember) => {
      setTogglingId(member.id);
      try {
        if (member.isActive) {
          await deactivateStaffMember(member.id);
          toast.success(t("card.deactivated", { name: `${member.firstName} ${member.lastName}` }));
        } else {
          await reactivateStaffMember(member.id);
          toast.success(t("card.reactivated", { name: `${member.firstName} ${member.lastName}` }));
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

  const toggleSelected = useCallback((member: StaffMember, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(member.id);
      else next.delete(member.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /** Bulk "Desactivar seleccionados" — soft, no confirmation modal, same as
   *  the individual card's toggle. */
  const deactivateSelected = useCallback(async () => {
    setDeactivatingBulk(true);
    try {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(ids.map((id) => deactivateStaffMember(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(t("bulk.deactivatePartialFailure", { failed, total: ids.length }));
      } else {
        toast.success(t("bulk.deactivated", { count: ids.length }));
      }
      clearSelection();
      await refresh();
    } finally {
      setDeactivatingBulk(false);
    }
  }, [selectedIds, clearSelection, refresh, t]);

  /** Runs the actual hard delete once ConfirmDeleteDialog has been accepted —
   *  branches on single-card "Eliminar" vs. the bulk action bar. */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        await deleteStaffMemberPermanently(deleteTarget.staff.id);
        toast.success(
          t("card.deleted", { name: `${deleteTarget.staff.firstName} ${deleteTarget.staff.lastName}` }),
        );
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.staff.id);
          return next;
        });
      } else {
        const ids = [...selectedIds];
        const results = await Promise.allSettled(ids.map((id) => deleteStaffMemberPermanently(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("bulk.deleted", { count: ids.length }));
        }
        clearSelection();
      }
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedIds, refresh, clearSelection, t]);

  const hasFilters =
    directory.search.trim() !== "" ||
    directory.specialtyId !== "" ||
    directory.serviceId !== "" ||
    directory.status !== "all";

  function clearFilters() {
    directory.setSearch("");
    directory.setSpecialtyId("");
    directory.setServiceId("");
    directory.setStatus("all");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSpecialtiesOpen(true)}>
            <Stethoscope className="mr-1.5 size-4" />
            {t("actions.specialties")}
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={directory.search}
            onChange={(event) => directory.setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
            aria-label={t("filters.searchPlaceholder")}
          />
        </div>

        <Select
          value={directory.specialtyId || ALL_SPECIALTIES}
          onValueChange={(value) =>
            directory.setSpecialtyId(!value || value === ALL_SPECIALTIES ? "" : value)
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filters.allSpecialties")}>
              {(value: string | null) =>
                !value || value === ALL_SPECIALTIES
                  ? t("filters.allSpecialties")
                  : (specialties.find((s) => s.id === value)?.name ?? t("filters.allSpecialties"))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SPECIALTIES}>{t("filters.allSpecialties")}</SelectItem>
            {specialties.map((specialty) => (
              <SelectItem key={specialty.id} value={specialty.id}>
                {specialty.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={directory.serviceId || ALL_SERVICES}
          onValueChange={(value) =>
            directory.setServiceId(!value || value === ALL_SERVICES ? "" : value)
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filters.allServices")}>
              {(value: string | null) =>
                !value || value === ALL_SERVICES
                  ? t("filters.allServices")
                  : (services.find((s) => s.id === value)?.name ?? t("filters.allServices"))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SERVICES}>{t("filters.allServices")}</SelectItem>
            {services
              .filter((service) => service.isActive)
              .map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={directory.status}
          onValueChange={(value) => directory.setStatus((value as StaffStatusFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue>
              {(value: StaffStatusFilter | null) => t(`filters.status.${value ?? "all"}`)}
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

      {directory.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{directory.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : directory.initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : staff.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClearFilters={clearFilters} onCreate={openCreate} />
      ) : (
        <div
          className={directory.loading ? "opacity-60 transition-opacity" : "transition-opacity"}
        >
          <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === staff.length}
              onCheckedChange={(checked) =>
                setSelectedIds(checked === true ? new Set(staff.map((s) => s.id)) : new Set())
              }
            />
            {t("card.selectAll")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {staff.map((member) => (
              <StaffCard
                key={member.id}
                staff={member}
                onView={(target) => void openDetail(target)}
                onEdit={openEdit}
                onManageAbsences={openAbsences}
                onToggleActive={(target) => void toggleActive(target)}
                onDelete={(target) => setDeleteTarget({ kind: "single", staff: target })}
                selected={selectedIds.has(member.id)}
                onToggleSelected={toggleSelected}
                busy={togglingId === member.id || detailLoadingId === member.id}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("resultCount", { count: directory.total })}
            </p>
            <Pagination
              page={directory.page}
              totalPages={directory.totalPages}
              pageSize={directory.pageSize}
              pageSizeOptions={STAFF_PAGE_SIZES}
              onPageChange={directory.setPage}
              onPageSizeChange={directory.setPageSize}
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
              variant="outline"
              size="sm"
              onClick={() => void deactivateSelected()}
              disabled={deactivatingBulk}
            >
              {deactivatingBulk ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Power className="mr-1.5 size-4" />
              )}
              {t("bulk.deactivateSelected")}
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

      <StaffFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        staff={editing}
        specialties={specialties}
        services={services}
        categories={categories}
        onSaved={() => void refresh()}
      />
      <SpecialtyManagerDialog
        open={specialtiesOpen}
        onOpenChange={setSpecialtiesOpen}
        onChanged={() => void refresh()}
      />
      <StaffExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void refresh()}
      />
      <AbsenceDialog
        open={absencesOpen}
        onOpenChange={setAbsencesOpen}
        staff={absenceTarget}
        onChanged={() => void refresh()}
      />
      <StaffDetailDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        staff={viewing}
        onEdit={openEdit}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        title={
          deleteTarget?.kind === "single"
            ? t("card.deleteConfirmTitle", {
                name: `${deleteTarget.staff.firstName} ${deleteTarget.staff.lastName}`,
              })
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
  const t = useTranslations("Staff");

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <UsersRound className="size-7 text-primary" />
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
