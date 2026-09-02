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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createMovement, listBatches, listProducts } from "@/lib/inventory/api";
import {
  MANUAL_MOVEMENT_TYPES,
  STOCK_MOVEMENT_TYPE_LABELS,
  type InventoryBatch,
  type ManualMovementType,
  type Product,
} from "@/lib/validators/inventory";

const SEARCH_DEBOUNCE_MS = 300;
/** Sentinel para "sin lote específico" — solo válido en ADJUSTMENT_SUB/
 *  EXPIRED_DISCARD, donde el backend aplica FEFO si se omite. */
const BATCH_FEFO_SENTINEL = "__fefo__";

/**
 * Modal de ajuste manual de stock (Módulo 07 Fase 3, Task 3.2) — Ajuste
 * positivo, Merma/Salida o Baja por Vencimiento, vía POST /inventory/movements.
 * PURCHASE_INPUT tiene su propio modal (batch-entry-dialog.tsx);
 * CLINICAL_CONSUMPTION/RETAIL_SALE no se registran aquí (los genera el propio
 * backend desde otros flujos).
 */
export function StockAdjustmentDialog({
  open,
  onOpenChange,
  defaultProduct = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProduct?: Product | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Inventory");

  const [product, setProduct] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  const [type, setType] = useState<ManualMovementType>("ADJUSTMENT_SUB");
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchId, setBatchId] = useState(BATCH_FEFO_SENTINEL);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProduct(defaultProduct);
    setProductSearch("");
    setType("ADJUSTMENT_SUB");
    setBatchId(BATCH_FEFO_SENTINEL);
    setQuantity("");
    setNotes("");
    setErrors({});
  }, [open, defaultProduct]);

  useEffect(() => {
    if (!open || defaultProduct || product) return;
    const timer = setTimeout(() => {
      setProductLoading(true);
      void listProducts({ search: productSearch.trim() || undefined, isActive: true, pageSize: 12 })
        .then((result) => setProductResults(result.data))
        .catch(() => setProductResults([]))
        .finally(() => setProductLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, defaultProduct, product, productSearch]);

  useEffect(() => {
    if (!product) {
      setBatches([]);
      return;
    }
    setBatchesLoading(true);
    void listBatches({ productId: product.id, pageSize: 48 })
      .then((result) => setBatches(result.data))
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false));
  }, [product]);

  const isAddition = type === "ADJUSTMENT_ADD";

  async function save() {
    const fieldErrors: Record<string, string> = {};
    if (!product) fieldErrors.product = t("stockAdjustment.selectProductFirst");
    if (isAddition && batchId === BATCH_FEFO_SENTINEL) {
      fieldErrors.batch = t("stockAdjustment.batchRequiredForAddition");
    }
    if (!quantity.trim() || Number(quantity) <= 0) {
      fieldErrors.quantity = t("stockAdjustment.quantityInvalid");
    }
    if (!notes.trim()) {
      fieldErrors.notes = t("stockAdjustment.notesRequired");
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    if (!product) return;

    setSaving(true);
    try {
      await createMovement({
        productId: product.id,
        batchId: batchId === BATCH_FEFO_SENTINEL ? undefined : batchId,
        type,
        quantity: Number(quantity),
        notes: notes.trim(),
      });
      toast.success(t("stockAdjustment.created"));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("stockAdjustment.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(90vh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">{t("stockAdjustment.title")}</DialogTitle>
          <DialogDescription>{t("stockAdjustment.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <Label>{t("stockAdjustment.typeLabel")}</Label>
            <Select
              value={type}
              onValueChange={(value) => {
                setType((value as ManualMovementType | null) ?? "ADJUSTMENT_SUB");
                setBatchId(BATCH_FEFO_SENTINEL);
              }}
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue>
                  {(value: ManualMovementType | null) => STOCK_MOVEMENT_TYPE_LABELS[value ?? "ADJUSTMENT_SUB"]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MANUAL_MOVEMENT_TYPES.map((movementType) => (
                  <SelectItem key={movementType} value={movementType}>
                    {STOCK_MOVEMENT_TYPE_LABELS[movementType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("stockAdjustment.productLabel")}</Label>
            {product ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {product.sku} · {product.totalStock} {product.unitOfMeasure}
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
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("batchEntry.noProducts")}</p>
                ) : (
                  <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {productResults.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => setProduct(candidate)}
                          className="flex w-full flex-col p-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <span className="truncate font-medium text-foreground">{candidate.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{candidate.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {errors.product && <p className="mt-1 text-xs text-destructive">{errors.product}</p>}
          </div>

          {product && (
            <div>
              <Label htmlFor="adjustment-batch">
                {t("stockAdjustment.batchLabel")}
                {!isAddition && ` (${t("stockAdjustment.batchOptional")})`}
              </Label>
              <Select value={batchId} onValueChange={(value) => setBatchId(value ?? BATCH_FEFO_SENTINEL)} disabled={batchesLoading}>
                <SelectTrigger id="adjustment-batch" className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      !value || value === BATCH_FEFO_SENTINEL
                        ? t("consumption.batchFefo")
                        : (batches.find((batch) => batch.id === value)?.lotNumber ?? "")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {!isAddition && <SelectItem value={BATCH_FEFO_SENTINEL}>{t("consumption.batchFefo")}</SelectItem>}
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.lotNumber} ({batch.currentQuantity} {product.unitOfMeasure})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.batch && <p className="mt-1 text-xs text-destructive">{errors.batch}</p>}
            </div>
          )}

          <div>
            <Label htmlFor="adjustment-quantity">
              {t("stockAdjustment.quantityLabel")}
              {product ? ` (${product.unitOfMeasure})` : ""}
            </Label>
            <Input
              id="adjustment-quantity"
              type="number"
              min={0}
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-1.5"
            />
            {errors.quantity && <p className="mt-1 text-xs text-destructive">{errors.quantity}</p>}
          </div>

          <div>
            <Label htmlFor="adjustment-notes">{t("stockAdjustment.notesLabel")}</Label>
            <Textarea
              id="adjustment-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("stockAdjustment.notesPlaceholder")}
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
            {t("stockAdjustment.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
