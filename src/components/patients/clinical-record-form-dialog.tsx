"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FaceMapping } from "@/components/patients/face-mapping";
import { getApiErrorMessage } from "@/lib/api";
import { listBatches, listProducts } from "@/lib/inventory/api";
import { createClinicalRecord, getClinicalTemplates, updateClinicalRecord } from "@/lib/patients/api";
import type {
  ClinicalFormTemplate,
  ClinicalProcedureRecord,
  ClinicalRecordInsumo,
  FaceMappingMarker,
} from "@/lib/validators/patient";
import type { InventoryBatch, Product } from "@/lib/validators/inventory";
import { INJECTABLE_CATEGORY_NAME } from "@/lib/validators/clinical-template";

const TEMPLATE_NONE_SENTINEL = "__none__";
const CONSUMPTION_SEARCH_DEBOUNCE_MS = 300;
/** Sentinel para "sin lote específico" en el Select — deja que el backend
 *  aplique FEFO (lote activo más próximo a vencer). */
const BATCH_FEFO_SENTINEL = "__fefo__";

/**
 * "Registrar Nueva Atención" (Fase 4, §4). Selecciona una ClinicalFormTemplate,
 * renderiza sus campos dinámicos (`template.fieldsSchema.fields`), añade la
 * sección fija de insumo/lote, y — solo si la plantilla es de categoría
 * "Inyectables" — el visor de Mapeo Facial.
 */
export function ClinicalRecordFormDialog({
  open,
  onOpenChange,
  patientId,
  record = null,
  appointmentId = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** Presente en modo edición — precarga el formulario y hace PATCH en vez de
   *  POST al guardar. `templateId` queda fijo: cambiar de plantilla
   *  invalidaría la forma de `formDataValues` ya guardada (spec §4). */
  record?: ClinicalProcedureRecord | null;
  /** Cita que originó este registro (Módulo 06 Fase 3, Task 3.2) — llega
   *  cuando el modal se abre desde "Registrar Atención Clínica" en el
   *  detalle de una cita COMPLETED. Solo aplica en modo creación: un
   *  registro ya guardado no cambia de cita de origen al editarse. */
  appointmentId?: string | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Patients.detail.clinicalRecords");
  const tc = useTranslations("Patients.common");

  const [templates, setTemplates] = useState<ClinicalFormTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [brand, setBrand] = useState("");
  const [lot, setLot] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [markers, setMarkers] = useState<FaceMappingMarker[]>([]);
  const [saving, setSaving] = useState(false);

  // --- Consumo de inventario (Módulo 07 Fase 3, Task 3.3) — solo en modo
  // creación: editar un registro ya guardado no vuelve a descontar stock.
  const [consumedProduct, setConsumedProduct] = useState<Product | null>(null);
  const [consumedProductSearch, setConsumedProductSearch] = useState("");
  const [consumedProductResults, setConsumedProductResults] = useState<Product[]>([]);
  const [consumedProductLoading, setConsumedProductLoading] = useState(false);
  const [consumedBatches, setConsumedBatches] = useState<InventoryBatch[]>([]);
  const [consumedBatchesLoading, setConsumedBatchesLoading] = useState(false);
  const [consumedBatchId, setConsumedBatchId] = useState(BATCH_FEFO_SENTINEL);
  const [consumedQuantity, setConsumedQuantity] = useState("");

  useEffect(() => {
    if (!open) return;
    const insumo = (record?.formDataValues._insumo as ClinicalRecordInsumo | undefined) ?? undefined;
    const answers = { ...(record?.formDataValues ?? {}) };
    delete answers._insumo;
    setTemplateId(record?.templateId ?? "");
    setFieldValues(record ? answers : {});
    setBrand(insumo?.brand ?? "");
    setLot(insumo?.lot ?? "");
    setExpirationDate(insumo?.expirationDate ?? "");
    setMarkers(record?.faceMappingData?.markers ?? []);
    setConsumedProduct(null);
    setConsumedProductSearch("");
    setConsumedBatchId(BATCH_FEFO_SENTINEL);
    setConsumedQuantity("");
    setLoadingTemplates(true);
    getClinicalTemplates({ isActive: true })
      .then(setTemplates)
      .catch((error) => toast.error(getApiErrorMessage(error, t("templatesLoadFailed"))))
      .finally(() => setLoadingTemplates(false));
  }, [open, record, t]);

  useEffect(() => {
    if (!open || record || consumedProduct) return;
    const timer = setTimeout(() => {
      setConsumedProductLoading(true);
      void listProducts({
        search: consumedProductSearch.trim() || undefined,
        type: "CONSUMABLE",
        isActive: true,
        pageSize: 12,
      })
        .then((result) => setConsumedProductResults(result.data))
        .catch(() => setConsumedProductResults([]))
        .finally(() => setConsumedProductLoading(false));
    }, CONSUMPTION_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, record, consumedProduct, consumedProductSearch]);

  useEffect(() => {
    if (!consumedProduct) {
      setConsumedBatches([]);
      return;
    }
    setConsumedBatchesLoading(true);
    void listBatches({ productId: consumedProduct.id, pageSize: 48 })
      .then((result) => setConsumedBatches(result.data))
      .catch(() => setConsumedBatches([]))
      .finally(() => setConsumedBatchesLoading(false));
  }, [consumedProduct]);

  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;
  const showFaceMapping =
    selectedTemplate?.fieldsSchema.hasFaceMapping === true ||
    selectedTemplate?.fieldsSchema.category === INJECTABLE_CATEGORY_NAME ||
    // Plantilla desactivada desde que se creó el registro (no está en la lista
    // de activas) pero ya tenía marcadores — sigue mostrando el editor para
    // no perder silenciosamente los que ya existían.
    (record?.faceMappingData?.markers.length ?? 0) > 0;

  function setFieldValue(key: string, value: unknown) {
    setFieldValues((current) => ({ ...current, [key]: value }));
  }

  const submit = useCallback(async () => {
    if (!templateId) {
      toast.error(t("templateRequired"));
      return;
    }
    if (consumedProduct && (!consumedQuantity.trim() || Number(consumedQuantity) <= 0)) {
      toast.error(t("consumption.quantityRequired"));
      return;
    }
    setSaving(true);
    try {
      const insumo =
        brand.trim() || lot.trim() || expirationDate
          ? {
              brand: brand.trim() || undefined,
              lot: lot.trim() || undefined,
              expirationDate: expirationDate || undefined,
            }
          : undefined;

      const formDataValues = { ...fieldValues, ...(insumo ? { _insumo: insumo } : {}) };
      const faceMappingData = showFaceMapping && markers.length > 0 ? { markers } : undefined;

      if (record) {
        await updateClinicalRecord(patientId, record.id, { formDataValues, faceMappingData });
        toast.success(t("updated"));
      } else {
        await createClinicalRecord(patientId, {
          templateId,
          formDataValues,
          faceMappingData,
          appointmentId: appointmentId ?? undefined,
          consumedInsumo: consumedProduct
            ? {
                productId: consumedProduct.id,
                batchId: consumedBatchId === BATCH_FEFO_SENTINEL ? undefined : consumedBatchId,
                quantity: Number(consumedQuantity),
              }
            : undefined,
        });
        toast.success(t("created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t(record ? "updateFailed" : "createFailed")));
    } finally {
      setSaving(false);
    }
  }, [
    patientId,
    record,
    appointmentId,
    templateId,
    fieldValues,
    brand,
    lot,
    expirationDate,
    showFaceMapping,
    markers,
    consumedProduct,
    consumedBatchId,
    consumedQuantity,
    onOpenChange,
    onSaved,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {record ? t("editRecordTitle") : t("newRecordTitle")}
          </DialogTitle>
          <DialogDescription>
            {record ? t("editRecordDescription") : t("newRecordDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!record && appointmentId && (
            <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
              {t("linkedToAppointment")}
            </p>
          )}

          <div>
            <Label>{t("templateLabel")}</Label>
            <Select
              value={templateId || TEMPLATE_NONE_SENTINEL}
              onValueChange={(value) => {
                const next = !value || value === TEMPLATE_NONE_SENTINEL ? "" : value;
                setTemplateId(next);
                setFieldValues({});
                setMarkers([]);
              }}
              disabled={loadingTemplates || Boolean(record)}
            >
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue>
                  {() =>
                    loadingTemplates
                      ? t("templatesLoading")
                      : (selectedTemplate?.name ?? t("templateNone"))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TEMPLATE_NONE_SENTINEL}>{t("templateNone")}</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTemplates && templates.length === 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t("noTemplates")}</p>
            )}
          </div>

          {selectedTemplate && (
            <>
              {selectedTemplate.fieldsSchema.fields.length > 0 && (
                <div className="space-y-4">
                  {selectedTemplate.fieldsSchema.fields.map((field) => (
                    <div key={field.id}>
                      {field.type === "CHECKBOX" ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                          <Label htmlFor={`field-${field.id}`} className="cursor-pointer text-sm font-normal">
                            {field.label}
                          </Label>
                          <Switch
                            id={`field-${field.id}`}
                            checked={Boolean(fieldValues[field.id])}
                            onCheckedChange={(checked) => setFieldValue(field.id, checked)}
                          />
                        </div>
                      ) : field.type === "SELECT" ? (
                        <div>
                          <Label>{field.label}</Label>
                          <Select
                            value={(fieldValues[field.id] as string | undefined) ?? ""}
                            onValueChange={(value) => setFieldValue(field.id, value ?? "")}
                          >
                            <SelectTrigger className="mt-1.5 w-full">
                              <SelectValue>{(value: string | null) => value || t("selectPlaceholder")}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options ?? []).map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : field.type === "TEXTAREA" ? (
                        <div>
                          <Label htmlFor={`field-${field.id}`}>{field.label}</Label>
                          <Textarea
                            id={`field-${field.id}`}
                            value={(fieldValues[field.id] as string | undefined) ?? ""}
                            onChange={(event) => setFieldValue(field.id, event.target.value)}
                            rows={3}
                            className="mt-1.5"
                          />
                        </div>
                      ) : (
                        <div>
                          <Label htmlFor={`field-${field.id}`}>{field.label}</Label>
                          <Input
                            id={`field-${field.id}`}
                            type={field.type === "NUMBER" ? "number" : "text"}
                            value={(fieldValues[field.id] as string | number | undefined) ?? ""}
                            onChange={(event) =>
                              setFieldValue(
                                field.id,
                                field.type === "NUMBER"
                                  ? event.target.value === ""
                                    ? ""
                                    : Number(event.target.value)
                                  : event.target.value,
                              )
                            }
                            className="mt-1.5"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("insumoTitle")}
                </h4>
                <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="insumo-brand">{t("insumoBrandLabel")}</Label>
                    <Input
                      id="insumo-brand"
                      value={brand}
                      onChange={(event) => setBrand(event.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="insumo-lot">{t("insumoLotLabel")}</Label>
                    <Input
                      id="insumo-lot"
                      value={lot}
                      onChange={(event) => setLot(event.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="insumo-expiration">{t("insumoExpirationLabel")}</Label>
                    <Input
                      id="insumo-expiration"
                      type="date"
                      value={expirationDate}
                      onChange={(event) => setExpirationDate(event.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>

              {!record && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("consumption.title")}
                  </h4>
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("consumption.description")}</p>

                    {consumedProduct ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {consumedProduct.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {consumedProduct.sku} · {t("consumption.availableStock", {
                              quantity: consumedProduct.totalStock,
                              unit: consumedProduct.unitOfMeasure,
                            })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setConsumedProduct(null);
                            setConsumedBatchId(BATCH_FEFO_SENTINEL);
                            setConsumedQuantity("");
                          }}
                          aria-label={t("consumption.clearProduct")}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={consumedProductSearch}
                            onChange={(event) => setConsumedProductSearch(event.target.value)}
                            placeholder={t("consumption.searchPlaceholder")}
                            className="pl-9"
                          />
                        </div>
                        {consumedProductLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : consumedProductResults.length > 0 ? (
                          <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                            {consumedProductResults.map((candidate) => (
                              <li key={candidate.id}>
                                <button
                                  type="button"
                                  onClick={() => setConsumedProduct(candidate)}
                                  className="flex w-full flex-col p-2 text-left text-sm transition-colors hover:bg-muted/60"
                                >
                                  <span className="truncate font-medium text-foreground">
                                    {candidate.name}
                                  </span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {candidate.sku}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="py-2 text-center text-xs text-muted-foreground">
                            {t("consumption.noProducts")}
                          </p>
                        )}
                      </div>
                    )}

                    {consumedProduct && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="consumption-batch">{t("consumption.batchLabel")}</Label>
                          <Select
                            value={consumedBatchId}
                            onValueChange={(value) => setConsumedBatchId(value ?? BATCH_FEFO_SENTINEL)}
                            disabled={consumedBatchesLoading}
                          >
                            <SelectTrigger id="consumption-batch" className="mt-1.5 w-full">
                              <SelectValue>
                                {(value: string | null) =>
                                  !value || value === BATCH_FEFO_SENTINEL
                                    ? t("consumption.batchFefo")
                                    : (consumedBatches.find((batch) => batch.id === value)?.lotNumber ?? "")
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={BATCH_FEFO_SENTINEL}>{t("consumption.batchFefo")}</SelectItem>
                              {consumedBatches.map((batch) => (
                                <SelectItem key={batch.id} value={batch.id}>
                                  {batch.lotNumber} ({batch.currentQuantity} {consumedProduct.unitOfMeasure})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="consumption-quantity">
                            {t("consumption.quantityLabel")} ({consumedProduct.unitOfMeasure})
                          </Label>
                          <Input
                            id="consumption-quantity"
                            type="number"
                            min={0}
                            step="0.01"
                            value={consumedQuantity}
                            onChange={(event) => setConsumedQuantity(event.target.value)}
                            className="mt-1.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showFaceMapping && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("faceMapping.title")}
                  </h4>
                  <FaceMapping value={markers} onChange={setMarkers} />
                </div>
              )}
            </>
          )}

          {/* Editando un registro cuya plantilla ya no está activa: sin
              selectedTemplate no hay campos/insumo que mostrar, pero el
              mapeo facial ya guardado sigue siendo editable. */}
          {!selectedTemplate && record && showFaceMapping && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("faceMapping.title")}
              </h4>
              <FaceMapping value={markers} onChange={setMarkers} />
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !templateId}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {record ? t("saveChangesButton") : t("saveRecordButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
