"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createBatch, listProducts } from "@/lib/inventory/api";
import { batchEntrySchema, type Product } from "@/lib/validators/inventory";

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_DRAFT = {
  lotNumber: "",
  expirationDate: "",
  quantity: "",
  costUnitPrice: "",
  notes: "",
};

type Draft = typeof EMPTY_DRAFT;

/**
 * Modal de ingreso de lote / compra (Módulo 07 Fase 2, Task 2.3). Crea el
 * InventoryBatch y su fila de Kardex PURCHASE_INPUT en una sola llamada
 * (POST /inventory/batches ya hace ambas cosas en una transacción).
 */
export function BatchEntryDialog({
  open,
  onOpenChange,
  defaultProduct = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Precarga el producto cuando se abre desde "Ingresar Lote" de una fila
   *  puntual del catálogo — si es null, el usuario lo busca. */
  defaultProduct?: Product | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Inventory");

  const [product, setProduct] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProduct(defaultProduct);
    setProductSearch("");
    setDraft({ ...EMPTY_DRAFT, costUnitPrice: defaultProduct?.costPrice ?? "" });
    setErrors({});
  }, [open, defaultProduct]);

  useEffect(() => {
    if (!open || defaultProduct) return;
    const timer = setTimeout(() => {
      setProductLoading(true);
      void listProducts({ search: productSearch.trim() || undefined, isActive: true, pageSize: 12 })
        .then((result) => setProductResults(result.data))
        .catch(() => setProductResults([]))
        .finally(() => setProductLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, defaultProduct, productSearch]);

  function selectProduct(next: Product) {
    setProduct(next);
    setDraft((d) => ({ ...d, costUnitPrice: d.costUnitPrice || next.costPrice }));
  }

  async function save() {
    if (!product) {
      toast.error(t("batchEntry.selectProductFirst"));
      return;
    }
    const parsed = batchEntrySchema.safeParse({ ...draft, productId: product.id });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "lotNumber");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      await createBatch({
        productId: product.id,
        lotNumber: parsed.data.lotNumber,
        expirationDate: new Date(`${parsed.data.expirationDate}T00:00:00.000Z`).toISOString(),
        quantity: Number(parsed.data.quantity),
        costUnitPrice: parsed.data.costUnitPrice === "" ? undefined : Number(parsed.data.costUnitPrice),
        notes: parsed.data.notes?.trim() || undefined,
      });
      toast.success(t("batchEntry.created"));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("batchEntry.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(90vh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("batchEntry.title")}</DialogTitle>
          <DialogDescription>{t("batchEntry.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <Label>{t("batchEntry.productLabel")}</Label>
            {product ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {product.sku} · {product.unitOfMeasure}
                  </p>
                </div>
                {!defaultProduct && (
                  <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>
                    {t("batchEntry.changeProduct")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-1.5 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder={t("batchEntry.productSearchPlaceholder")}
                    className="pl-9"
                  />
                </div>
                {productLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : productResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("batchEntry.noProducts")}
                  </p>
                ) : (
                  <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {productResults.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => selectProduct(candidate)}
                          className="flex w-full flex-col p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <p className="truncate font-medium text-foreground">{candidate.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {candidate.sku} · {candidate.unitOfMeasure}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="batch-lot">{t("batchEntry.lotNumberLabel")}</Label>
            <Input
              id="batch-lot"
              value={draft.lotNumber}
              onChange={(event) => setDraft((d) => ({ ...d, lotNumber: event.target.value }))}
              placeholder={t("batchEntry.lotNumberPlaceholder")}
              className="mt-1.5"
            />
            {errors.lotNumber && <p className="mt-1 text-xs text-destructive">{errors.lotNumber}</p>}
          </div>

          <div>
            <Label htmlFor="batch-expiration">{t("batchEntry.expirationLabel")}</Label>
            <Input
              id="batch-expiration"
              type="date"
              value={draft.expirationDate}
              onChange={(event) => setDraft((d) => ({ ...d, expirationDate: event.target.value }))}
              className="mt-1.5"
            />
            {errors.expirationDate && (
              <p className="mt-1 text-xs text-destructive">{errors.expirationDate}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="batch-quantity">
                {t("batchEntry.quantityLabel")}
                {product ? ` (${product.unitOfMeasure})` : ""}
              </Label>
              <Input
                id="batch-quantity"
                type="number"
                min={0}
                step="0.01"
                value={draft.quantity}
                onChange={(event) => setDraft((d) => ({ ...d, quantity: event.target.value }))}
                className="mt-1.5"
              />
              {errors.quantity && <p className="mt-1 text-xs text-destructive">{errors.quantity}</p>}
            </div>
            <div>
              <Label htmlFor="batch-cost">{t("batchEntry.costUnitPriceLabel")}</Label>
              <Input
                id="batch-cost"
                type="number"
                min={0}
                step="0.01"
                value={draft.costUnitPrice}
                onChange={(event) => setDraft((d) => ({ ...d, costUnitPrice: event.target.value }))}
                placeholder={t("batchEntry.costUnitPricePlaceholder")}
                className="mt-1.5"
              />
              {errors.costUnitPrice && (
                <p className="mt-1 text-xs text-destructive">{errors.costUnitPrice}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="batch-notes">{t("batchEntry.notesLabel")}</Label>
            <Textarea
              id="batch-notes"
              value={draft.notes}
              onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
              placeholder={t("batchEntry.notesPlaceholder")}
              rows={2}
              className="mt-1.5"
            />
            {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes}</p>}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("batchEntry.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
