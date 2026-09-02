"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  FileUp,
  Loader2,
  Package,
  PackagePlus,
  Plus,
  Power,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BatchEntryDialog } from "@/components/inventory/batch-entry-dialog";
import { BatchesTab } from "@/components/inventory/batches-tab";
import { ImportInventoryDialog } from "@/components/inventory/import-inventory-dialog";
import { KardexTab } from "@/components/inventory/kardex-tab";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { getApiErrorMessage } from "@/lib/api";
import {
  downloadProductsTemplate,
  INVENTORY_PAGE_SIZES,
  listProducts,
  setProductActive,
  type InventoryPageSize,
} from "@/lib/inventory/api";
import {
  formatQuantity,
  formatSolesAmount,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type Product,
  type ProductType,
} from "@/lib/validators/inventory";

const ALL_TYPES = "__all__";
type StatusFilter = "all" | "active" | "inactive";

/**
 * /inventario — Módulo 07, Fase 2 (Task 2.4). Solo la pestaña "Productos" está
 * conectada en esta fase; "Lotes y Vencimientos" y "Kardex" (plan.md §1)
 * llegan en la Fase 3 junto con el semáforo DIGEMID.
 */
export default function InventoryPage() {
  const t = useTranslations("Inventory");

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<InventoryPageSize>(12);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDefaultProduct, setBatchDefaultProduct] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  /** Se incrementa tras cualquier escritura que mueva stock (ingreso de
   *  lote, ajuste manual) para que BatchesTab/KardexTab, que administran su
   *  propia carga de datos, vuelvan a pedirla. */
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefreshKey = useCallback(() => setRefreshKey((key) => key + 1), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProducts({
        search: search.trim() || undefined,
        type: typeFilter === ALL_TYPES ? undefined : (typeFilter as ProductType),
        isActive: statusFilter === "all" ? undefined : statusFilter === "active",
        page,
        pageSize,
      });
      setProducts(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [search, typeFilter, statusFilter, page, pageSize, t]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 300);
    return () => clearTimeout(timer);
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormOpen(true);
  }

  function openBatchEntry(product: Product | null) {
    setBatchDefaultProduct(product);
    setBatchOpen(true);
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadProductsTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("import.templateFailed")));
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function toggleActive(product: Product) {
    setTogglingId(product.id);
    try {
      await setProductActive(product.id, !product.isActive);
      toast.success(product.isActive ? t("card.deactivated") : t("card.reactivated"));
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("card.toggleFailed")));
    } finally {
      setTogglingId(null);
    }
  }

  const hasFilters = search.trim() !== "" || typeFilter !== ALL_TYPES || statusFilter !== "active";

  function clearFilters() {
    setSearch("");
    setTypeFilter(ALL_TYPES);
    setStatusFilter("active");
    setPage(1);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={downloadingTemplate}>
            {downloadingTemplate ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            {t("actions.downloadTemplate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-1.5 size-4" />
            {t("actions.importExcel")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openBatchEntry(null)}>
            <PackagePlus className="mr-1.5 size-4" />
            {t("actions.enterBatch")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            {t("actions.newProduct")}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="products">
        <TabsList variant="line">
          <TabsTrigger value="products">{t("tabs.products")}</TabsTrigger>
          <TabsTrigger value="batches">{t("tabs.batches")}</TabsTrigger>
          <TabsTrigger value="kardex">{t("tabs.kardex")}</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("filters.searchPlaceholder")}
                className="pl-9"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value ?? ALL_TYPES);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(value: string | null) =>
                    !value || value === ALL_TYPES
                      ? t("filters.allTypes")
                      : PRODUCT_TYPE_LABELS[value as ProductType]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>{t("filters.allTypes")}</SelectItem>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PRODUCT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter((value as StatusFilter | null) ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue>{(value: StatusFilter | null) => t(`filters.status.${value ?? "all"}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.status.all")}</SelectItem>
                <SelectItem value="active">{t("filters.status.active")}</SelectItem>
                <SelectItem value="inactive">{t("filters.status.inactive")}</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t("filters.clear")}
              </Button>
            )}
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
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
              <Package className="size-8 text-muted-foreground/60" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t("empty.title")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
              </div>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {t("filters.clear")}
                </Button>
              ) : (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 size-4" />
                  {t("actions.newProduct")}
                </Button>
              )}
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">{t("table.sku")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("table.name")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("table.type")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("table.stock")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("table.minStock")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("table.costPrice")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("table.salePrice")}</th>
                      <th className="px-3 py-2.5 font-medium">{t("table.status")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{t("table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.map((product) => (
                      <tr key={product.id} className={product.isActive ? "" : "opacity-60"}>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{product.sku}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{product.name}</span>
                            {product.isLowStock && (
                              <span title={t("table.lowStockTitle")}>
                                <AlertTriangle className="size-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{PRODUCT_TYPE_LABELS[product.type]}</td>
                        <td className="px-3 py-2.5 text-right text-foreground">
                          {formatQuantity(product.totalStock)} {product.unitOfMeasure}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatQuantity(product.minStock)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatSolesAmount(product.costPrice)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {formatSolesAmount(product.salePrice)}
                        </td>
                        <td className="px-3 py-2.5">
                          {product.isLowStock ? (
                            <Badge variant="destructive">{t("table.lowStockBadge")}</Badge>
                          ) : product.isActive ? (
                            <Badge variant="secondary">{t("filters.status.active")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("filters.status.inactive")}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openBatchEntry(product)}>
                              <PackagePlus className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                              {t("common.edit")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void toggleActive(product)}
                              disabled={togglingId === product.id}
                              aria-label={product.isActive ? t("card.deactivate") : t("card.reactivate")}
                            >
                              {togglingId === product.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Power className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
        </TabsContent>

        <TabsContent value="batches" className="mt-5">
          <BatchesTab refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="kardex" className="mt-5">
          <KardexTab
            refreshKey={refreshKey}
            onAdjusted={() => {
              void refresh();
              bumpRefreshKey();
            }}
          />
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        onSaved={() => void refresh()}
      />
      <BatchEntryDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        defaultProduct={batchDefaultProduct}
        onSaved={() => {
          void refresh();
          bumpRefreshKey();
        }}
      />
      <ImportInventoryDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void refresh()}
      />
    </div>
  );
}
