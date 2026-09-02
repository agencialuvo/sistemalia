"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FaceMappingSummary } from "@/components/patients/face-mapping-summary";
import type { ClinicalProcedureRecord, ClinicalRecordInsumo } from "@/lib/validators/patient";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Ver Resumen" (spec §4) — vista de solo lectura de un ClinicalProcedureRecord
 *  ya guardado: valores del formulario dinámico, insumo/lote y mapeo facial. */
export function ClinicalRecordSummaryDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ClinicalProcedureRecord | null;
}) {
  const t = useTranslations("Patients.detail.clinicalRecords");
  const tc = useTranslations("Patients.common");

  if (!record) return null;

  const { _insumo, ...answers } = record.formDataValues as Record<string, unknown> & {
    _insumo?: ClinicalRecordInsumo;
  };
  const fieldEntries = Object.entries(answers);
  const markers = record.faceMappingData?.markers ?? [];
  const sessionUnits = markers.reduce((sum, marker) => sum + (marker.units ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {record.template?.name ?? t("templateDeleted")}
          </DialogTitle>
          <DialogDescription>{formatDateTime(record.performedAt)}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {record.staff && (
            <Badge variant="secondary">
              {record.staff.firstName} {record.staff.lastName}
            </Badge>
          )}

          {fieldEntries.length > 0 ? (
            <div className="space-y-2">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="text-right font-medium text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("summaryDialog.noValues")}</p>
          )}

          {_insumo && (_insumo.brand || _insumo.lot || _insumo.expirationDate) && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("insumoTitle")}
              </h4>
              <div className="grid gap-1 text-sm text-foreground">
                {_insumo.brand && <span>{t("insumoBrandLabel")}: {_insumo.brand}</span>}
                {_insumo.lot && <span>{t("insumoLotLabel")}: {_insumo.lot}</span>}
                {_insumo.expirationDate && (
                  <span>{t("insumoExpirationLabel")}: {_insumo.expirationDate}</span>
                )}
              </div>
            </div>
          )}

          {markers.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("faceMapping.title")}
              </h4>
              <div className="flex gap-4">
                <FaceMappingSummary markers={markers} />
                <ul className="flex-1 space-y-1 text-xs">
                  {markers.map((marker) => (
                    <li key={marker.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                      <span className="font-medium text-foreground">{marker.label}</span>
                      <span className="text-muted-foreground">
                        {marker.units !== undefined ? t("unitsValue", { units: marker.units }) : ""}
                        {marker.units !== undefined && marker.ml !== undefined ? " · " : ""}
                        {marker.ml !== undefined ? t("mlValue", { ml: marker.ml }) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("sessionUnitsLabel", { units: sessionUnits })}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
