"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Eye, Loader2, Receipt, XCircle } from "lucide-react";

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
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { anullInvoice, getInvoice, listInvoices, SALES_PAGE_SIZES, type SalesPageSize } from "@/lib/sales/api";
import {
  formatSolesAmount,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUSES,
  INVOICE_TYPE_LABELS,
  INVOICE_TYPES,
  invoiceCustomerLabel,
  invoiceNumberLabel,
  type InvoiceDetail,
  type InvoiceListRow,
  type InvoiceStatus,
  type InvoiceType,
} from "@/lib/validators/sales";
import { InvoiceReceiptModal } from "@/components/sales/invoice-receipt-modal";

const ALL = "__all__";

/**
 * Pestaña "Historial de Ventas" (Módulo 08 Fase 3, Task 3.1, plan.md
 * Pestaña 2). Consume GET /sales/invoices con filtros por fecha, tipo de
 * comprobante y estado; la anulación reutiliza InventoryService.reverseSale
 * server-side (SalesService.anullInvoice) — este componente solo pide el
 * motivo y refresca la fila.
 */
export function HistoryTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const t = useTranslations("Sales");

  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<SalesPageSize>(12);

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | typeof ALL>(ALL);
  const [typeFilter, setTypeFilter] = useState<InvoiceType | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInvoices({
        status: statusFilter === ALL ? undefined : statusFilter,
        type: typeFilter === ALL ? undefined : typeFilter,
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999Z`).toISOString() : undefined,
        page,
        pageSize,
      });
      setInvoices(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      setError(t("history.loadFailed"));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [statusFilter, typeFilter, dateFrom, dateTo, page, pageSize, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const hasFilters = statusFilter !== ALL || typeFilter !== ALL || dateFrom !== "" || dateTo !== "";
  function clearFilters() {
    setStatusFilter(ALL);
    setTypeFilter(ALL);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  // --- Ver comprobante ---------------------------------------------------

  const [viewing, setViewing] = useState<InvoiceDetail | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);

  async function openReceipt(id: string) {
    setViewLoadingId(id);
    try {
      const detail = await getInvoice(id);
      setViewing(detail);
      setViewOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("history.loadOneFailed")));
    } finally {
      setViewLoadingId(null);
    }
  }

  // --- Anular ---------------------------------------------------------------

  const [anulling, setAnulling] = useState<InvoiceListRow | null>(null);
  const [anullReason, setAnullReason] = useState("");
  const [anullSaving, setAnullSaving] = useState(false);

  function openAnull(invoice: InvoiceListRow) {
    setAnulling(invoice);
    setAnullReason("");
  }

  async function confirmAnull() {
    if (!anulling || !anullReason.trim()) return;
    setAnullSaving(true);
    try {
      await anullInvoice(anulling.id, anullReason.trim());
      toast.success(t("history.anulled"));
      setAnulling(null);
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("history.anullFailed")));
    } finally {
      setAnullSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter((value as InvoiceStatus | null) ?? ALL);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: string | null) =>
                !value || value === ALL ? t("history.allStatuses") : INVOICE_STATUS_LABELS[value as InvoiceStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("history.allStatuses")}</SelectItem>
            {INVOICE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {INVOICE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter((value as InvoiceType | null) ?? ALL);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: string | null) =>
                !value || value === ALL ? t("history.allTypes") : INVOICE_TYPE_LABELS[value as InvoiceType]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("history.allTypes")}</SelectItem>
            {INVOICE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {INVOICE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          type="date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <span className="text-xs text-muted-foreground">{t("history.dateRangeSeparator")}</span>
        <input
          type="date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t("history.clearFilters")}
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {t("history.retry")}
          </Button>
        </div>
      ) : initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <Receipt className="size-8 text-muted-foreground/60" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("history.empty.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("history.empty.description")}</p>
          </div>
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{t("history.table.number")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("history.table.date")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("history.table.customer")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("history.table.type")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("history.table.total")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("history.table.status")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("history.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-2.5 font-mono text-xs text-foreground">{invoiceNumberLabel(invoice)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {new Date(invoice.createdAt).toLocaleString("es-PE")}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{invoiceCustomerLabel(invoice)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{INVOICE_TYPE_LABELS[invoice.type]}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">
                      {formatSolesAmount(invoice.total)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={INVOICE_STATUS_COLORS[invoice.status]}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void openReceipt(invoice.id)}>
                          {viewLoadingId === invoice.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </Button>
                        {invoice.status === "PAID" && (
                          <Button variant="ghost" size="sm" onClick={() => openAnull(invoice)}>
                            <XCircle className="size-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("history.resultCount", { count: total })}</p>
            <Pagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              pageSizeOptions={SALES_PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value as SalesPageSize);
                setPage(1);
              }}
              perPageLabel={t("history.pagination.perPage")}
              previousLabel={t("history.pagination.previous")}
              nextLabel={t("history.pagination.next")}
            />
          </div>
        </div>
      )}

      <InvoiceReceiptModal open={viewOpen} onOpenChange={setViewOpen} invoice={viewing} />

      <Dialog open={anulling !== null} onOpenChange={(next) => !next && !anullSaving && setAnulling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <DialogTitle className="text-lg">{t("history.anullDialog.title")}</DialogTitle>
            <DialogDescription>
              {anulling ? t("history.anullDialog.description", { number: invoiceNumberLabel(anulling) }) : ""}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={anullReason}
            onChange={(event) => setAnullReason(event.target.value)}
            placeholder={t("history.anullDialog.reasonPlaceholder")}
            rows={3}
            autoFocus
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAnulling(null)} disabled={anullSaving}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmAnull()}
              disabled={anullSaving || !anullReason.trim()}
            >
              {anullSaving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("history.anullDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
