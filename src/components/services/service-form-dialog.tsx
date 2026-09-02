"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useForm, useFieldArray, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FolderOpen, ImagePlus, Loader2, Plus, Search, Trash2, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { MinutesTimePicker } from "@/components/ui/minutes-time-picker";
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
import { MediaPickerDialog } from "@/components/media/media-picker-dialog";
import { getApiErrorMessage } from "@/lib/api";
import { createCategory, createService, updateService } from "@/lib/services/api";
import { uploadMedia } from "@/lib/media/api";
import { bulkSyncServiceMatrix } from "@/lib/staff/api";
import type { MediaAsset, MediaKind } from "@/lib/validators/media";
import {
  COMMISSION_TYPE_LABELS,
  COMMISSION_TYPES,
  type CommissionType,
  type StaffMember,
} from "@/lib/validators/staff";
import {
  COMMON_CONTRAINDICATIONS,
  EMPTY_SERVICE_FORM,
  EMPTY_SERVICE_PACKAGE,
  MAX_CONTRAINDICATIONS,
  MAX_CONTRAINDICATION_LENGTH,
  MAX_GALLERY_IMAGES,
  MAX_GALLERY_VIDEO_UPLOAD_MB,
  MAX_IMAGE_UPLOAD_MB,
  MAX_SESSIONS,
  SERVICE_PAYMENT_METHODS,
  serviceSchema,
  toServiceForm,
  toServicePayload,
  type Service,
  type ServiceCategory,
  type ServiceFormInput,
  type ServicePaymentMethod,
} from "@/lib/validators/service";
import { cn } from "@/lib/utils";

export type TabKey = "identity" | "pricing" | "evaluation" | "timing" | "payment" | "staffAssigned";

const TAB_ORDER: TabKey[] = [
  "identity",
  "pricing",
  "evaluation",
  "timing",
  "payment",
  "staffAssigned",
];

/** Sentinel Select item that switches Tab 1 into "crear categoría on-the-fly"
 *  mode (spec: "+ Crear nueva categoría"). Never a real categoryId, so it
 *  can't collide with a UUID. */
const NEW_CATEGORY_SENTINEL = "__new_category__";

/** Sentinel for Tab 6's "todas las especialidades" filter option — same
 *  never-collides-with-a-UUID convention as NEW_CATEGORY_SENTINEL. */
const ALL_SPECIALTIES_SENTINEL = "__all_specialties__";

/** Kinds ImagePicker accepts per field (spec §2): imagen principal is
 *  IMAGE-only, la galería de testimonios admite IMAGE + VIDEO. */
const MAIN_IMAGE_KINDS: MediaKind[] = ["IMAGE"];
const GALLERY_KINDS: MediaKind[] = ["IMAGE", "VIDEO"];

/** Same palette CategoryManagerDialog offers — a category created inline
 *  here should look the same as one created from its own dialog. */
const CATEGORY_COLOR_PRESETS = [
  "#E11D48",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#7C3AED",
  "#EC4899",
  "#64748B",
];

/** Fields validated (via `trigger`) before "Siguiente" is allowed to advance
 *  past that step — same grouping as FIELD_TAB below, kept separate because
 *  this one is keyed by tab instead of by field. */
const TAB_FIELDS: Record<TabKey, (keyof ServiceFormInput)[]> = {
  identity: [
    "name",
    "categoryId",
    "newCategory",
    "newCategoryName",
    "commercialDescription",
    "mainImageUrl",
    "testimonioGallery",
  ],
  pricing: ["structureType", "singlePrice", "packages", "baseCommissionType", "baseCommissionValue"],
  evaluation: [
    "requiresEvaluation",
    "evaluationServiceId",
    "evaluationCost",
    "isEvaluationDeductible",
    "deductibleExpirationDays",
  ],
  timing: ["durationMinutes", "bufferMinutes", "contraindications", "prePostCare"],
  payment: ["paymentMethods", "depositAmount", "depositIsPercentage"],
  // No campos del form RHF — la asignación de personal vive en su propio
  // Set local (ver assignedStaffIds) y se sincroniza aparte al guardar.
  staffAssigned: [],
};

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
  newCategory: "identity",
  newCategoryName: "identity",
  newCategoryColor: "identity",
  commercialDescription: "identity",
  mainImageUrl: "identity",
  testimonioGallery: "identity",
  structureType: "pricing",
  singlePrice: "pricing",
  packages: "pricing",
  baseCommissionType: "pricing",
  baseCommissionValue: "pricing",
  requiresEvaluation: "evaluation",
  evaluationServiceId: "evaluation",
  evaluationCost: "evaluation",
  isEvaluationDeductible: "evaluation",
  deductibleExpirationDays: "evaluation",
  durationMinutes: "timing",
  bufferMinutes: "timing",
  contraindications: "timing",
  prePostCare: "timing",
  paymentMethods: "payment",
  depositAmount: "payment",
  depositIsPercentage: "payment",
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  categories,
  services,
  staff,
  initialTab,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  service: Service | null;
  categories: ServiceCategory[];
  /** Candidates for the valoración selector. */
  services: Service[];
  /** Professionals offered on the "Personal Asignado" tab (Engine de
   *  Disponibilidad) — active ones only, same convention as the valoración
   *  candidates above. */
  staff: StaffMember[];
  /** Which tab to land on when the dialog opens — defaults to "identity".
   *  Lets ServiceCard's "Personal Asignado" menu item jump straight there
   *  instead of making the user click through the whole wizard. */
  initialTab?: TabKey;
  onSaved: () => void;
}) {
  const t = useTranslations("Services");
  const [tab, setTab] = useState<TabKey>("identity");
  const [submitting, setSubmitting] = useState(false);
  /** "Personal Asignado" (spec: asignación bidireccional Servicio -> Doctores)
   *  — lives outside the RHF form because it doesn't round-trip through
   *  toServicePayload: it's synced via its own call to bulkSyncServiceMatrix
   *  once the service itself has an id (see onSubmit below). */
  const [assignedStaffIds, setAssignedStaffIds] = useState<Set<string>>(new Set());
  const [staffSearch, setStaffSearch] = useState("");
  const [staffSpecialtyFilter, setStaffSpecialtyFilter] = useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceSchema) as Resolver<ServiceFormInput>,
    defaultValues: EMPTY_SERVICE_FORM,
  });

  /** Dynamic "un mismo servicio puede vender varios paquetes" list (spec
   *  ampliación). useFieldArray, not the manual watch/setValue TagPicker
   *  pattern used elsewhere in this file, because each row here has THREE
   *  independent sub-fields — a plain array replace on every keystroke would
   *  fight the inputs' focus. */
  const {
    fields: packageFields,
    append: appendPackage,
    remove: removePackage,
  } = useFieldArray({ control, name: "packages" });

  const structureType = watch("structureType");
  const requiresEvaluation = watch("requiresEvaluation");
  const evaluationServiceId = watch("evaluationServiceId");
  const isDeductible = watch("isEvaluationDeductible");
  const depositIsPercentage = watch("depositIsPercentage");
  const baseCommissionType = watch("baseCommissionType");
  const mainImageUrl = watch("mainImageUrl");
  const gallery = watch("testimonioGallery") ?? [];
  const contraindications = watch("contraindications") ?? [];
  const newCategory = watch("newCategory");
  const newCategoryColor = watch("newCategoryColor");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "identity");
    setAssignedStaffIds(new Set(service?.assignedStaffIds ?? []));
    setStaffSearch("");
    setStaffSpecialtyFilter("");
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
  }, [open, service, categories, initialTab, reset]);

  /** Distinct especialidades among `staff`, for Tab 6's filter dropdown —
   *  derived rather than fetched separately since `staff` already carries
   *  each member's especialidad. */
  const staffSpecialtyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const member of staff) {
      if (member.specialty) seen.set(member.specialty.id, member.specialty.name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesSearch =
        !query || `${member.firstName} ${member.lastName}`.toLowerCase().includes(query);
      const matchesSpecialty =
        !staffSpecialtyFilter || member.specialty?.id === staffSpecialtyFilter;
      return matchesSearch && matchesSpecialty;
    });
  }, [staff, staffSearch, staffSpecialtyFilter]);

  const onSubmit = useCallback(
    async (values: ServiceFormInput) => {
      setSubmitting(true);
      try {
        // "+ Crear nueva categoría" (spec §3): the category has to exist
        // before the service can point at it, so it's created first and its
        // id substituted in — toServicePayload never talks to the API itself.
        let categoryId = values.categoryId;
        if (values.newCategory) {
          const created = await createCategory({
            name: values.newCategoryName!.trim(),
            color: values.newCategoryColor || undefined,
          });
          categoryId = created.id;
        }

        const payload = toServicePayload({ ...values, categoryId });
        const saved = service
          ? await updateService(service.id, payload)
          : await createService(payload);
        toast.success(service ? t("form.updated") : t("form.created"));

        // "Al guardar el servicio, sincroniza automáticamente los registros
        // en StaffService" (spec) — scoped to this one service (`serviceIds:
        // [saved.id]`) so the rest of the tenant's matrix is untouched.
        await bulkSyncServiceMatrix(
          [saved.id],
          [...assignedStaffIds].map((staffMemberId) => ({ staffMemberId, serviceId: saved.id })),
        );

        onOpenChange(false);
        // Refreshes both services AND categories (useServicesCatalog.refresh),
        // so a category created here shows up in the filter immediately.
        onSaved();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("form.saveFailed")));
      } finally {
        setSubmitting(false);
      }
    },
    [service, assignedStaffIds, onOpenChange, onSaved, t],
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

  /** "Siguiente" (spec §2): validates only the current step's fields before
   *  advancing, so a stray typo on Tab 4 can't silently block Tab 1. */
  const goNext = useCallback(async () => {
    const valid = await trigger(TAB_FIELDS[tab]);
    if (!valid) return;
    const index = TAB_ORDER.indexOf(tab);
    if (index < TAB_ORDER.length - 1) setTab(TAB_ORDER[index + 1]);
  }, [tab, trigger]);

  const goPrev = useCallback(() => {
    const index = TAB_ORDER.indexOf(tab);
    if (index > 0) setTab(TAB_ORDER[index - 1]);
  }, [tab]);

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
                  {!newCategory ? (
                    <Controller
                      control={control}
                      name="categoryId"
                      render={({ field }) => (
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) => {
                            if (value === NEW_CATEGORY_SENTINEL) {
                              setValue("newCategory", true);
                              field.onChange("");
                              return;
                            }
                            field.onChange(value ?? "");
                          }}
                        >
                          <SelectTrigger id="service-category" className="mt-1.5 w-full">
                            {/* Base UI's Select.Value falls back to the raw
                                value (the category id) unless it is told how
                                to resolve a label itself. */}
                            <SelectValue placeholder={t("form.categoryPlaceholder")}>
                              {(value: string | null) =>
                                categories.find((category) => category.id === value)?.name ??
                                t("form.categoryPlaceholder")
                              }
                            </SelectValue>
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
                            <SelectItem value={NEW_CATEGORY_SENTINEL}>
                              <span className="flex items-center gap-2 font-medium text-primary">
                                <Plus className="size-3.5" />
                                {t("form.category.createNew")}
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <div className="mt-1.5 space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-primary">
                          {t("form.category.creatingNew")}
                        </p>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline hover:text-foreground"
                          onClick={() => {
                            setValue("newCategory", false);
                            setValue("newCategoryName", "");
                            setValue("newCategoryColor", "");
                          }}
                        >
                          {t("form.category.cancelNew")}
                        </button>
                      </div>
                      <div>
                        <Label htmlFor="new-category-name">
                          {t("form.category.newNameLabel")}
                        </Label>
                        <Input
                          id="new-category-name"
                          {...register("newCategoryName")}
                          placeholder={t("form.category.newNamePlaceholder")}
                          className="mt-1.5"
                          autoFocus
                        />
                        <FieldError message={errors.newCategoryName?.message} />
                      </div>
                      <div>
                        <Label>{t("form.category.newColorLabel")}</Label>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {CATEGORY_COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setValue("newCategoryColor", color)}
                              aria-label={color}
                              className={cn(
                                "size-6 rounded-full border-2 transition-transform",
                                (newCategoryColor || "").toUpperCase() === color.toUpperCase()
                                  ? "scale-110 border-foreground"
                                  : "border-transparent hover:scale-105",
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <FieldError message={errors.categoryId?.message} />
                  {categories.length === 0 && !newCategory && (
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
                    allowedKinds={MAIN_IMAGE_KINDS}
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
                    allowedKinds={GALLERY_KINDS}
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
                          onClick={() => {
                            field.onChange(option);
                            // Selecting SESSIONS with nothing configured yet
                            // starts the user with one row to fill instead of
                            // an empty list plus a button.
                            if (option === "SESSIONS" && packageFields.length === 0) {
                              appendPackage({ ...EMPTY_SERVICE_PACKAGE });
                            }
                          }}
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
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    {...register("singlePrice")}
                    placeholder="0.00"
                    className="mt-1.5"
                  />
                  <FieldError message={errors.singlePrice?.message} />
                </div>

                {structureType === "SESSIONS" && (
                  <div className="space-y-3">
                    {packageFields.map((packageField, index) => (
                      <div
                        key={packageField.id}
                        className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 rounded-lg border border-border bg-muted/30 p-4"
                      >
                        <div>
                          <Label htmlFor={`service-package-sessions-${index}`}>
                            {t("form.sessionCountLabel")}
                          </Label>
                          <Controller
                            control={control}
                            name={`packages.${index}.sessionCount`}
                            render={({ field }) => (
                              <Input
                                id={`service-package-sessions-${index}`}
                                type="number"
                                min={2}
                                max={MAX_SESSIONS}
                                step={1}
                                inputMode="numeric"
                                value={field.value}
                                onChange={(event) => field.onChange(event.target.value)}
                                placeholder="6"
                                className="mt-1.5"
                              />
                            )}
                          />
                          <FieldError message={errors.packages?.[index]?.sessionCount?.message} />
                        </div>
                        <div>
                          <Label htmlFor={`service-package-frequency-${index}`}>
                            {t("form.frequencyLabel")}
                          </Label>
                          <Controller
                            control={control}
                            name={`packages.${index}.frequencyDays`}
                            render={({ field }) => (
                              <Input
                                id={`service-package-frequency-${index}`}
                                type="number"
                                min={0}
                                max={365}
                                step={1}
                                inputMode="numeric"
                                value={field.value}
                                onChange={(event) => field.onChange(event.target.value)}
                                placeholder="30"
                                className="mt-1.5"
                              />
                            )}
                          />
                          <FieldError message={errors.packages?.[index]?.frequencyDays?.message} />
                        </div>
                        <div>
                          <Label htmlFor={`service-package-price-${index}`}>
                            {t("form.packagePriceLabel")}
                          </Label>
                          <Controller
                            control={control}
                            name={`packages.${index}.price`}
                            render={({ field }) => (
                              <Input
                                id={`service-package-price-${index}`}
                                // type="number" ya impide letras a nivel de
                                // navegador; el esquema Zod sigue siendo la
                                // validación real al enviar.
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                value={field.value}
                                onChange={(event) => field.onChange(event.target.value)}
                                placeholder="0.00"
                                className="mt-1.5"
                              />
                            )}
                          />
                          <FieldError message={errors.packages?.[index]?.price?.message} />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePackage(index)}
                          aria-label={t("form.removePackage")}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendPackage({ ...EMPTY_SERVICE_PACKAGE })}
                    >
                      <Plus className="mr-1.5 size-4" />
                      {t("form.addPackage")}
                    </Button>

                    <p className="text-xs text-muted-foreground">{t("form.frequencyHelp")}</p>
                    {typeof errors.packages?.message === "string" && (
                      <FieldError message={errors.packages.message} />
                    )}
                  </div>
                )}

                {/* Comisión Base del Servicio (nivel 2 de 3 del Esquema de
                    Comisiones Jerárquico) — vive en este tab, no en Cobranza,
                    porque es un dato de fijación de precios del servicio. */}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2.5">
                    <Switch
                      id="service-base-commission-enabled"
                      checked={!!baseCommissionType}
                      onCheckedChange={(enabled) => {
                        if (enabled) {
                          setValue("baseCommissionType", "PERCENTAGE");
                        } else {
                          setValue("baseCommissionType", "");
                          setValue("baseCommissionValue", "");
                        }
                      }}
                    />
                    <Label htmlFor="service-base-commission-enabled" className="cursor-pointer">
                      {t("form.baseCommissionEnableLabel")}
                    </Label>
                  </div>
                  <p className="mt-0.5 pl-[calc(2.25rem)] text-xs text-muted-foreground">
                    {t("form.baseCommissionHelp")}
                  </p>

                  {baseCommissionType && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/70 pt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("form.commissionTypeLabel")}
                        </Label>
                        <Controller
                          control={control}
                          name="baseCommissionType"
                          render={({ field }) => (
                            <Select
                              value={field.value || "PERCENTAGE"}
                              onValueChange={(value) =>
                                field.onChange((value as CommissionType) || "PERCENTAGE")
                              }
                            >
                              <SelectTrigger className="mt-1 w-32">
                                <SelectValue>
                                  {(value: string | null) =>
                                    COMMISSION_TYPE_LABELS[(value as CommissionType) ?? "PERCENTAGE"]
                                  }
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {COMMISSION_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {COMMISSION_TYPE_LABELS[type]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("form.commissionValueLabel")}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          {...register("baseCommissionValue")}
                          placeholder={baseCommissionType === "PERCENTAGE" ? "10" : "0.00"}
                          className="mt-1 w-24"
                        />
                      </div>
                    </div>
                  )}
                  <FieldError message={errors.baseCommissionValue?.message} />
                </div>
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
                            onValueChange={(value) => {
                              field.onChange(value ?? "");
                              // Auto-fill (spec §5): the valoración usually
                              // costs what that consult service is priced at
                              // — the user can still overwrite it afterwards.
                              const picked = evaluationCandidates.find(
                                (candidate) => candidate.id === value,
                              );
                              if (picked) setValue("evaluationCost", picked.singlePrice);
                            }}
                          >
                            <SelectTrigger id="service-evaluation" className="mt-1.5 w-full">
                              <SelectValue placeholder={t("form.evaluationServicePlaceholder")}>
                                {(value: string | null) =>
                                  evaluationCandidates.find((candidate) => candidate.id === value)
                                    ?.name ?? t("form.evaluationServicePlaceholder")
                                }
                              </SelectValue>
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
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        {...register("evaluationCost")}
                        // Bloqueado en cuanto hay un servicio de valoración
                        // seleccionado (spec §2): el precio viene de ahí, no
                        // se edita a mano por separado.
                        readOnly={!!evaluationServiceId}
                        aria-readonly={!!evaluationServiceId}
                        className={cn("mt-1.5", evaluationServiceId && "bg-muted text-muted-foreground")}
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {evaluationServiceId
                          ? t("form.evaluationCostLocked")
                          : t("form.evaluationCostHelp")}
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
                          type="number"
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
                    <Controller
                      control={control}
                      name="durationMinutes"
                      render={({ field }) => (
                        <MinutesTimePicker
                          id="service-duration"
                          value={field.value}
                          onChange={field.onChange}
                          className="mt-1.5"
                        />
                      )}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("form.durationHelp")}
                    </p>
                    <FieldError message={errors.durationMinutes?.message} />
                  </div>
                  <div>
                    <Label htmlFor="service-buffer">{t("form.bufferLabel")}</Label>
                    <Controller
                      control={control}
                      name="bufferMinutes"
                      render={({ field }) => (
                        <MinutesTimePicker
                          id="service-buffer"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          className="mt-1.5"
                        />
                      )}
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
                <div>
                  <Label>{t("form.paymentMethodsLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.paymentMethodsHelp")}
                  </p>
                  <Controller
                    control={control}
                    name="paymentMethods"
                    render={({ field }) => {
                      const selected: ServicePaymentMethod[] = field.value ?? [];
                      const toggle = (method: ServicePaymentMethod) => {
                        field.onChange(
                          selected.includes(method)
                            ? selected.filter((item) => item !== method)
                            : [...selected, method],
                        );
                      };
                      return (
                        <div className="mt-2 space-y-2">
                          {SERVICE_PAYMENT_METHODS.map((method) => {
                            const checked = selected.includes(method);
                            return (
                              <Fragment key={method}>
                                <label
                                  className={cn(
                                    "flex cursor-pointer items-start gap-2.5 rounded-lg border p-4 transition-colors",
                                    checked
                                      ? "border-primary bg-primary/5"
                                      : "border-border hover:bg-muted/50",
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggle(method)}
                                    className="mt-0.5"
                                  />
                                  <span>
                                    <span className="block text-sm font-medium text-foreground">
                                      {t(`form.payment.${method}`)}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {t(`form.paymentHelp.${method}`)}
                                    </span>
                                  </span>
                                </label>

                                {method === "DEPOSIT" && checked && (
                                  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                                    <Controller
                                      control={control}
                                      name="depositIsPercentage"
                                      render={({ field: depositField }) => (
                                        <div className="flex items-center gap-2.5">
                                          <Switch
                                            id="deposit-percentage"
                                            checked={depositField.value}
                                            onCheckedChange={depositField.onChange}
                                          />
                                          <Label htmlFor="deposit-percentage" className="cursor-pointer">
                                            {depositField.value
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
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max={depositIsPercentage ? 100 : undefined}
                                        inputMode="decimal"
                                        {...register("depositAmount")}
                                        placeholder={depositIsPercentage ? "30" : "0.00"}
                                        className="mt-1.5"
                                      />
                                      <FieldError message={errors.depositAmount?.message} />
                                    </div>
                                  </div>
                                )}
                              </Fragment>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  <FieldError message={errors.paymentMethods?.message} />
                </div>

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

              {/* ---------------- Tab 6: Personal Asignado --------------------- */}
              <TabsContent value="staffAssigned" className="mt-0 space-y-4">
                <div>
                  <Label>{t("form.staffAssignedLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("form.staffAssignedHelp")}
                  </p>
                </div>

                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("form.noStaffAvailable")}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <div className="relative min-w-48 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={staffSearch}
                          onChange={(event) => setStaffSearch(event.target.value)}
                          placeholder={t("form.staffSearchPlaceholder")}
                          className="pl-9"
                        />
                      </div>
                      <Select
                        value={staffSpecialtyFilter || ALL_SPECIALTIES_SENTINEL}
                        onValueChange={(value) =>
                          setStaffSpecialtyFilter(
                            !value || value === ALL_SPECIALTIES_SENTINEL ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder={t("form.staffAllSpecialties")}>
                            {(value: string | null) =>
                              !value || value === ALL_SPECIALTIES_SENTINEL
                                ? t("form.staffAllSpecialties")
                                : (staffSpecialtyOptions.find((s) => s.id === value)?.name ??
                                  t("form.staffAllSpecialties"))
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_SPECIALTIES_SENTINEL}>
                            {t("form.staffAllSpecialties")}
                          </SelectItem>
                          {staffSpecialtyOptions.map((specialty) => (
                            <SelectItem key={specialty.id} value={specialty.id}>
                              {specialty.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {filteredStaff.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("form.staffNoMatch")}</p>
                    ) : (
                      <div className="space-y-2">
                        {filteredStaff.map((member) => {
                          const checked = assignedStaffIds.has(member.id);
                          return (
                            <label
                              key={member.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors",
                                checked
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:bg-muted/50",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  setAssignedStaffIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(member.id)) next.delete(member.id);
                                    else next.add(member.id);
                                    return next;
                                  })
                                }
                              />
                              <Avatar size="sm">
                                {member.avatarUrl ? (
                                  <AvatarImage src={member.avatarUrl} alt="" />
                                ) : null}
                                <AvatarFallback>
                                  {member.firstName[0]?.toUpperCase()}
                                  {member.lastName[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-sm font-medium text-foreground">
                                {member.firstName} {member.lastName}
                              </span>
                              {member.specialty && (
                                <span className="text-xs text-muted-foreground">
                                  {member.specialty.name}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            {tab !== TAB_ORDER[0] && (
              <Button type="button" variant="outline" onClick={goPrev}>
                {t("form.previous")}
              </Button>
            )}
            {tab !== TAB_ORDER[TAB_ORDER.length - 1] ? (
              <Button type="button" onClick={() => void goNext()}>
                {t("form.next")}
              </Button>
            ) : (
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {service ? t("common.saveChanges") : t("form.createButton")}
              </Button>
            )}
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

/** "https://.../uploads/media/…/xyz.mp4" -> true. Gallery URLs are opaque
 *  strings once stored on the form — the backend always appends the real
 *  extension (media.service.ts's MEDIA_TYPE_RULES), so the extension is a
 *  reliable enough signal to pick a <video> vs <Image> thumbnail without
 *  threading MediaKind through the whole form. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?.*)?$/i.test(url);
}

/**
 * Uploads on pick (via the media library's own POST /media, so a direct
 * upload here also lands in "Medios" for reuse elsewhere) and stores the
 * returned URLs; a second entry point opens MediaPickerDialog to reuse an
 * asset already in the library instead of uploading a duplicate. A failed
 * upload is reported while the user is still looking at the picker, instead
 * of sinking the whole save.
 */
function ImagePicker({
  value,
  max,
  onChange,
  label,
  allowedKinds,
}: {
  value: string[];
  max: number;
  onChange: (urls: string[]) => void;
  label: string;
  /** IMAGE-only for the imagen principal, IMAGE + VIDEO for la galería de
   *  testimonios (spec §2.A/§2.B) — drives both the file-input `accept` and
   *  the Medios picker's filter. */
  allowedKinds: MediaKind[];
}) {
  const t = useTranslations("Services");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const allowsVideo = allowedKinds.includes("VIDEO");

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
      const uploaded: string[] = [];
      for (const file of picked) {
        const isVideo = file.type.startsWith("video/");
        const maxMb = isVideo ? MAX_GALLERY_VIDEO_UPLOAD_MB : MAX_IMAGE_UPLOAD_MB;
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(t("form.fileTooLarge", { name: file.name, max: maxMb }));
          continue;
        }
        const asset = await uploadMedia(file);
        uploaded.push(asset.url);
      }
      if (uploaded.length > 0) onChange([...value, ...uploaded].slice(0, max));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("form.uploadFailed")));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleMediaPicked(asset: MediaAsset) {
    if (value.length >= max) {
      toast.error(t("form.galleryFull", { max }));
      return;
    }
    onChange([...value, asset.url].slice(0, max));
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-lg border border-border">
            {isVideoUrl(url) ? (
              <video src={url} muted playsInline className="size-full object-cover" />
            ) : (
              <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized />
            )}
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
      </div>

      {value.length < max && (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 size-4" />
            )}
            {label}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setPickerOpen(true)}
          >
            <FolderOpen className="mr-1.5 size-4" />
            {t("form.chooseFromMedia")}
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={
          allowsVideo
            ? "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
            : "image/png,image/jpeg,image/webp"
        }
        multiple={max > 1}
        onChange={(event) => void handleFiles(event.target.files)}
        className="hidden"
      />

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedKinds={allowedKinds}
        onSelect={handleMediaPicked}
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
