"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarOff, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { INVENTORY_PAGE_SIZES, listBatches, type InventoryPageSize } from "@/lib/inventory/api";
import {
  expirationAlertLevel,
  formatQuantity,
  type ExpirationAlertLevel,
  type InventoryBatch,
} from "@/lib/validators/inventory";

/** Semáforo DIGEMID (spec §3.2) — mismas clases que APPOINTMENT_STATUS_COLORS
 *  en su forma (border/bg/text), distinto vocabulario de color. */
const ALERT_BADGE_CLASSES: Record<ExpirationAlertLevel, string> = {
  expired: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  red: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  yellow: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** "Lotes por vencer este mes" (plan.md §1) — 30 días. */
const EXPIRING_SOON_DAYS = 30;

/** Pestaña "Lotes y Vencimientos" (Módulo 07 Fase 3, Task 3.1). */
export function BatchesTab({ refreshKey }: { refreshKey: number }) {
  const t = useTranslations("Inventory");

  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<InventoryPageSize>(12);
  const [expiringOnly, setExpiringOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listBatches({
        expiringWithinDays: expiringOnly ? EXPIRING_SOON_DAYS : undefined,
        page,
        pageSize,
      });
      setBatches(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [expiringOnly, page, pageSize, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={expiringOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setExpiringOnly((current) => !current);
            setPage(1);
          }}
        >
          {t("batches.expiringSoonFilter")}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <CalendarOff className="size-8 text-muted-foreground/60" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("batches.empty.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("batches.empty.description")}</p>
          </div>
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{t("batches.table.lot")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("batches.table.product")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("batches.table.expiration")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("batches.table.currentQuantity")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("batches.table.initialQuantity")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => {
                  const level = expirationAlertLevel(batch.expirationDate);
                  return (
                    <tr key={batch.id}>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{batch.lotNumber}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground">{batch.product.name}</p>
                        <p className="text-xs text-muted-foreground">{batch.product.sku}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={ALERT_BADGE_CLASSES[level]} variant="outline">
                          {new Date(batch.expirationDate).toLocaleDateString("es-PE", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                          {" · "}
                          {t(`batches.alertLevel.${level}`)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">
                        {formatQuantity(batch.currentQuantity)} {batch.product.unitOfMeasure}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        {formatQuantity(batch.initialQuantity)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("resultCount", { count: total })}</p>
            <Pagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              pageSizeOptions={INVENTORY_PAGE_SIZES}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value as InventoryPageSize);
                setPage(1);
              }}
              perPageLabel={t("pagination.perPage")}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
