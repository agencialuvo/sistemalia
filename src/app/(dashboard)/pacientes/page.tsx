"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Download,
  Eye,
  FileUp,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Users,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientImportDialog } from "@/components/patients/patient-import-dialog";
import { PatientTagManagerDialog } from "@/components/patients/patient-tag-manager-dialog";
import {
  usePatientDirectory,
  type PatientGenderFilter,
  type PatientStatusFilter,
} from "@/hooks/use-patients";
import { usePatientTagCatalog } from "@/hooks/use-patient-tags";
import { getApiErrorMessage } from "@/lib/api";
import { deactivatePatient, downloadPatientsTemplate, PATIENT_PAGE_SIZES } from "@/lib/patients/api";
import {
  GENDER_LABELS,
  GENDERS,
  PATIENT_STATUS_LABELS,
  resolveTagColor,
  type Patient,
} from "@/lib/validators/patient";
import { cn } from "@/lib/utils";

/** What ConfirmDeleteDialog is currently guarding — one row's "Eliminar", or
 *  the bulk action bar. `null` means it's closed. Same DeleteTarget pattern
 *  as PatientTagManagerDialog / CategoryManagerDialog. */
type DeleteTarget = { kind: "single"; patient: Patient } | { kind: "bulk" } | null;

const STATUS_OPTIONS: PatientStatusFilter[] = ["all", "ACTIVE", "INACTIVE", "BLOCKED"];
const GENDER_OPTIONS: PatientGenderFilter[] = ["all", ...GENDERS];

/**
 * /pacientes — Gestión de Pacientes y CRM Operativo (Módulo 05, Fase 2).
 *
 * Top-level Spanish slug, no /dashboard prefix — same convention as
 * /servicios y /personal.
 */
export default function PacientesPage() {
  const t = useTranslations("Patients");
  const router = useRouter();
  const directory = usePatientDirectory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);
  const tagCatalog = usePatientTagCatalog();

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((patient: Patient) => {
    setEditing(patient);
    setFormOpen(true);
  }, []);

  const patients = directory.patients;
  const allOnPageSelected = patients.length > 0 && patients.every((p) => selected.has(p.id));
  const someOnPageSelected = patients.some((p) => selected.has(p.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        patients.forEach((p) => next.delete(p.id));
      } else {
        patients.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Baja lógica (spec §3: "Eliminar" abre confirmación antes de ejecutar el
   *  soft-delete) — cubre tanto la fila individual como la barra de lote. */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "single") {
        await deactivatePatient(deleteTarget.patient.id);
        toast.success(
          t("row.deleted", { name: `${deleteTarget.patient.firstName} ${deleteTarget.patient.lastName}` }),
        );
        setSelected((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.patient.id);
          return next;
        });
      } else {
        const ids = [...selected];
        const results = await Promise.allSettled(ids.map((id) => deactivatePatient(id)));
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(t("bulk.deletePartialFailure", { failed, total: ids.length }));
        } else {
          toast.success(t("bulk.deleted", { count: ids.length }));
        }
        setSelected(new Set());
      }
      setDeleteTarget(null);
      await directory.refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("row.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selected, directory, t]);

  const hasFilters =
    directory.search.trim() !== "" || directory.gender !== "all" || directory.status !== "all";

  function clearFilters() {
    directory.setSearch("");
    directory.setGender("all");
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
          <Button variant="outline" size="sm" onClick={() => setTagsOpen(true)}>
            <Tag className="mr-1.5 size-4" />
            {t("actions.manageTags")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadPatientsTemplate().catch((error) => {
                toast.error(getApiErrorMessage(error, t("import.templateFailed")));
              });
            }}
          >
            <Download className="mr-1.5 size-4" />
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label={t("stats.total")} value={directory.stats.total} />
        <StatTile icon={UserCheck} label={t("stats.active")} value={directory.stats.active} />
        <StatTile icon={UserPlus} label={t("stats.newThisMonth")} value={directory.stats.newThisMonth} />
      </div>

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
          value={directory.gender}
          onValueChange={(value) => directory.setGender((value as PatientGenderFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: PatientGenderFilter | null) =>
                !value || value === "all" ? t("filters.gender.all") : GENDER_LABELS[value]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? t("filters.gender.all") : GENDER_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={directory.status}
          onValueChange={(value) => directory.setStatus((value as PatientStatusFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: PatientStatusFilter | null) => t(`filters.status.${value ?? "all"}`)}
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
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void directory.refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : directory.initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : directory.patients.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClearFilters={clearFilters} onCreate={openCreate} />
      ) : (
        <div className={directory.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {selected.size > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">
                {t("bulk.selectedCount", { count: selected.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
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

          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={!allOnPageSelected && someOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t("table.selectAll")}
                    />
                  </TableHead>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.document")}</TableHead>
                  <TableHead>{t("table.contact")}</TableHead>
                  <TableHead>{t("table.tags")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="w-20 text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.patients.map((patient) => {
                  const fullName = `${patient.firstName} ${patient.lastName}`;
                  return (
                    <TableRow
                      key={patient.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/pacientes/${patient.id}`)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(patient.id)}
                          onCheckedChange={() => toggleSelect(patient.id)}
                          aria-label={t("row.select")}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm">
                            {patient.avatarUrl ? <AvatarImage src={patient.avatarUrl} alt="" /> : null}
                            <AvatarFallback>
                              {patient.firstName[0]?.toUpperCase()}
                              {patient.lastName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">{fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {patient.documentNumber || t("table.notProvided")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{patient.phone || t("table.notProvided")}</span>
                          {patient.email && (
                            <span className="text-xs text-muted-foreground/80">{patient.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {patient.tags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("table.noTags")}</span>
                        ) : (
                          <div className="flex max-w-56 flex-wrap gap-1">
                            {patient.tags.map((tag) => {
                              const color = resolveTagColor(tag, tagCatalog.tags);
                              return (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  style={{ backgroundColor: `${color}1A`, color }}
                                >
                                  {tag}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            patient.status === "ACTIVE"
                              ? "default"
                              : patient.status === "BLOCKED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {PATIENT_STATUS_LABELS[patient.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => router.push(`/pacientes/${patient.id}`)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={t("row.viewDetail")}
                          >
                            <Eye className="size-4" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted",
                              )}
                              aria-label={t("row.options")}
                            >
                              <MoreVertical className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/pacientes/${patient.id}`)}>
                                <Eye className="mr-2 size-4" />
                                {t("row.viewDetail")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(patient)}>
                                <Pencil className="mr-2 size-4" />
                                {t("row.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget({ kind: "single", patient })}
                              >
                                <Trash2 className="mr-2 size-4" />
                                {t("row.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("resultCount", { count: directory.total })}
            </p>
            <Pagination
              page={directory.page}
              totalPages={directory.totalPages}
              pageSize={directory.pageSize}
              pageSizeOptions={PATIENT_PAGE_SIZES}
              onPageChange={directory.setPage}
              onPageSizeChange={directory.setPageSize}
              perPageLabel={t("pagination.perPage")}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </div>
      )}

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editing}
        onSaved={() => void directory.refresh()}
      />
      <PatientImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void directory.refresh()}
      />
      <PatientTagManagerDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        onChanged={() => {
          void tagCatalog.refresh();
          void directory.refresh();
        }}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        title={
          deleteTarget?.kind === "single"
            ? t("row.deleteConfirmTitle", {
                name: `${deleteTarget.patient.firstName} ${deleteTarget.patient.lastName}`,
              })
            : t("bulk.deleteConfirmTitle", { count: selected.size })
        }
        description={
          deleteTarget?.kind === "single"
            ? t("row.deleteConfirmDescription")
            : t("bulk.deleteConfirmDescription")
        }
      />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
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
  const t = useTranslations("Patients");

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Users className="size-7 text-primary" />
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
