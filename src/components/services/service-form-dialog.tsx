"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createService, updateService, uploadServiceImage } from "@/lib/services/api";
import {
  COMMON_CONTRAINDICATIONS,
  EMPTY_SERVICE_FORM,
  MAX_CONTRAINDICATIONS,
  MAX_CONTRAINDICATION_LENGTH,
  MAX_GALLERY_IMAGES,
  SERVICE_PAYMENT_METHODS,
  serviceSchema,
  toServiceForm,
  toServicePayload,
  type Service,
  type ServiceCategory,
  type ServiceFormInput,
} from "@/lib/validators/service";
import { cn } from "@/lib/utils";

type TabKey = "identity" | "pricing" | "evaluation" | "timing" | "payment";

const TAB_ORDER: TabKey[] = ["identity", "pricing", "evaluation", "timing", "payment"];

/**
 * Which tab holds which field.
 *
 * Needed because a validation error can land on a tab the user is not looking
 * at — clicking "Guardar" on Tab 1 with a missing session count on Tab 2 would
 * otherwise do nothing at all, with no visible reason. On failure the form
 * jumps to the first offending tab.
 */
const FIELD_TAB: Record<string, TabKey> = {
  name: "identity",
  categoryId: "identity",
  commercialDescription: "identity",
  mainImageUrl: "identity",
  testimonioGallery: "identity",
  structureType: "pricing",
  sessionCount: "pricing",
  frequencyDays: "pricing",
  singlePrice: "pricing",
  packagePrice: "pricing",
  requiresEvaluation: "evaluation",
  evaluationServiceId: "evaluation",
  evaluationCost: "evaluation",
  isEvaluationDeductible: "evaluation",
  deductibleExpirationDays: "evaluation",
  durationMinutes: "timing",
  bufferMinutes: "timing",
  contraindications: "timing",
  prePostCare: "timing",
  paymentMethod: "payment",
  depositAmount: "payment",
  depositIsPercentage: "payment",
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  categories,
  services,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  service: Service | null;
  categories: ServiceCategory[];
  /** Candidates for the valoración selector. */
  services: Service[];
  onSaved: () => void;
}) {
  const t = useTranslations("Services");
  const [tab, setTab] = useState<TabKey>("identity");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceSchema) as Resolver<ServiceFormInput>,
    defaultValues: EMPTY_SERVICE_FORM,
  });

  const structureType = watch("structureType");
  const requiresEvaluation = watch("requiresEvaluation");
  const isDeductible = watch("isEvaluationDeductible");
  const paymentMethod = watch("paymentMethod");
  const depositIsPercentage = watch("depositIsPercentage");
  const mainImageUrl = watch("mainImageUrl");
  const gallery = watch("testimonioGallery") ?? [];
  const contraindications = watch("contraindications") ?? [];

  useEffect(() => {
    if (!open) return;
    setTab("identity");
    reset(
      service
        ? toServiceForm(service)
        : {
            ...EMPTY_SERVICE_FORM,
            // Pre-select when there is only one category: the field is
            // required and picking the sole option for the user removes a
            // pointless click.
            categoryId: categories.length === 1 ? categories[0].id : "",
          },
    );
  }, [open, service, categories, reset]);

  const onSubmit = useCallback(
    async (values: ServiceFormInput) => {
      setSubmitting(true);
      try {
        const payload = toServicePayload(values);
        if (service) {
          await updateService(service.id, payload);
          toast.success(t("form.updated"));
        } else {
          await createService(payload);
          toast.success(t("form.created"));
        }
        onOpenChange(false);
        onSaved();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("form.saveFailed")));
      } finally {
        setSubmitting(false);
      }
    },
    [service, onOpenChange, onSaved, t],
  );

  const onInvalid = useCallback(
    (formErrors: Record<string, unknown>) => {
      const firstField = Object.keys(formErrors)[0];
      const target = firstField ? FIELD_TAB[firstField] : undefined;
      if (target) setTab(target);
      toast.error(t("form.validationFailed"));
    },
    [t],
  );

  const evaluationCandidates = services.filter(
    (candidate) => candidate.id !== service?.id && candidate.isActive,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {service ? t("form.editTitle") : t("form.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as TabKey)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 overflow-x-auto border-b border-border/80 px-6 pt-4">
              <TabsList>
                {TAB_ORDER.map((key, index) => (
                  <TabsTrigger key={key} value={key}>
                    <span className="mr-1.5 text-xs text-muted-foreground">{index + 1}</span>
                    {t(`form.tabs.${key}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* ---------------- Tab 1: Identificación y galería ------------- */}
              <TabsContent value="identity" className="mt-0 space-y-4">
                <div>
                  <Label htmlFor="service-name">{t("form.nameLabel")}</Label>
                  <Input
                    id="service-name"
                    {...register("name")}
                    placeholder={t("form.namePlaceholder")}
                    className="mt-1.5"
                  />
                  <FieldError message={errors.name?.message} />
                </div>

                <div>
                  <Label htmlFor="service-category">{t("form.categoryLabel")}</Label>
                  <Controller
                    control={control}
                    name="categoryId"
                    render={({ field }) => (
                      <Select value={field.value || undefined} onValueChange={(value) => field.onChange(value ?? "")}>
                        <SelectTrigger id="service-category" className="mt-1.5 w-full">
                          <SelectValue placeholder={t("form.categoryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories
                            .filter((category) => category.isActive)
                            .map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="size-2.5 rounded-full"
                                    style={{ backgroundColor: category.color ?? "transparent" }}
                                  />
                                  {category.name}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={errors.categoryId?.message} />
                  {categories.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("form.noCategoriesHint")}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="service-description">{t("form.descriptionLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.descriptionHelp")}
                  </p>
                  <Textarea
                    id="service-description"
                    {...register("commercialDescription")}
                    rows={4}
                    placeholder={t("form.descriptionPlaceholder")}
                    className="mt-1.5"
                  />
                  <FieldError message={errors.commercialDescription?.message} />
                </div>

                <div>
                  <Label>{t("form.mainImageLabel")}</Label>
                  <ImagePicker
                    value={mainImageUrl ? [mainImageUrl] : []}
                    max={1}
                    onChange={(urls) => setValue("mainImageUrl", urls[0] ?? "")}
                    label={t("form.mainImageCta")}
                  />
                </div>

                <div>
                  <Label>{t("form.galleryLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.galleryHelp")}
                  </p>
                  <ImagePicker
                    value={gallery}
                    max={MAX_GALLERY_IMAGES}
                    onChange={(urls) => setValue("testimonioGallery", urls)}
                    label={t("form.galleryCta")}
                  />
                </div>
              </TabsContent>

              {/* ---------------- Tab 2: Precios y paquetes ------------------- */}
              <TabsContent value="pricing" className="mt-0 space-y-4">
                <Controller
                  control={control}
                  name="structureType"
                  render={({ field }) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["SINGLE", "SESSIONS"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => field.onChange(option)}
                          className={cn(
                            "rounded-lg border p-4 text-left transition-colors",
                            field.value === option
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <p className="text-sm font-medium text-foreground">
                            {t(`form.structure.${option}`)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t(`form.structureHelp.${option}`)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                />

                <div>
                  <Label htmlFor="service-price">
                    {structureType === "SESSIONS"
                      ? t("form.sessionPriceLabel")
                      : t("form.singlePriceLabel")}
                  </Label>
                  <Input
                    id="service-price"
                    inputMode="decimal"
                    {...register("singlePrice")}
                    placeholder="0.00"
                    className="mt-1.5"
                  />
                  <FieldError message={errors.singlePrice?.message} />
                </div>

                {structureType === "SESSIONS" && (
                  <div className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="service-sessions">{t("form.sessionCountLabel")}</Label>
                      <Input
                        id="service-sessions"
                        inputMode="numeric"
                        {...register("sessionCount")}
                        placeholder="6"
                        className="mt-1.5"
                      />
                      <FieldError message={errors.sessionCount?.message} />
                    </div>
                    <div>
                      <Label htmlFor="service-frequency">{t("form.frequencyLabel")}</Label>
                      <Input
                        id="service-frequency"
                        inputMode="numeric"
                        {...register("frequencyDays")}
                        placeholder="30"
                        className="mt-1.5"
                      />
                      <FieldError message={errors.frequencyDays?.message} />
                    </div>
                    <div>
                      <Label htmlFor="service-package">{t("form.packagePriceLabel")}</Label>
                      <Input
                        id="service-package"
                        inputMode="decimal"
                        {...register("packagePrice")}
                        placeholder="0.00"
                        className="mt-1.5"
                      />
                      <FieldError message={errors.packagePrice?.message} />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                      {t("form.frequencyHelp")}
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ---------------- Tab 3: Valoración y triaje ------------------ */}
              <TabsContent value="evaluation" className="mt-0 space-y-4">
                <Controller
                  control={control}
                  name="requiresEvaluation"
                  render={({ field }) => (
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {t("form.requiresEvaluationLabel")}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t("form.requiresEvaluationHelp")}
                        </span>
                      </span>
                    </label>
                  )}
                />

                {requiresEvaluation && (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                    <div>
                      <Label htmlFor="service-evaluation">
                        {t("form.evaluationServiceLabel")}
                      </Label>
                      <Controller
                        control={control}
                        name="evaluationServiceId"
                        render={({ field }) => (
                          <Select
                            value={field.value || undefined}
                            onValueChange={(value) => field.onChange(value ?? "")}
                          >
                            <SelectTrigger id="service-evaluation" className="mt-1.5 w-full">
                              <SelectValue placeholder={t("form.evaluationServicePlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {evaluationCandidates.map((candidate) => (
                                <SelectItem key={candidate.id} value={candidate.id}>
                                  {candidate.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError message={errors.evaluationServiceId?.message} />
                      {evaluationCandidates.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("form.noEvaluationCandidates")}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="service-evaluation-cost">
                        {t("form.evaluationCostLabel")}
                      </Label>
                      <Input
                        id="service-evaluation-cost"
                        inputMode="decimal"
                        {...register("evaluationCost")}
                        placeholder="0.00"
                        className="mt-1.5"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("form.evaluationCostHelp")}
                      </p>
                      <FieldError message={errors.evaluationCost?.message} />
                    </div>

                    <Controller
                      control={control}
                      name="isEvaluationDeductible"
                      render={({ field }) => (
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block text-sm font-medium text-foreground">
                              {t("form.deductibleLabel")}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t("form.deductibleHelp")}
                            </span>
                          </span>
                        </label>
                      )}
                    />

                    {isDeductible && (
                      <div>
                        <Label htmlFor="service-deductible-days">
                          {t("form.deductibleDaysLabel")}
                        </Label>
                        <Input
                          id="service-deductible-days"
                          inputMode="numeric"
                          {...register("deductibleExpirationDays")}
                          placeholder="30"
                          className="mt-1.5"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("form.deductibleDaysHelp")}
                        </p>
                        <FieldError message={errors.deductibleExpirationDays?.message} />
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ---------------- Tab 4: Tiempos y alertas -------------------- */}
              <TabsContent value="timing" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="service-duration">{t("form.durationLabel")}</Label>
                    <Input
                      id="service-duration"
                      inputMode="numeric"
                      {...register("durationMinutes")}
                      placeholder="45"
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("form.durationHelp")}
                    </p>
                    <FieldError message={errors.durationMinutes?.message} />
                  </div>
                  <div>
                    <Label htmlFor="service-buffer">{t("form.bufferLabel")}</Label>
                    <Input
                      id="service-buffer"
                      inputMode="numeric"
                      {...register("bufferMinutes")}
                      placeholder="10"
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{t("form.bufferHelp")}</p>
                    <FieldError message={errors.bufferMinutes?.message} />
                  </div>
                </div>

                <div>
                  <Label>{t("form.contraindicationsLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.contraindicationsHelp")}
                  </p>
                  <TagPicker
                    value={contraindications}
                    onChange={(tags) => setValue("contraindications", tags)}
                    suggestions={[...COMMON_CONTRAINDICATIONS]}
                    max={MAX_CONTRAINDICATIONS}
                    maxLength={MAX_CONTRAINDICATION_LENGTH}
                    addLabel={t("form.addTag")}
                    placeholder={t("form.tagPlaceholder")}
                  />
                  <FieldError message={errors.contraindications?.message} />
                </div>

                <div>
                  <Label htmlFor="service-care">{t("form.prePostCareLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.prePostCareHelp")}
                  </p>
                  <Textarea
                    id="service-care"
                    {...register("prePostCare")}
                    rows={4}
                    placeholder={t("form.prePostCarePlaceholder")}
                    className="mt-1.5"
                  />
                  <FieldError message={errors.prePostCare?.message} />
                </div>
              </TabsContent>

              {/* ---------------- Tab 5: Cobranza ----------------------------- */}
              <TabsContent value="payment" className="mt-0 space-y-4">
                <Controller
                  control={control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <div className="space-y-2">
                      {SERVICE_PAYMENT_METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => field.onChange(method)}
                          className={cn(
                            "w-full rounded-lg border p-4 text-left transition-colors",
                            field.value === method
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <p className="text-sm font-medium text-foreground">
                            {t(`form.payment.${method}`)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t(`form.paymentHelp.${method}`)}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                />

                {paymentMethod === "DEPOSIT" && (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                    <Controller
                      control={control}
                      name="depositIsPercentage"
                      render={({ field }) => (
                        <div className="flex items-center gap-2.5">
                          <Switch
                            id="deposit-percentage"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <Label htmlFor="deposit-percentage" className="cursor-pointer">
                            {field.value
                              ? t("form.depositAsPercentage")
                              : t("form.depositAsAmount")}
                          </Label>
                        </div>
                      )}
                    />
                    <div>
                      <Label htmlFor="service-deposit">
                        {depositIsPercentage
                          ? t("form.depositPercentageLabel")
                          : t("form.depositAmountLabel")}
                      </Label>
                      <Input
                        id="service-deposit"
                        inputMode="decimal"
                        {...register("depositAmount")}
                        placeholder={depositIsPercentage ? "30" : "0.00"}
                        className="mt-1.5"
                      />
                      <FieldError message={errors.depositAmount?.message} />
                    </div>
                  </div>
                )}

                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <div className="flex items-center gap-2.5 border-t border-border pt-4">
                      <Switch
                        id="service-active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor="service-active" className="cursor-pointer">
                        {field.value ? t("form.activeLabel") : t("form.inactiveLabel")}
                      </Label>
                    </div>
                  )}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {service ? t("common.saveChanges") : t("form.createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

/** Uploads on pick and stores the returned URLs. Same contract as the
 *  onboarding logo step: a failed upload is reported while the user is still
 *  looking at the picker, instead of sinking the whole save. */
function ImagePicker({
  value,
  max,
  onChange,
  label,
}: {
  value: string[];
  max: number;
  onChange: (urls: string[]) => void;
  label: string;
}) {
  const t = useTranslations("Services");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - value.length;
    if (room <= 0) {
      toast.error(t("form.galleryFull", { max }));
      return;
    }

    setUploading(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const urls = await Promise.all(picked.map((file) => uploadServiceImage(file)));
      onChange([...value, ...urls].slice(0, max));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("form.uploadFailed")));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-lg border border-border">
            <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== url))}
              className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={t("common.remove")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="size-5" />
                <span className="px-1 text-center text-[10px] leading-tight">{label}</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={max > 1}
        onChange={(event) => void handleFiles(event.target.files)}
        className="hidden"
      />
    </div>
  );
}

/** Chips with suggestions plus free text — the clinical vocabulary varies per
 *  centre, so a closed list would be wrong. */
function TagPicker({
  value,
  onChange,
  suggestions,
  max,
  maxLength,
  addLabel,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  max: number;
  maxLength: number;
  addLabel: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const tag = raw.trim().toUpperCase().slice(0, maxLength);
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setDraft("");
  }

  const available = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="mt-2 space-y-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="h-6 gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className="rounded-full p-0.5 hover:bg-background/60"
                aria-label={tag}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the form — inside a <form> it would save
            // the service instead of adding the tag.
            if (event.key === "Enter") {
              event.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className="h-9"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => add(draft)}>
          <Plus className="mr-1 size-3.5" />
          {addLabel}
        </Button>
      </div>

      {available.length > 0 && value.length < max && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
