"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
import { getApiErrorMessage } from "@/lib/api";
import { createProduct, updateProduct } from "@/lib/inventory/api";
import {
  productSchema,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  UNIT_OF_MEASURE_PRESETS,
  type Product,
  type ProductType,
} from "@/lib/validators/inventory";

const UNIT_OTHER_SENTINEL = "__other__";

const EMPTY_DRAFT = {
  name: "",
  sku: "",
  type: "CONSUMABLE" as ProductType,
  unitOfMeasure: "",
  minStock: "0",
  costPrice: "",
  salePrice: "",
};

type Draft = typeof EMPTY_DRAFT;

function draftFromProduct(product: Product): Draft {
  return {
    name: product.name,
    sku: product.sku,
    type: product.type,
    unitOfMeasure: product.unitOfMeasure,
    minStock: product.minStock,
    costPrice: product.costPrice,
    salePrice: product.salePrice ?? "",
  };
}

/**
 * Modal de alta/edición de producto (Módulo 07 Fase 2, Task 2.2). El backend
 * solo expone POST para crear y PATCH para editar — no hay endpoint de
 * borrado (un producto con lotes/movimientos no debe poder eliminarse
 * físicamente), así que este modal es la única vía de escritura del catálogo.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente en modo edición — precarga el formulario y hace PATCH. */
  product?: Product | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Inventory");

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [unitMode, setUnitMode] = useState<string>(UNIT_OF_MEASURE_PRESETS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = product ? draftFromProduct(product) : { ...EMPTY_DRAFT };
    setDraft(next);
    const presets: readonly string[] = UNIT_OF_MEASURE_PRESETS;
    setUnitMode(
      next.unitOfMeasure && !presets.includes(next.unitOfMeasure)
        ? UNIT_OTHER_SENTINEL
        : next.unitOfMeasure || UNIT_OF_MEASURE_PRESETS[0],
    );
    setErrors({});
  }, [open, product]);

  async function save() {
    const parsed = productSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "name");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: parsed.data.name,
        sku: parsed.data.sku,
        type: parsed.data.type,
        unitOfMeasure: parsed.data.unitOfMeasure,
        minStock: parsed.data.minStock === "" ? undefined : Number(parsed.data.minStock),
        costPrice: Number(parsed.data.costPrice),
        salePrice: parsed.data.salePrice === "" ? undefined : Number(parsed.data.salePrice),
      };

      if (product) {
        await updateProduct(product.id, payload);
        toast.success(t("productForm.updated"));
      } else {
        await createProduct(payload);
        toast.success(t("productForm.created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t(product ? "productForm.updateFailed" : "productForm.createFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(90vh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {product ? t("productForm.editTitle") : t("productForm.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("productForm.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <Label htmlFor="product-name">{t("productForm.nameLabel")}</Label>
            <Input
              id="product-name"
              value={draft.name}
              onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              placeholder={t("productForm.namePlaceholder")}
              className="mt-1.5"
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="product-sku">{t("productForm.skuLabel")}</Label>
              <Input
                id="product-sku"
                value={draft.sku}
                onChange={(event) => setDraft((d) => ({ ...d, sku: event.target.value }))}
                placeholder={t("productForm.skuPlaceholder")}
                className="mt-1.5"
              />
              {errors.sku && <p className="mt-1 text-xs text-destructive">{errors.sku}</p>}
            </div>
            <div>
              <Label htmlFor="product-type">{t("productForm.typeLabel")}</Label>
              <Select
                value={draft.type}
                onValueChange={(value) => setDraft((d) => ({ ...d, type: (value as ProductType | null) ?? d.type }))}
              >
                <SelectTrigger id="product-type" className="mt-1.5 w-full">
                  <SelectValue>{(value: ProductType | null) => PRODUCT_TYPE_LABELS[value ?? "CONSUMABLE"]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PRODUCT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="product-unit">{t("productForm.unitLabel")}</Label>
            <Select
              value={unitMode}
              onValueChange={(value) => {
                const next = value ?? UNIT_OF_MEASURE_PRESETS[0];
                setUnitMode(next);
                if (next !== UNIT_OTHER_SENTINEL) {
                  setDraft((d) => ({ ...d, unitOfMeasure: next }));
                }
              }}
            >
              <SelectTrigger id="product-unit" className="mt-1.5 w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value === UNIT_OTHER_SENTINEL ? t("productForm.unitOther") : (value ?? "")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UNIT_OF_MEASURE_PRESETS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
                <SelectItem value={UNIT_OTHER_SENTINEL}>{t("productForm.unitOther")}</SelectItem>
              </SelectContent>
            </Select>
            {unitMode === UNIT_OTHER_SENTINEL && (
              <Input
                value={draft.unitOfMeasure}
                onChange={(event) => setDraft((d) => ({ ...d, unitOfMeasure: event.target.value }))}
                placeholder={t("productForm.unitPlaceholder")}
                className="mt-2"
              />
            )}
            {errors.unitOfMeasure && <p className="mt-1 text-xs text-destructive">{errors.unitOfMeasure}</p>}
          </div>

          <div>
            <Label htmlFor="product-min-stock">{t("productForm.minStockLabel")}</Label>
            <Input
              id="product-min-stock"
              type="number"
              min={0}
              step="0.01"
              value={draft.minStock}
              onChange={(event) => setDraft((d) => ({ ...d, minStock: event.target.value }))}
              className="mt-1.5"
            />
            {errors.minStock && <p className="mt-1 text-xs text-destructive">{errors.minStock}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="product-cost">{t("productForm.costPriceLabel")}</Label>
              <Input
                id="product-cost"
                type="number"
                min={0}
                step="0.01"
                value={draft.costPrice}
                onChange={(event) => setDraft((d) => ({ ...d, costPrice: event.target.value }))}
                className="mt-1.5"
              />
              {errors.costPrice && <p className="mt-1 text-xs text-destructive">{errors.costPrice}</p>}
            </div>
            <div>
              <Label htmlFor="product-sale-price">{t("productForm.salePriceLabel")}</Label>
              <Input
                id="product-sale-price"
                type="number"
                min={0}
                step="0.01"
                value={draft.salePrice}
                onChange={(event) => setDraft((d) => ({ ...d, salePrice: event.target.value }))}
                placeholder={t("productForm.salePricePlaceholder")}
                className="mt-1.5"
              />
              {errors.salePrice && <p className="mt-1 text-xs text-destructive">{errors.salePrice}</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
