"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import { bulkImportAppointments, downloadAppointmentsTemplate, type BulkImportAppointmentItem } from "@/lib/appointments/api";
import { parseBulkImportFile, type ParsedImportRow } from "@/lib/appointments/bulk-import-parser";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"];

interface CombinedError {
  row: number;
  reason: string;
}

/**
 * Wizard de 2 pasos para Carga Masiva de Citas: (1) subir un .xlsx/.csv —
 * se parsea 100% en el cliente (bulk-import-parser.ts, vía `xlsx`) apenas se
 * suelta el archivo, sin ida y vuelta al servidor; (2) previsualizar filas
 * válidas/con error y confirmar. El envío real usa
 * `POST /appointments/bulk-import` (JSON), NO el viejo
 * `/appointments/import` multipart — ese endpoint no soporta auto-creación
 * de paciente ni `failOnError`, que es justamente lo que este flujo necesita.
 *
 * Las filas que el cliente ya marcó como inválidas (falta un campo
 * obligatorio, fecha/hora con formato irreconocible) NUNCA se envían — no
 * hay forma de armar un DTO válido con ellas. Solo lo que el backend
 * necesita resolver contra la base de datos (¿existe ese profesional/sala/
 * servicio?, ¿choca de horario?) viaja en el request.
 */
export function AppointmentBulkImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations("Appointments.import");
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [failOnError, setFailOnError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; failed: number; rolledBack: boolean } | null>(null);
  const [combinedErrors, setCombinedErrors] = useState<CombinedError[]>([]);

  const resetState = useCallback(() => {
    setStep("upload");
    setFileName(null);
    setDragging(false);
    setParsing(false);
    setRows([]);
    setFailOnError(false);
    setSubmitting(false);
    setSummary(null);
    setCombinedErrors([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      await downloadAppointmentsTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("templateFailed")));
    } finally {
      setDownloading(false);
    }
  }

  const analyse = useCallback(
    async (picked: File) => {
      const extension = picked.name.slice(picked.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        toast.error(t("wrongType"));
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        toast.error(t("tooLarge"));
        return;
      }

      setFileName(picked.name);
      setParsing(true);
      try {
        const parsed = await parseBulkImportFile(picked);
        if (parsed.length === 0) {
          toast.error(t("emptyFile"));
          setFileName(null);
          return;
        }
        setRows(parsed);
        setStep("preview");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("analyseFailed"));
        setFileName(null);
      } finally {
        setParsing(false);
      }
    },
    [t],
  );

  const validRows = rows.filter((row) => row.status === "valid");
  const errorRows = rows.filter((row) => row.status === "error");

  async function handleConfirm() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setSummary(null);
    setCombinedErrors([]);
    try {
      const appointments: BulkImportAppointmentItem[] = validRows.map((row) => ({
        patientPhone: row.patientPhone!,
        patientName: row.patientName,
        serviceName: row.serviceName!,
        staffMemberId: row.staffMemberId!,
        roomId: row.roomId,
        equipmentId: row.equipmentId,
        startAt: row.startAt!,
        endAt: row.endAt,
        notes: row.notes,
      }));
      // errors[].index del backend es la posición dentro de este arreglo, no
      // el número de fila del archivo — este mapa traduce uno al otro.
      const rowNumberByIndex = validRows.map((row) => row.row);

      const result = await bulkImportAppointments({ appointments, failOnError });

      const clientErrors: CombinedError[] = errorRows.map((row) => ({ row: row.row, reason: row.issues.join(" ") }));
      const serverErrors: CombinedError[] = result.errors.map((error) => ({
        row: rowNumberByIndex[error.index] ?? error.index + 1,
        reason: error.error,
      }));
      const allErrors = [...clientErrors, ...serverErrors].sort((a, b) => a.row - b.row);

      setSummary({ imported: result.importedCount, failed: clientErrors.length + serverErrors.length, rolledBack: result.rolledBack });
      setCombinedErrors(allErrors);

      const toastMessage = result.rolledBack
        ? t("rolledBack", { count: allErrors.length })
        : t("done", { imported: result.importedCount, failed: clientErrors.length + serverErrors.length });
      if (result.importedCount > 0) toast.success(toastMessage);
      else toast.error(toastMessage);

      if (result.importedCount > 0) {
        onImported();
      }
      if (allErrors.length === 0) {
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("importFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const picked = event.dataTransfer.files[0];
    if (picked) void analyse(picked);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {step === "upload" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("templateTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("templateHelp")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={downloading}>
                  {downloading ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 size-4" />
                  )}
                  {t("downloadTemplate")}
                </Button>
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40",
                )}
              >
                {parsing ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {parsing ? t("analysing") : fileName ? fileName : t("dropTitle")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("dropHelp")}</p>
                </div>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) void analyse(picked);
                }}
                className="hidden"
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <FileSpreadsheet className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("rowsSummary", { valid: validRows.length, error: errorRows.length })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetState} aria-label={t("remove")}>
                  <X className="size-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard tone="success" value={validRows.length} label={t("validRows")} />
                <SummaryCard tone={errorRows.length > 0 ? "danger" : "neutral"} value={errorRows.length} label={t("errorRows")} />
              </div>

              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">{t("colRow")}</TableHead>
                      <TableHead>{t("colPatient")}</TableHead>
                      <TableHead>{t("colStaff")}</TableHead>
                      <TableHead>{t("colService")}</TableHead>
                      <TableHead>{t("colWhen")}</TableHead>
                      <TableHead className="w-28">{t("colStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.row}>
                        <TableCell className="font-mono text-xs tabular-nums">{row.row}</TableCell>
                        <TableCell className="text-xs">
                          <p className="font-medium text-foreground">{row.patientName || "—"}</p>
                          <p className="text-muted-foreground">{row.patientPhone || "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs">{row.staffMemberId || "—"}</TableCell>
                        <TableCell className="text-xs">{row.serviceName || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {row.displayDate} {row.displayTime}
                        </TableCell>
                        <TableCell>
                          {row.status === "valid" ? (
                            <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              {t("badgeValid")}
                            </Badge>
                          ) : (
                            <Badge
                              className="border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              title={row.issues.join(" ")}
                            >
                              {t("badgeError")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {errorRows.length > 0 && (
                <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-destructive" />
                    <p className="text-sm font-medium text-foreground">{t("errorTableTitle")}</p>
                  </div>
                  <ul className="space-y-0.5 text-xs text-foreground">
                    {errorRows.map((row) => (
                      <li key={row.row}>
                        <span className="font-mono text-muted-foreground">#{row.row}:</span> {row.issues.join(" ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="bulk-import-fail-on-error"
                  checked={failOnError}
                  onCheckedChange={(value) => setFailOnError(value === true)}
                />
                <Label htmlFor="bulk-import-fail-on-error" className="cursor-pointer text-sm font-normal">
                  {t("failOnErrorLabel")}
                </Label>
              </div>

              {summary && (
                <div
                  className={cn(
                    "space-y-1 rounded-lg border p-3 text-sm",
                    summary.imported > 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  <p className="font-medium text-foreground">
                    {summary.rolledBack ? t("rolledBack", { count: combinedErrors.length }) : t("done", { imported: summary.imported, failed: summary.failed })}
                  </p>
                  {combinedErrors.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {combinedErrors.map((error, index) => (
                        <li key={`${error.row}-${index}`}>
                          <span className="font-mono">#{error.row}:</span> {error.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          {step === "preview" && (
            <Button onClick={() => void handleConfirm()} disabled={validRows.length === 0 || submitting}>
              {submitting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-4" />}
              {t("confirm", { count: validRows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ tone, value, label }: { tone: "success" | "danger" | "neutral"; value: number; label: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "success" && value > 0 && "border-primary/30 bg-primary/5",
        tone === "danger" && value > 0 && "border-destructive/30 bg-destructive/5",
        (tone === "neutral" || value === 0) && "border-border bg-muted/40",
      )}
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
