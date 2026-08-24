"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { createStaffMember, updateStaffMember, uploadStaffAvatar } from "@/lib/staff/api";
import {
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  EMPTY_STAFF_FORM,
  STAFF_COLOR_PRESETS,
  staffSchema,
  toStaffForm,
  toStaffPayload,
  type ScheduleDayInput,
  type Specialty,
  type StaffFormInput,
  type StaffMember,
} from "@/lib/validators/staff";
import type { Service, ServiceCategory } from "@/lib/validators/service";
import { cn } from "@/lib/utils";

type TabKey = "general" | "services" | "schedule";

const TAB_ORDER: TabKey[] = ["general", "services", "schedule"];

/** Which tab holds which field — same reasoning as ServiceFormDialog's
 *  FIELD_TAB: a validation error on a tab the user isn't looking at must
 *  still be reachable, or "Guardar" does nothing with no visible cause. */
const FIELD_TAB: Record<string, TabKey> = {
  firstName: "general",
  lastName: "general",
  email: "general",
  phone: "general",
  medicalLicense: "general",
  specialtyId: "general",
  biography: "general",
  color: "general",
  commissionPercentage: "general",
  serviceAssignments: "services",
  schedules: "schedule",
};

export function StaffFormDialog({
  open,
  onOpenChange,
  staff,
  specialties,
  services,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  staff: StaffMember | null;
  specialties: Specialty[];
  /** Catálogo del Módulo 03, para la matriz de competencias (Tab 2). */
  services: Service[];
  categories: ServiceCategory[];
  onSaved: () => void;
}) {
  const t = useTranslations("Staff");
  const [tab, setTab] = useState<TabKey>("general");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StaffFormInput>({
    resolver: zodResolver(staffSchema) as Resolver<StaffFormInput>,
    defaultValues: EMPTY_STAFF_FORM,
  });

  const color = watch("color");
  const avatarUrl = watch("avatarUrl");
  const serviceAssignments = watch("serviceAssignments");
  const schedules = watch("schedules");
  const firstName = watch("firstName");
  const lastName = watch("lastName");

  useEffect(() => {
    if (!open) return;
    setTab("general");
    reset(staff ? toStaffForm(staff) : { ...EMPTY_STAFF_FORM });
  }, [open, staff, reset]);

  const onSubmit = useCallback(
    async (values: StaffFormInput) => {
      setSubmitting(true);
      try {
        const payload = toStaffPayload(values);
        if (staff) {
          await updateStaffMember(staff.id, payload);
          toast.success(t("form.updated"));
        } else {
          await createStaffMember(payload);
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
    [staff, onOpenChange, onSaved, t],
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

  async function handleAvatarPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadStaffAvatar(file);
      setValue("avatarUrl", url);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("form.uploadFailed")));
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  function toggleService(serviceId: string, checked: boolean) {
    if (checked) {
      setValue("serviceAssignments", [
        ...serviceAssignments,
        { serviceId, customDurationMinutes: "" },
      ]);
    } else {
      setValue(
        "serviceAssignments",
        serviceAssignments.filter((entry) => entry.serviceId !== serviceId),
      );
    }
  }

  function setCustomDuration(serviceId: string, value: string) {
    setValue(
      "serviceAssignments",
      serviceAssignments.map((entry) =>
        entry.serviceId === serviceId ? { ...entry, customDurationMinutes: value } : entry,
      ),
    );
  }

  function updateDay(dayOfWeek: number, patch: Partial<ScheduleDayInput>) {
    setValue(
      "schedules",
      schedules.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
    );
  }

  const servicesByCategory = categories
    .filter((category) => category.isActive)
    .map((category) => ({
      category,
      services: services.filter((service) => service.categoryId === category.id && service.isActive),
    }))
    .filter((group) => group.services.length > 0);

  const scheduleErrors = errors.schedules as
    | Array<{ startTime?: { message?: string }; endTime?: { message?: string }; lunchStartTime?: { message?: string }; lunchEndTime?: { message?: string } }>
    | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {staff ? t("form.editTitle") : t("form.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex min-h-0 flex-1 flex-col">
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
              {/* ---------------- Tab 1: Información general y licencia ------- */}
              <TabsContent value="general" className="mt-0 space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar size="lg" className="size-16">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                    <AvatarFallback>
                      {firstName || lastName ? (
                        `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
                      ) : (
                        <User className="size-6" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 size-4" />
                      )}
                      {t("form.avatarCta")}
                    </Button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void handleAvatarPick(event.target.files)}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-first-name">{t("form.firstNameLabel")}</Label>
                    <Input
                      id="staff-first-name"
                      {...register("firstName")}
                      placeholder={t("form.firstNamePlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.firstName?.message} />
                  </div>
                  <div>
                    <Label htmlFor="staff-last-name">{t("form.lastNameLabel")}</Label>
                    <Input
                      id="staff-last-name"
                      {...register("lastName")}
                      placeholder={t("form.lastNamePlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.lastName?.message} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-specialty">{t("form.specialtyLabel")}</Label>
                    <Controller
                      control={control}
                      name="specialtyId"
                      render={({ field }) => (
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) => field.onChange(value ?? "")}
                        >
                          <SelectTrigger id="staff-specialty" className="mt-1.5 w-full">
                            <SelectValue placeholder={t("form.specialtyPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {specialties
                              .filter((specialty) => specialty.isActive)
                              .map((specialty) => (
                                <SelectItem key={specialty.id} value={specialty.id}>
                                  {specialty.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div>
                    <Label htmlFor="staff-license">{t("form.licenseLabel")}</Label>
                    <Input
                      id="staff-license"
                      {...register("medicalLicense")}
                      placeholder={t("form.licensePlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.medicalLicense?.message} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-email">{t("form.emailLabel")}</Label>
                    <Input
                      id="staff-email"
                      type="email"
                      {...register("email")}
                      placeholder={t("form.emailPlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.email?.message} />
                  </div>
                  <div>
                    <Label htmlFor="staff-phone">{t("form.phoneLabel")}</Label>
                    <Input
                      id="staff-phone"
                      {...register("phone")}
                      placeholder={t("form.phonePlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.phone?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="staff-bio">{t("form.biographyLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("form.biographyHelp")}</p>
                  <Textarea
                    id="staff-bio"
                    {...register("biography")}
                    rows={3}
                    placeholder={t("form.biographyPlaceholder")}
                    className="mt-1.5"
                  />
                  <FieldError message={errors.biography?.message} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{t("form.colorLabel")}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("form.colorHelp")}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {STAFF_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setValue("color", preset)}
                          aria-label={preset}
                          className={cn(
                            "size-7 rounded-full border-2 transition-transform",
                            (color || "").toUpperCase() === preset.toUpperCase()
                              ? "scale-110 border-foreground"
                              : "border-transparent hover:scale-105",
                          )}
                          style={{ backgroundColor: preset }}
                        />
                      ))}
                      <input
                        type="color"
                        value={color || STAFF_COLOR_PRESETS[0]}
                        onChange={(event) => setValue("color", event.target.value)}
                        aria-label={t("form.colorCustom")}
                        className="size-7 cursor-pointer rounded-full border border-border bg-transparent p-0"
                      />
                    </div>
                    <FieldError message={errors.color?.message} />
                  </div>
                  <div>
                    <Label htmlFor="staff-commission">{t("form.commissionLabel")}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("form.commissionHelp")}
                    </p>
                    <Input
                      id="staff-commission"
                      inputMode="decimal"
                      {...register("commissionPercentage")}
                      placeholder="15.00"
                      className="mt-1.5"
                    />
                    <FieldError message={errors.commissionPercentage?.message} />
                  </div>
                </div>

                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <div className="flex items-center gap-2.5 border-t border-border pt-4">
                      <Switch
                        id="staff-active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor="staff-active" className="cursor-pointer">
                        {field.value ? t("form.activeLabel") : t("form.inactiveLabel")}
                      </Label>
                    </div>
                  )}
                />
              </TabsContent>

              {/* ---------------- Tab 2: Servicios habilitados ----------------- */}
              <TabsContent value="services" className="mt-0 space-y-5">
                {servicesByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("form.noServicesHint")}</p>
                ) : (
                  servicesByCategory.map(({ category, services: categoryServices }) => (
                    <div key={category.id}>
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category.color ?? "var(--color-muted-foreground)" }}
                        />
                        {category.name}
                      </h4>
                      <div className="space-y-2">
                        {categoryServices.map((service) => {
                          const assignment = serviceAssignments.find(
                            (entry) => entry.serviceId === service.id,
                          );
                          const checked = assignment !== undefined;
                          return (
                            <div
                              key={service.id}
                              className="flex items-center gap-3 rounded-lg border border-border p-3"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  toggleService(service.id, value === true)
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <label
                                  className="block cursor-pointer text-sm font-medium text-foreground"
                                  onClick={() => toggleService(service.id, !checked)}
                                >
                                  {service.name}
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  {t("form.defaultDuration", { minutes: service.durationMinutes })}
                                </p>
                              </div>
                              {checked && (
                                <Input
                                  value={assignment?.customDurationMinutes ?? ""}
                                  onChange={(event) =>
                                    setCustomDuration(service.id, event.target.value)
                                  }
                                  inputMode="numeric"
                                  placeholder={String(service.durationMinutes)}
                                  className="w-24"
                                  aria-label={t("form.customDurationLabel")}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
                <FieldError message={errors.serviceAssignments?.message as string | undefined} />
              </TabsContent>

              {/* ---------------- Tab 3: Horario semanal ------------------------ */}
              <TabsContent value="schedule" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{t("form.scheduleHelp")}</p>
                {DAY_DISPLAY_ORDER.map((dayOfWeek) => {
                  const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
                  const dayError = scheduleErrors?.[dayOfWeek];
                  return (
                    <div
                      key={dayOfWeek}
                      className={cn(
                        "rounded-lg border border-border p-3",
                        !day.enabled && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Switch
                          checked={day.enabled}
                          onCheckedChange={(checked) => updateDay(dayOfWeek, { enabled: checked })}
                          id={`staff-day-${dayOfWeek}`}
                        />
                        <Label htmlFor={`staff-day-${dayOfWeek}`} className="w-24 cursor-pointer">
                          {DAY_LABELS[dayOfWeek]}
                        </Label>

                        {day.enabled && (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              value={day.startTime}
                              onChange={(event) =>
                                updateDay(dayOfWeek, { startTime: event.target.value })
                              }
                              className="w-28"
                            />
                            <span className="text-xs text-muted-foreground">
                              {t("form.scheduleTo")}
                            </span>
                            <Input
                              type="time"
                              value={day.endTime}
                              onChange={(event) =>
                                updateDay(dayOfWeek, { endTime: event.target.value })
                              }
                              className="w-28"
                            />
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t("form.scheduleLunch")}
                            </span>
                            <Input
                              type="time"
                              value={day.lunchStartTime}
                              onChange={(event) =>
                                updateDay(dayOfWeek, { lunchStartTime: event.target.value })
                              }
                              className="w-28"
                            />
                            <span className="text-xs text-muted-foreground">
                              {t("form.scheduleTo")}
                            </span>
                            <Input
                              type="time"
                              value={day.lunchEndTime}
                              onChange={(event) =>
                                updateDay(dayOfWeek, { lunchEndTime: event.target.value })
                              }
                              className="w-28"
                            />
                          </div>
                        )}
                      </div>
                      {dayError && (
                        <p className="mt-1.5 pl-[6.5rem] text-xs text-destructive">
                          {dayError.startTime?.message ||
                            dayError.endTime?.message ||
                            dayError.lunchStartTime?.message ||
                            dayError.lunchEndTime?.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {staff ? t("common.saveChanges") : t("form.createButton")}
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
