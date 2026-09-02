"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ClipboardList, Eye, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClinicalRecordFormDialog } from "@/components/patients/clinical-record-form-dialog";
import { ClinicalRecordSummaryDialog } from "@/components/patients/clinical-record-summary-dialog";
import { FaceMappingSummary } from "@/components/patients/face-mapping-summary";
import { getApiErrorMessage } from "@/lib/api";
import { deleteClinicalRecord, getPatientClinicalRecords } from "@/lib/patients/api";
import type { ClinicalProcedureRecord } from "@/lib/validators/patient";

/** "2026-08-28T10:00:00.000Z" -> "28 ago 2026, 10:00". */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tab "Atenciones y Procedimientos" (Fase 4, §4): timeline de
 * ClinicalProcedureRecord de este paciente, más el botón que abre el modal de
 * registro. Se recarga desde el propio backend (GET /patients/:id/clinical-records)
 * en vez de leer del payload de la ficha 360°, mismo patrón que
 * PatientMedicalHistoryTab.
 */
export function PatientClinicalRecordsTab({
  patientId,
  initialAppointmentId,
  onInitialAppointmentHandled,
}: {
  patientId: string;
  /** Cita que originó la visita a este tab (Módulo 06 Fase 3, Task 3.2) —
   *  llega desde "Registrar Atención Clínica" en el detalle de una cita
   *  COMPLETED y abre el modal de creación preseleccionándola. */
  initialAppointmentId?: string | null;
  /** Fired once the auto-open above has happened, so the caller can drop the
   *  `appointmentId` query param and not reopen the modal on every remount. */
  onInitialAppointmentHandled?: () => void;
}) {
  const t = useTranslations("Patients.detail.clinicalRecords");
  const tc = useTranslations("Patients.common");

  const [records, setRecords] = useState<ClinicalProcedureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ClinicalProcedureRecord | null>(null);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [summaryRecord, setSummaryRecord] = useState<ClinicalProcedureRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClinicalProcedureRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!initialAppointmentId) return;
    setEditingRecord(null);
    setPendingAppointmentId(initialAppointmentId);
    setFormOpen(true);
    onInitialAppointmentHandled?.();
    // Solo al recibir un nuevo appointmentId — onInitialAppointmentHandled no
    // debe disparar este efecto de nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAppointmentId]);

  function load() {
    setLoading(true);
    getPatientClinicalRecords(patientId)
      .then(setRecords)
      .catch((error) => toast.error(getApiErrorMessage(error, t("loadFailed"))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function openCreate() {
    setEditingRecord(null);
    setPendingAppointmentId(null);
    setFormOpen(true);
  }

  function openEdit(record: ClinicalProcedureRecord) {
    setEditingRecord(record);
    setPendingAppointmentId(null);
    setFormOpen(true);
  }

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClinicalRecord(patientId, deleteTarget.id);
      toast.success(t("deleted"));
      setDeleteTarget(null);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteFailed")));
    } finally {
      setDeleting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget, patientId, t]);

  // Total histórico acumulado (spec §4: "sumatoria global o histórica
  // acumulada en el tratamiento del paciente") — suma las unidades de todos
  // los marcadores de todos los registros con mapeo facial, no solo el último.
  const accumulatedUnits = records.reduce(
    (sum, record) =>
      sum + (record.faceMappingData?.markers.reduce((s, marker) => s + (marker.units ?? 0), 0) ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          {accumulatedUnits > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("accumulatedUnitsLabel", { units: accumulatedUnits })}
            </p>
          )}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />
          {t("newRecordButton")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
          <ClipboardList className="size-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const markers = record.faceMappingData?.markers ?? [];
            const sessionUnits = markers.reduce((sum, marker) => sum + (marker.units ?? 0), 0);
            return (
              <div
                key={record.id}
                role="button"
                tabIndex={0}
                onClick={() => setSummaryRecord(record)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSummaryRecord(record);
                  }
                }}
                className="flex cursor-pointer gap-3 rounded-lg border border-border bg-card p-4 text-left transition-shadow hover:shadow-md"
              >
                {markers.length > 0 && <FaceMappingSummary markers={markers} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {record.template?.name ?? t("templateDeleted")}
                      </h4>
                      <p className="text-xs text-muted-foreground">{formatDateTime(record.performedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      {record.staff && (
                        <Badge variant="secondary">
                          {record.staff.firstName} {record.staff.lastName}
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
                          aria-label={t("recordMenu.options")}
                        >
                          <MoreVertical className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSummaryRecord(record)}>
                            <Eye className="mr-2 size-4" />
                            {t("recordMenu.viewSummary")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(record)}>
                            <Pencil className="mr-2 size-4" />
                            {t("recordMenu.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(record)}>
                            <Trash2 className="mr-2 size-4" />
                            {t("recordMenu.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {markers.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("markerCount", { count: markers.length })} · {t("sessionUnitsLabel", { units: sessionUnits })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ClinicalRecordFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patientId={patientId}
        record={editingRecord}
        appointmentId={pendingAppointmentId}
        onSaved={() => {
          load();
        }}
      />
      <ClinicalRecordSummaryDialog
        open={summaryRecord !== null}
        onOpenChange={(next) => !next && setSummaryRecord(null)}
        record={summaryRecord}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        cancelLabel={tc("cancel")}
        confirmLabel={tc("delete")}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription")}
      />
    </div>
  );
}
