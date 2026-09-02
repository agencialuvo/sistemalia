"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import {
  bulkImportClinicalTemplates,
  type ImportTemplatesResult,
  type ImportTemplateRowStatus,
} from "@/lib/patients/api";
import { cn } from "@/lib/utils";

/** Mirrors MAX_IMPORT_FILE_BYTES in ClinicalTemplatesExcelService. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".csv", ".json"];

/**
 * "Importar" en /plantillas-clinicas — carga masiva de plantillas clínicas
 * desde Excel/CSV o JSON. Mismo "drop a file, dry-run inmediato, confirmar
 * después" que ImportInventoryDialog, con una tabla de vista previa fila por
 * fila (Válida / Duplicada / Error), no solo una lista de errores.
 */
export function ImportTemplateDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations("Settings.clinicalTemplates.import");
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportTemplatesResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [importing, setImporting] = useState(false);

  const resetState = useCallback(() => {
    setFile(null);
    setPreview(null);
    setDragging(false);
    setAnalysing(false);
    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

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

      setFile(picked);
      setPreview(null);
      setAnalysing(true);
      try {
        setPreview(await bulkImportClinicalTemplates(picked, true));
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("analyseFailed")));
        setFile(null);
      } finally {
        setAnalysing(false);
      }
    },
    [t],
  );

  async function confirmImport() {
    if (!file) return;
    setImporting(true);
    try {
      const result = await bulkImportClinicalTemplates(file, false);
      toast.success(t("done", { count: result.imported }));
      onOpenChange(false);
      onImported();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("importFailed")));
    } finally {
      setImporting(false);
    }
  }

  const hasValidRows = (preview?.successCount ?? 0) > 0;
  const hasIssues = (preview?.rows.filter((row) => row.status !== "valid").length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!file ? (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void analyse(event.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/60 hover:bg-muted/40",
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("dropTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("dropHelp")}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <FileSpreadsheet className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState} aria-label={t("remove")}>
                <X className="size-4" />
              </Button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.json"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) void analyse(picked);
            }}
            className="hidden"
          />

          {analysing && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("analysing")}
            </div>
          )}

          {preview && !analysing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard tone="success" value={preview.successCount} label={t("validRows")} />
                <SummaryCard
                  tone={preview.duplicateCount > 0 ? "warning" : "neutral"}
                  value={preview.duplicateCount}
                  label={t("duplicateRows")}
                />
                <SummaryCard
                  tone={hasIssues ? "danger" : "neutral"}
                  value={preview.rows.filter((row) => row.status === "error").length}
                  label={t("errorRows")}
                />
              </div>

              {preview.rows.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">{t("previewTableTitle")}</p>
                  <div className="max-h-72 overflow-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">{t("colRow")}</TableHead>
                          <TableHead>{t("colName")}</TableHead>
                          <TableHead>{t("colCategory")}</TableHead>
                          <TableHead className="w-24">{t("colFields")}</TableHead>
                          <TableHead className="w-32">{t("colStatus")}</TableHead>
                          <TableHead>{t("colDetail")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row) => (
                          <TableRow key={row.row}>
                            <TableCell className="font-mono text-xs tabular-nums">{row.row}</TableCell>
                            <TableCell className="max-w-48 truncate text-xs">{row.name || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.category || "—"}</TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">
                              {row.fieldCount}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.errors.length > 0 ? row.errors.join(" ") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {hasIssues && <p className="mt-2 text-xs text-muted-foreground">{t("errorTableHelp")}</p>}
                </div>
              )}

              {!hasValidRows && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-xs text-foreground">{t("nothingToImport")}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void confirmImport()} disabled={!hasValidRows || importing || analysing}>
            {importing ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" />
            )}
            {t("confirm", { count: preview?.successCount ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status, label }: { status: ImportTemplateRowStatus; label: string }) {
  if (status === "valid") {
    return (
      <Badge variant="default">
        <CheckCircle2 className="size-3" />
        {label}
      </Badge>
    );
  }
  if (status === "duplicate") {
    return (
      <Badge variant="secondary" style={{ backgroundColor: "#F59E0B1A", color: "#F59E0B" }}>
        <Copy className="size-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="size-3" />
      {label}
    </Badge>
  );
}

function SummaryCard({
  tone,
  value,
  label,
}: {
  tone: "success" | "danger" | "warning" | "neutral";
  value: number;
  label: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "success" && value > 0 && "border-primary/30 bg-primary/5",
        tone === "danger" && value > 0 && "border-destructive/30 bg-destructive/5",
        tone === "warning" && value > 0 && "border-amber-500/30 bg-amber-500/10",
        (tone === "neutral" || value === 0) && "border-border bg-muted/40",
      )}
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
