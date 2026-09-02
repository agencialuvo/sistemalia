"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockAdjustmentDialog } from "@/components/inventory/stock-adjustment-dialog";
import { INVENTORY_PAGE_SIZES, listKardex, type InventoryPageSize } from "@/lib/inventory/api";
import {
  formatQuantity,
  formatSolesAmount,
  STOCK_MOVEMENT_TYPE_LABELS,
  STOCK_MOVEMENT_TYPES,
  type StockMovement,
  type StockMovementType,
} from "@/lib/validators/inventory";

const ALL_TYPES = "__all__";

/** "2026-08-30T14:30:00.000Z" -> "30 ago 2026, 14:30". */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Salidas restan del Kardex, entradas suman — puramente visual (signo del
 *  número), `type` sigue siendo la fuente de verdad del lado del backend. */
const OUTFLOW_TYPES: StockMovementType[] = [
  "CLINICAL_CONSUMPTION",
  "RETAIL_SALE",
  "ADJUSTMENT_SUB",
  "EXPIRED_DISCARD",
];

/**
 * Pestaña "Kardex / Movimientos" (Módulo 07 Fase 3, Task 3.2) — historial
 * cronológico inmutable, con el modal de ajuste manual.
 */
export function KardexTab({
  refreshKey,
  onAdjusted,
}: {
  refreshKey: number;
  /** Notifica al padre para que refresque Productos/Lotes también. */
  onAdjusted: () => void;
}) {
  const t = useTranslations("Inventory");

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<InventoryPageSize>(24);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);

  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listKardex({
        type: typeFilter === ALL_TYPES ? undefined : (typeFilter as StockMovementType),
        page,
        pageSize,
      });
      setMovements(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [typeFilter, page, pageSize, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value ?? ALL_TYPES);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue>
              {(value: string | null) =>
                !value || value === ALL_TYPES
                  ? t("kardex.allTypes")
                  : STOCK_MOVEMENT_TYPE_LABELS[value as StockMovementType]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>{t("kardex.allTypes")}</SelectItem>
            {STOCK_MOVEMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {STOCK_MOVEMENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => setAdjustmentOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          {t("kardex.newAdjustment")}
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
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <History className="size-8 text-muted-foreground/60" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("kardex.empty.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("kardex.empty.description")}</p>
          </div>
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">{t("kardex.table.date")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("kardex.table.type")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("kardex.table.product")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("kardex.table.lot")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("kardex.table.quantity")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("kardex.table.costUnitPrice")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("kardex.table.performedBy")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((movement) => {
                  const isOutflow = OUTFLOW_TYPES.includes(movement.type);
                  return (
                    <tr key={movement.id}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{STOCK_MOVEMENT_TYPE_LABELS[movement.type]}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground">{movement.product.name}</p>
                        <p className="text-xs text-muted-foreground">{movement.product.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {movement.batch?.lotNumber ?? "—"}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium ${isOutflow ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
                      >
                        {isOutflow ? "-" : "+"}
                        {formatQuantity(movement.quantity)} {movement.product.unitOfMeasure}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        {formatSolesAmount(movement.costUnitPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {movement.performedBy?.fullName ?? "—"}
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

      <StockAdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        onSaved={() => {
          void refresh();
          onAdjusted();
        }}
      />
    </div>
  );
}
