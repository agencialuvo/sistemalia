"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FolderOpen, Loader2, Plus, Trash2, Upload, User, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { MediaPickerDialog } from "@/components/media/media-picker-dialog";
import { getApiErrorMessage } from "@/lib/api";
import { createPatient, updatePatient, uploadPatientAvatar } from "@/lib/patients/api";
import type { MediaKind } from "@/lib/validators/media";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  EMPTY_PATIENT_FORM,
  GENDER_LABELS,
  GENDERS,
  NAME_REGEX,
  patientSchema,
  PATIENT_STATUS_LABELS,
  PATIENT_STATUSES,
  tagColor,
  toPatientForm,
  toPatientPayload,
  type Gender,
  type Patient,
  type PatientDocumentType,
  type PatientFormInput,
  type PatientStatus,
} from "@/lib/validators/patient";

const AVATAR_MEDIA_KINDS: MediaKind[] = ["IMAGE"];

/** Sentinel for the gender Select's "prefiere no decirlo" option — never
 *  collides with a real Gender value, same convention as
 *  ServiceFormDialog's NEW_CATEGORY_SENTINEL. */
const GENDER_NONE_SENTINEL = "__none__";

/** Bloquea cualquier tecla imprimible que no sea letra/espacio — mismo
 *  criterio que StaffFormDialog's blockNonLetterKeys. */
function blockNonLetterKeys(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key.length > 1 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!NAME_REGEX.test(event.key)) {
    event.preventDefault();
  }
}

/**
 * Alta/edición rápida de paciente (Módulo 05, Fase 2, spec plan §1: "Tab 1
 * Resumen & Datos Personales"). Un solo formulario, no un wizard por tabs —
 * la ficha 360° completa (antecedentes, notas, galería) vive en su propio
 * drawer (Fase 3), este modal solo cubre los datos personales de contacto.
 */
export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  patient: Patient | null;
  onSaved: () => void;
}) {
  const t = useTranslations("Patients");
  const [submitting, setSubmitting] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PatientFormInput>({
    resolver: zodResolver(patientSchema) as Resolver<PatientFormInput>,
    defaultValues: EMPTY_PATIENT_FORM,
  });

  const tags = watch("tags");
  const avatarUrl = watch("avatarUrl");
  const firstName = watch("firstName");
  const lastName = watch("lastName");

  useEffect(() => {
    if (!open) return;
    reset(patient ? toPatientForm(patient) : { ...EMPTY_PATIENT_FORM });
    setTagDraft("");
  }, [open, patient, reset]);

  const onSubmit = useCallback(
    async (values: PatientFormInput) => {
      setSubmitting(true);
      try {
        const payload = toPatientPayload(values);
        if (patient) {
          await updatePatient(patient.id, payload);
          toast.success(t("form.updated"));
        } else {
          await createPatient(payload);
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
    [patient, onOpenChange, onSaved, t],
  );

  const onInvalid = useCallback(() => {
    toast.error(t("form.validationFailed"));
  }, [t]);

  async function handleAvatarPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPatientAvatar(file);
      setValue("avatarUrl", url);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("form.uploadFailed")));
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  /** Solo limpia el campo del formulario — toPatientPayload manda `null`
   *  explícito para un `avatarUrl` vacío (no `undefined`, que el backend
   *  interpreta como "no tocar"), así que el guardado normal del form ya
   *  persiste el borrado, sin un endpoint aparte. */
  function handleAvatarRemove() {
    setValue("avatarUrl", "");
  }

  function addTag() {
    const tag = tagDraft.trim();
    if (!tag || tags.includes(tag) || tags.length >= 20) return;
    setValue("tags", [...tags, tag]);
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setValue(
      "tags",
      tags.filter((entry) => entry !== tag),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-5">
          <DialogTitle className="text-lg">
            {patient ? t("form.editTitle") : t("form.newTitle")}
          </DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
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
                <Label htmlFor="patient-first-name">{t("form.firstNameLabel")}</Label>
                <Input
                  id="patient-first-name"
                  {...register("firstName")}
                  onKeyDown={blockNonLetterKeys}
                  placeholder={t("form.firstNamePlaceholder")}
                  className="mt-1.5"
                />
                <FieldError message={errors.firstName?.message} />
              </div>
              <div>
                <Label htmlFor="patient-last-name">{t("form.lastNameLabel")}</Label>
                <Input
                  id="patient-last-name"
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
                <Label htmlFor="patient-document-type">{t("form.documentTypeLabel")}</Label>
                <Controller
                  control={control}
                  name="documentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => field.onChange(value ?? "DNI")}>
                      <SelectTrigger id="patient-document-type" className="mt-1.5 w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            DOCUMENT_TYPE_LABELS[(value as PatientDocumentType) ?? "DNI"]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {DOCUMENT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label htmlFor="patient-document-number">{t("form.documentNumberLabel")}</Label>
                <Input
                  id="patient-document-number"
                  {...register("documentNumber")}
                  placeholder={t("form.documentNumberPlaceholder")}
                  className="mt-1.5"
                />
                <FieldError message={errors.documentNumber?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="patient-phone">{t("form.phoneLabel")}</Label>
                <Controller
                  control={control}
                  name="phone"
                  render={({ field }) => (
                    <Input
                      id="patient-phone"
                      type="tel"
                      inputMode="tel"
                      value={field.value}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        field.onChange(digits ? `+${digits.slice(0, 15)}` : "");
                      }}
                      placeholder={t("form.phonePlaceholder")}
                      className="mt-1.5"
                    />
                  )}
                />
                <FieldError message={errors.phone?.message} />
              </div>
              <div>
                <Label htmlFor="patient-email">{t("form.emailLabel")}</Label>
                <Input
                  id="patient-email"
                  type="email"
                  {...register("email")}
                  placeholder={t("form.emailPlaceholder")}
                  className="mt-1.5"
                />
                <FieldError message={errors.email?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="patient-birth-date">{t("form.birthDateLabel")}</Label>
                <Input
                  id="patient-birth-date"
                  type="date"
                  {...register("birthDate")}
                  className="mt-1.5"
                />
                <FieldError message={errors.birthDate?.message} />
              </div>
              <div>
                <Label htmlFor="patient-gender">{t("form.genderLabel")}</Label>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Select
                      value={field.value || GENDER_NONE_SENTINEL}
                      onValueChange={(value) =>
                        field.onChange(!value || value === GENDER_NONE_SENTINEL ? "" : value)
                      }
                    >
                      <SelectTrigger id="patient-gender" className="mt-1.5 w-full">
                        <SelectValue>
                          {(value: string | null) =>
                            !value || value === GENDER_NONE_SENTINEL
                              ? t("form.genderNone")
                              : GENDER_LABELS[value as Gender]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GENDER_NONE_SENTINEL}>{t("form.genderNone")}</SelectItem>
                        {GENDERS.map((gender) => (
                          <SelectItem key={gender} value={gender}>
                            {GENDER_LABELS[gender]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div>
              <Label>{t("form.tagsLabel")}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("form.tagsHelp")}</p>
              <div className="mt-2 space-y-2">
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="h-6 gap-1 pr-1"
                        style={{ backgroundColor: `${tagColor(tag)}1A`, color: tagColor(tag) }}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
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
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter no debe enviar el formulario — dentro de un
                      // <form> guardaría al paciente en vez de agregar la
                      // etiqueta (mismo motivo que TagPicker en
                      // service-form-dialog.tsx).
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder={t("form.tagPlaceholder")}
                    className="h-9"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addTag}>
                    <Plus className="mr-1 size-3.5" />
                    {t("form.addTag")}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="patient-notes">{t("form.notesLabel")}</Label>
              <Textarea
                id="patient-notes"
                {...register("notes")}
                rows={3}
                placeholder={t("form.notesPlaceholder")}
                className="mt-1.5"
              />
              <FieldError message={errors.notes?.message} />
            </div>

            {patient && (
              <div>
                <Label htmlFor="patient-status">{t("form.statusLabel")}</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => field.onChange(value ?? "ACTIVE")}>
                      <SelectTrigger id="patient-status" className="mt-1.5 w-full sm:w-56">
                        <SelectValue>
                          {(value: string | null) =>
                            PATIENT_STATUS_LABELS[(value as PatientStatus) ?? "ACTIVE"]
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PATIENT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {PATIENT_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {patient ? t("common.saveChanges") : t("form.createButton")}
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
