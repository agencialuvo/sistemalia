"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { downloadStaffTemplate, importStaffExcel, previewStaffExcelImport } from "@/lib/staff/api";
import type { StaffImportResult } from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

/** Mirrors MAX_IMPORT_FILE_BYTES in the API. Checked here too so a 6MB file is
 *  refused before it is uploaded, not after — same guard as ExcelImportDialog
 *  (components/services/excel-import-dialog.tsx). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"];

/**
 * Import guiado por pasos (Subir -> Validar/Preview -> Confirmar) para la
 * carga masiva de personal — mismo patrón que ExcelImportDialog del Módulo 03,
 * adaptado a especialidades en vez de categorías.
 */
export function StaffExcelImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations("Staff");
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<StaffImportResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  /** Picking a file runs the preview immediately: the preview IS the point of
   *  this dialog, so making the user press a second button first would only
   *  add a step between them and the answer. */
  const analyse = useCallback(
    async (picked: File) => {
      const extension = picked.name.slice(picked.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        toast.error(t("import.wrongType"));
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        toast.error(t("import.tooLarge"));
        return;
      }

      setFile(picked);
      setPreview(null);
      setAnalysing(true);
      try {
        setPreview(await previewStaffExcelImport(picked));
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("import.analyseFailed")));
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
      const result = await importStaffExcel(file);
      toast.success(t("import.done", { count: result.imported }));
      onOpenChange(false);
      onImported();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("import.importFailed")));
    } finally {
      setImporting(false);
    }
  }

  const hasValidRows = (preview?.successCount ?? 0) > 0;
  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const hasWarnings = (preview?.warnings.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("import.templateTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("import.templateHelp")}</p>
            </div>
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
              {t("import.downloadTemplate")}
            </Button>
          </div>

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
                <p className="text-sm font-medium text-foreground">{t("import.dropTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.dropHelp")}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <FileSpreadsheet className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState} aria-label={t("common.remove")}>
                <X className="size-4" />
              </Button>
            </div>
          )}

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

          {analysing && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("import.analysing")}
            </div>
          )}

          {preview && !analysing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  tone="success"
                  value={preview.successCount}
                  label={t("import.validRows")}
                />
                <SummaryCard
                  tone={hasErrors ? "danger" : "neutral"}
                  value={preview.errors.length}
                  label={t("import.errorRows")}
                />
                <SummaryCard
                  tone="neutral"
                  value={preview.newSpecialtyNames.length}
                  label={t("import.newSpecialties")}
                />
              </div>

              {preview.newSpecialtyNames.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-foreground">
                    {t("import.willCreateSpecialties")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {preview.newSpecialtyNames.map((name) => (
                      <Badge key={name} variant="secondary">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasErrors && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="size-4 text-destructive" />
                    <p className="text-sm font-medium text-foreground">
                      {t("import.errorTableTitle")}
                    </p>
                  </div>
                  {/* The valid rows are imported anyway, so this table is a
                      to-do list for a second pass, not a blocker. */}
                  <p className="mb-2 text-xs text-muted-foreground">{t("import.errorTableHelp")}</p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">{t("import.colRow")}</TableHead>
                          <TableHead className="w-48">{t("import.colColumn")}</TableHead>
                          <TableHead>{t("import.colError")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.errors.map((error, index) => (
                          <TableRow key={`${error.row}-${error.column}-${index}`}>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {error.row}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {error.column || "—"}
                            </TableCell>
                            <TableCell className="text-xs">{error.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {hasWarnings && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-500" />
                    <p className="text-sm font-medium text-foreground">
                      {t("import.warningTableTitle")}
                    </p>
                  </div>
                  {/* Warnings never block a row — it imports either way, just
                      without the service(s) that didn't match. */}
                  <p className="mb-2 text-xs text-muted-foreground">{t("import.warningTableHelp")}</p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">{t("import.colRow")}</TableHead>
                          <TableHead className="w-48">{t("import.colColumn")}</TableHead>
                          <TableHead>{t("import.colError")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.warnings.map((warning, index) => (
                          <TableRow key={`${warning.row}-${warning.column}-${index}`}>
                            <TableCell className="font-mono text-xs tabular-nums">
                              {warning.row}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {warning.column || "—"}
                            </TableCell>
                            <TableCell className="text-xs">{warning.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {!hasValidRows && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-xs text-foreground">{t("import.nothingToImport")}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirmImport} disabled={!hasValidRows || importing || analysing}>
            {importing ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" />
            )}
            {t("import.confirm", { count: preview?.successCount ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  tone,
  value,
  label,
}: {
  tone: "success" | "danger" | "neutral";
  value: number;
  label: string;
}) {
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
