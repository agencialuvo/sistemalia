"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FolderOpen, Loader2, Palette, Plus, Trash2, Upload, User } from "lucide-react";

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
import { TimeOfDayPicker } from "@/components/ui/minutes-time-picker";
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
import { createStaffMember, createSpecialty, updateStaffMember, uploadStaffAvatar } from "@/lib/staff/api";
import type { MediaKind } from "@/lib/validators/media";
import {
  COMMISSION_TYPE_LABELS,
  COMMISSION_TYPES,
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  DEFAULT_SHIFT,
  EMPTY_STAFF_FORM,
  formatCommissionValue,
  NAME_REGEX,
  resolveCommission,
  STAFF_COLOR_PRESETS,
  staffSchema,
  toStaffForm,
  toStaffPayload,
  type BreakFieldInput,
  type CommissionType,
  type ScheduleDayInput,
  type ShiftFieldInput,
  type Specialty,
  type StaffFormInput,
  type StaffMember,
} from "@/lib/validators/staff";
import type { Service, ServiceCategory } from "@/lib/validators/service";
import { cn } from "@/lib/utils";

/** Kinds ImagePicker accepts for the avatar — imagen únicamente, mismo
 *  filtro que ServiceFormDialog's imagen principal. */
const AVATAR_MEDIA_KINDS: MediaKind[] = ["IMAGE"];

/** Bloquea cualquier tecla imprimible que no sea letra/espacio (con acentos
 *  y ñ/Ñ) — se aplica en firstName/lastName. Las teclas de control (más de
 *  un carácter en `key`: Backspace, Delete, flechas, Tab…) y los atajos con
 *  modificador (Ctrl/Cmd+C, etc.) nunca se bloquean aquí; el regex es la
 *  segunda barrera real. */
function blockNonLetterKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key.length > 1 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!NAME_REGEX.test(event.key)) {
    event.preventDefault();
  }
}

export type TabKey = "general" | "services" | "schedule";

const TAB_ORDER: TabKey[] = ["general", "services", "schedule"];

/** Sentinel Select item that switches Tab 1's specialty field into "crear
 *  especialidad on-the-fly" mode — same convention as ServiceFormDialog's
 *  NEW_CATEGORY_SENTINEL. */
const NEW_SPECIALTY_SENTINEL = "__new_specialty__";

function isPresetColor(value: string): boolean {
  return STAFF_COLOR_PRESETS.some((preset) => preset.toUpperCase() === (value || "").toUpperCase());
}

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
  initialTab,
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
  /** Lands straight on Tab 2 when opened from StaffCard's "Servicios
   *  Asignados" menu item — same idea as ServiceFormDialog's initialTab. */
  initialTab?: TabKey;
  onSaved: () => void;
}) {
  const t = useTranslations("Staff");
  const [tab, setTab] = useState<TabKey>("general");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);

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
  const defaultCommissionType = watch("defaultCommissionType");
  const defaultCommissionValue = watch("defaultCommissionValue");
  const newSpecialty = watch("newSpecialty");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "general");
    reset(staff ? toStaffForm(staff) : { ...EMPTY_STAFF_FORM });
  }, [open, staff, initialTab, reset]);

  const onSubmit = useCallback(
    async (values: StaffFormInput) => {
      setSubmitting(true);
      try {
        // "+ Crear nueva especialidad" (Tab 1): igual que ServiceFormDialog's
        // "+ Crear nueva categoría", la especialidad se crea recién al
        // guardar, no al tipear — ver el modo inline del Select más abajo.
        let specialtyId = values.specialtyId;
        if (values.newSpecialty) {
          const created = await createSpecialty({ name: values.newSpecialtyName!.trim() });
          specialtyId = created.id;
        }

        const payload = toStaffPayload({ ...values, specialtyId });
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

  /** Solo limpia el campo del formulario — toStaffPayload manda `null`
   *  explícito para un `avatarUrl` vacío (no `undefined`, que el backend
   *  interpreta como "no tocar"), así que el guardado normal del form ya
   *  persiste el borrado, sin un endpoint aparte. */
  function handleAvatarRemove() {
    setValue("avatarUrl", "");
  }

  function toggleService(serviceId: string, checked: boolean) {
    if (checked) {
      setValue("serviceAssignments", [
        ...serviceAssignments,
        {
          serviceId,
          customDurationMinutes: "",
          customBufferBeforeMin: "",
          customBufferAfterMin: "",
          hideBufferFromClient: false,
          customCommissionType: "",
          customCommissionValue: "",
        },
      ]);
    } else {
      setValue(
        "serviceAssignments",
        serviceAssignments.filter((entry) => entry.serviceId !== serviceId),
      );
    }
  }

  function updateServiceAssignment(
    serviceId: string,
    patch: Partial<StaffFormInput["serviceAssignments"][number]>,
  ) {
    setValue(
      "serviceAssignments",
      serviceAssignments.map((entry) =>
        entry.serviceId === serviceId ? { ...entry, ...patch } : entry,
      ),
    );
  }

  // --- Tab 3: horario semanal (multi-turno, multi-descanso) ------------------

  function updateDay(dayOfWeek: number, patch: Partial<ScheduleDayInput>) {
    setValue(
      "schedules",
      schedules.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
    );
  }

  /** Activar un día sin turnos arranca con uno por defecto — un switch
   *  encendido sin ningún turno no tiene sentido operativo. */
  function toggleDay(dayOfWeek: number, enabled: boolean) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    updateDay(dayOfWeek, {
      enabled,
      shifts: enabled && day.shifts.length === 0 ? [{ ...DEFAULT_SHIFT, breaks: [] }] : day.shifts,
    });
  }

  function addShift(dayOfWeek: number) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    updateDay(dayOfWeek, { shifts: [...day.shifts, { ...DEFAULT_SHIFT, breaks: [] }] });
  }

  function removeShift(dayOfWeek: number, shiftIndex: number) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    updateDay(dayOfWeek, { shifts: day.shifts.filter((_, index) => index !== shiftIndex) });
  }

  function updateShift(dayOfWeek: number, shiftIndex: number, patch: Partial<ShiftFieldInput>) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    updateDay(dayOfWeek, {
      shifts: day.shifts.map((shift, index) => (index === shiftIndex ? { ...shift, ...patch } : shift)),
    });
  }

  function addBreak(dayOfWeek: number, shiftIndex: number) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    const shift = day.shifts[shiftIndex];
    updateShift(dayOfWeek, shiftIndex, {
      breaks: [...shift.breaks, { startTime: "13:00", endTime: "14:00", label: "Almuerzo" }],
    });
  }

  function removeBreak(dayOfWeek: number, shiftIndex: number, breakIndex: number) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    const shift = day.shifts[shiftIndex];
    updateShift(dayOfWeek, shiftIndex, {
      breaks: shift.breaks.filter((_, index) => index !== breakIndex),
    });
  }

  function updateBreak(
    dayOfWeek: number,
    shiftIndex: number,
    breakIndex: number,
    patch: Partial<BreakFieldInput>,
  ) {
    const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
    const shift = day.shifts[shiftIndex];
    updateShift(dayOfWeek, shiftIndex, {
      breaks: shift.breaks.map((brk, index) => (index === breakIndex ? { ...brk, ...patch } : brk)),
    });
  }

  const servicesByCategory = categories
    .filter((category) => category.isActive)
    .map((category) => ({
      category,
      services: services.filter((service) => service.categoryId === category.id && service.isActive),
    }))
    .filter((group) => group.services.length > 0);

  type ShiftErrorEntry = {
    startTime?: { message?: string };
    endTime?: { message?: string };
    breaks?: Array<{ startTime?: { message?: string }; endTime?: { message?: string } } | undefined>;
  };
  const scheduleErrors = errors.schedules as
    | Array<{ shifts?: ShiftErrorEntry[] | { message?: string } } | undefined>
    | undefined;

  function getDayErrorMessage(dayOfWeek: number): string | undefined {
    const dayError = scheduleErrors?.[dayOfWeek];
    if (!dayError?.shifts) return undefined;
    if (!Array.isArray(dayError.shifts)) return dayError.shifts.message;
    for (const shiftError of dayError.shifts) {
      if (!shiftError) continue;
      if (shiftError.startTime?.message) return shiftError.startTime.message;
      if (shiftError.endTime?.message) return shiftError.endTime.message;
      for (const brk of shiftError.breaks ?? []) {
        if (brk?.startTime?.message) return brk.startTime.message;
        if (brk?.endTime?.message) return brk.endTime.message;
      }
    }
    return undefined;
  }

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
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAvatarPickerOpen(true)}
                    >
                      <FolderOpen className="mr-1.5 size-4" />
                      {t("form.chooseFromMedia")}
                    </Button>
                    {avatarUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAvatarRemove}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-1.5 size-4" />
                        {t("form.avatarRemove")}
                      </Button>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void handleAvatarPick(event.target.files)}
                      className="hidden"
                    />
                    <MediaPickerDialog
                      open={avatarPickerOpen}
                      onOpenChange={setAvatarPickerOpen}
                      allowedKinds={AVATAR_MEDIA_KINDS}
                      onSelect={(asset) => setValue("avatarUrl", asset.url)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-first-name">{t("form.firstNameLabel")}</Label>
                    <Input
                      id="staff-first-name"
                      {...register("firstName")}
                      onKeyDown={blockNonLetterKeys}
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
                      onKeyDown={blockNonLetterKeys}
                      placeholder={t("form.lastNamePlaceholder")}
                      className="mt-1.5"
                    />
                    <FieldError message={errors.lastName?.message} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-specialty">{t("form.specialtyLabel")}</Label>
                    {!newSpecialty ? (
                      <Controller
                        control={control}
                        name="specialtyId"
                        render={({ field }) => (
                          <Select
                            value={field.value || undefined}
                            onValueChange={(value) => {
                              if (value === NEW_SPECIALTY_SENTINEL) {
                                setValue("newSpecialty", true);
                                field.onChange("");
                                return;
                              }
                              field.onChange(value ?? "");
                            }}
                          >
                            <SelectTrigger id="staff-specialty" className="mt-1.5 w-full">
                              {/* Base UI's Select.Value falls back to the raw
                                  value (the specialty id) unless it is told
                                  how to resolve a label itself. */}
                              <SelectValue placeholder={t("form.specialtyPlaceholder")}>
                                {(value: string | null) =>
                                  specialties.find((specialty) => specialty.id === value)?.name ??
                                  t("form.specialtyPlaceholder")
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {specialties
                                .filter((specialty) => specialty.isActive)
                                .map((specialty) => (
                                  <SelectItem key={specialty.id} value={specialty.id}>
                                    {specialty.name}
                                  </SelectItem>
                                ))}
                              <SelectItem value={NEW_SPECIALTY_SENTINEL}>
                                <span className="flex items-center gap-2 font-medium text-primary">
                                  <Plus className="size-3.5" />
                                  {t("form.specialty.createNew")}
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
                            {t("form.specialty.creatingNew")}
                          </p>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                            onClick={() => {
                              setValue("newSpecialty", false);
                              setValue("newSpecialtyName", "");
                            }}
                          >
                            {t("form.specialty.cancelNew")}
                          </button>
                        </div>
                        <div>
                          <Label htmlFor="new-specialty-name">
                            {t("form.specialty.newNameLabel")}
                          </Label>
                          <Input
                            id="new-specialty-name"
                            {...register("newSpecialtyName")}
                            placeholder={t("form.specialty.newNamePlaceholder")}
                            className="mt-1.5"
                            autoFocus
                          />
                          <FieldError message={errors.newSpecialtyName?.message} />
                        </div>
                      </div>
                    )}
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
                    <Controller
                      control={control}
                      name="phone"
                      render={({ field }) => (
                        <Input
                          id="staff-phone"
                          type="tel"
                          inputMode="tel"
                          value={field.value}
                          onChange={(event) => {
                            const raw = event.target.value;
                            // Solo el número local: el backend antepone +51
                            // automáticamente (CreateStaffDto.normalizePhone),
                            // así que aquí no se fuerza ningún "+" — salvo que
                            // el usuario ya lo haya escrito (otro país, o un
                            // valor pegado en formato E.164 completo).
                            const hasPlus = raw.trim().startsWith("+");
                            const digits = raw.replace(/\D/g, "").slice(0, 15);
                            field.onChange(digits ? (hasPlus ? `+${digits}` : digits) : "");
                          }}
                          placeholder={t("form.phonePlaceholder")}
                          className="mt-1.5"
                        />
                      )}
                    />
                    <FieldError message={errors.phone?.message} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="staff-google-email">{t("form.googleEmailLabel")}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("form.googleEmailHelp")}</p>
                  <Input
                    id="staff-google-email"
                    type="email"
                    {...register("googleEmail")}
                    placeholder={t("form.googleEmailPlaceholder")}
                    className="mt-1.5"
                  />
                  <FieldError message={errors.googleEmail?.message} />
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

                    {/* El color personalizado sólo se ve aquí como swatch
                        propio cuando NO coincide con ningún preset — mismo
                        criterio que CategoryManagerDialog (Módulo 03). */}
                    {!isPresetColor(color ?? "") && color && (
                      <button
                        type="button"
                        onClick={() => customColorInputRef.current?.click()}
                        aria-label={color}
                        title={color}
                        className="size-7 scale-110 rounded-full border-2 border-foreground"
                        style={{ backgroundColor: color }}
                      />
                    )}

                    {/* Círculo "+" — abre el selector nativo oculto. */}
                    <button
                      type="button"
                      onClick={() => customColorInputRef.current?.click()}
                      aria-label={t("form.colorCustom")}
                      title={t("form.colorCustom")}
                      className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground text-muted-foreground transition-transform hover:scale-105 hover:border-foreground hover:text-foreground"
                    >
                      <Palette className="size-3.5" />
                    </button>
                    <input
                      ref={customColorInputRef}
                      type="color"
                      value={color || STAFF_COLOR_PRESETS[0]}
                      onChange={(event) => setValue("color", event.target.value)}
                      className="sr-only"
                      aria-label={t("form.colorCustom")}
                    />
                  </div>
                  <FieldError message={errors.color?.message} />
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2.5">
                    <Switch
                      id="staff-default-commission-enabled"
                      checked={!!defaultCommissionType}
                      onCheckedChange={(enabled) => {
                        if (enabled) {
                          setValue("defaultCommissionType", "PERCENTAGE");
                        } else {
                          setValue("defaultCommissionType", "");
                          setValue("defaultCommissionValue", "");
                        }
                      }}
                    />
                    <Label htmlFor="staff-default-commission-enabled" className="cursor-pointer">
                      {t("form.defaultCommissionEnableLabel")}
                    </Label>
                  </div>
                  <p className="mt-0.5 pl-[calc(2.25rem)] text-xs text-muted-foreground">
                    {t("form.defaultCommissionHelp")}
                  </p>

                  {defaultCommissionType && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/70 pt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t("form.commissionTypeLabel")}
                        </Label>
                        <Controller
                          control={control}
                          name="defaultCommissionType"
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
                          value={defaultCommissionValue ?? ""}
                          onChange={(event) => setValue("defaultCommissionValue", event.target.value)}
                          inputMode="decimal"
                          placeholder={defaultCommissionType === "PERCENTAGE" ? "10" : "0.00"}
                          className="mt-1 w-24"
                          aria-label={t("form.commissionValueLabel")}
                        />
                      </div>
                    </div>
                  )}
                  <FieldError message={errors.defaultCommissionValue?.message} />
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
                              className="rounded-lg border border-border p-3"
                            >
                              <div className="flex items-center gap-3">
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
                              </div>

                              {checked && assignment && (
                                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/70 pt-3 pl-7">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">
                                      {t("form.bufferBeforeLabel")}
                                    </Label>
                                    <Input
                                      value={assignment.customBufferBeforeMin ?? ""}
                                      onChange={(event) =>
                                        updateServiceAssignment(service.id, {
                                          customBufferBeforeMin: event.target.value,
                                        })
                                      }
                                      inputMode="numeric"
                                      placeholder="0"
                                      className="mt-1 w-20"
                                      aria-label={t("form.bufferBeforeLabel")}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">
                                      {t("form.bufferAfterLabel")}
                                    </Label>
                                    <Input
                                      value={assignment.customBufferAfterMin ?? ""}
                                      onChange={(event) =>
                                        updateServiceAssignment(service.id, {
                                          customBufferAfterMin: event.target.value,
                                        })
                                      }
                                      inputMode="numeric"
                                      placeholder={String(service.bufferMinutes)}
                                      className="mt-1 w-20"
                                      aria-label={t("form.bufferAfterLabel")}
                                    />
                                  </div>
                                  <label className="flex items-center gap-2 pb-1.5">
                                    <Switch
                                      checked={assignment.hideBufferFromClient}
                                      onCheckedChange={(value) =>
                                        updateServiceAssignment(service.id, {
                                          hideBufferFromClient: value,
                                        })
                                      }
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {t("form.hideBufferLabel")}
                                    </span>
                                  </label>
                                </div>
                              )}

                              {checked && assignment && (
                                <div className="mt-3 border-t border-border/70 pt-3 pl-7">
                                  {(() => {
                                    const isCustomized = !!assignment.customCommissionType;
                                    const inherited = resolveCommission(
                                      { type: null, value: null },
                                      {
                                        type: service.baseCommissionType ?? null,
                                        value: service.baseCommissionValue ?? null,
                                      },
                                      {
                                        type: (defaultCommissionType as CommissionType) || null,
                                        value: defaultCommissionValue || null,
                                      },
                                    );
                                    return (
                                      <>
                                        <label className="flex items-center gap-2">
                                          <Switch
                                            checked={isCustomized}
                                            onCheckedChange={(value) =>
                                              updateServiceAssignment(service.id, {
                                                customCommissionType: value ? "PERCENTAGE" : "",
                                                customCommissionValue: value ? "" : "",
                                              })
                                            }
                                          />
                                          <span className="text-xs text-muted-foreground">
                                            {t("form.customizeCommissionLabel")}
                                          </span>
                                        </label>

                                        {!isCustomized && (
                                          <p className="mt-1.5 text-xs text-muted-foreground">
                                            {inherited
                                              ? t("form.inheritedCommission", {
                                                  value: formatCommissionValue(
                                                    inherited.type,
                                                    inherited.value,
                                                  ),
                                                })
                                              : t("form.noInheritedCommission")}
                                          </p>
                                        )}

                                        {isCustomized && (
                                          <div className="mt-2 flex flex-wrap items-end gap-3">
                                            <div>
                                              <Label className="text-xs text-muted-foreground">
                                                {t("form.commissionTypeLabel")}
                                              </Label>
                                              <Select
                                                value={assignment.customCommissionType || "PERCENTAGE"}
                                                onValueChange={(value) =>
                                                  updateServiceAssignment(service.id, {
                                                    customCommissionType: (value as CommissionType) || "PERCENTAGE",
                                                  })
                                                }
                                              >
                                                <SelectTrigger className="mt-1 w-28">
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
                                            </div>
                                            <div>
                                              <Label className="text-xs text-muted-foreground">
                                                {t("form.commissionValueLabel")}
                                              </Label>
                                              <Input
                                                value={assignment.customCommissionValue ?? ""}
                                                onChange={(event) =>
                                                  updateServiceAssignment(service.id, {
                                                    customCommissionValue: event.target.value,
                                                  })
                                                }
                                                inputMode="decimal"
                                                placeholder={
                                                  assignment.customCommissionType === "PERCENTAGE"
                                                    ? "10"
                                                    : "0.00"
                                                }
                                                className="mt-1 w-24"
                                                aria-label={t("form.commissionValueLabel")}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
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

              {/* ---------------- Tab 3: Horario semanal (multi-turno) --------- */}
              <TabsContent value="schedule" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">{t("form.scheduleHelp")}</p>
                {DAY_DISPLAY_ORDER.map((dayOfWeek) => {
                  const day = schedules.find((entry) => entry.dayOfWeek === dayOfWeek)!;
                  const dayErrorMessage = getDayErrorMessage(dayOfWeek);
                  return (
                    <div
                      key={dayOfWeek}
                      className={cn(
                        "rounded-lg border border-border p-3",
                        !day.enabled && "opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <Switch
                            checked={day.enabled}
                            onCheckedChange={(checked) => toggleDay(dayOfWeek, checked)}
                            id={`staff-day-${dayOfWeek}`}
                          />
                          <Label htmlFor={`staff-day-${dayOfWeek}`} className="cursor-pointer">
                            {DAY_LABELS[dayOfWeek]}
                          </Label>
                        </div>
                        {day.enabled && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => addShift(dayOfWeek)}
                          >
                            <Plus className="mr-1 size-3.5" />
                            {t("form.addShift")}
                          </Button>
                        )}
                      </div>

                      {day.enabled && (
                        <div className="mt-3 space-y-3">
                          {day.shifts.map((shift, shiftIndex) => (
                            <div
                              key={shiftIndex}
                              className="rounded-md border border-border/70 bg-muted/30 p-2.5"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {t("form.shiftLabel", { number: shiftIndex + 1 })}
                                </span>
                                <TimeOfDayPicker
                                  value={shift.startTime}
                                  onChange={(value) =>
                                    updateShift(dayOfWeek, shiftIndex, { startTime: value })
                                  }
                                  className="w-28"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {t("form.scheduleTo")}
                                </span>
                                <TimeOfDayPicker
                                  value={shift.endTime}
                                  onChange={(value) =>
                                    updateShift(dayOfWeek, shiftIndex, { endTime: value })
                                  }
                                  className="w-28"
                                />
                                <Select
                                  value={shift.serviceId || undefined}
                                  onValueChange={(value) =>
                                    updateShift(dayOfWeek, shiftIndex, { serviceId: value ?? "" })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-48 text-xs">
                                    <SelectValue placeholder={t("form.shiftAllServices")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {services
                                      .filter((service) => service.isActive)
                                      .map((service) => (
                                        <SelectItem key={service.id} value={service.id}>
                                          {service.name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                {day.shifts.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => removeShift(dayOfWeek, shiftIndex)}
                                    aria-label={t("form.removeShift")}
                                    className="ml-auto text-destructive"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </div>

                              <div className="mt-2 space-y-1.5 pl-1">
                                {shift.breaks.map((brk, breakIndex) => (
                                  <div key={breakIndex} className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      {t("form.scheduleLunch")}
                                    </span>
                                    <TimeOfDayPicker
                                      value={brk.startTime}
                                      onChange={(value) =>
                                        updateBreak(dayOfWeek, shiftIndex, breakIndex, {
                                          startTime: value,
                                        })
                                      }
                                      className="w-28"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {t("form.scheduleTo")}
                                    </span>
                                    <TimeOfDayPicker
                                      value={brk.endTime}
                                      onChange={(value) =>
                                        updateBreak(dayOfWeek, shiftIndex, breakIndex, {
                                          endTime: value,
                                        })
                                      }
                                      className="w-28"
                                    />
                                    <Input
                                      value={brk.label ?? ""}
                                      onChange={(event) =>
                                        updateBreak(dayOfWeek, shiftIndex, breakIndex, {
                                          label: event.target.value,
                                        })
                                      }
                                      placeholder={t("form.breakLabelPlaceholder")}
                                      className="w-36"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={() => removeBreak(dayOfWeek, shiftIndex, breakIndex)}
                                      aria-label={t("form.removeBreak")}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => addBreak(dayOfWeek, shiftIndex)}
                                >
                                  <Plus className="mr-1 size-3.5" />
                                  {t("form.addBreak")}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {dayErrorMessage && (
                        <p className="mt-1.5 text-xs text-destructive">{dayErrorMessage}</p>
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

