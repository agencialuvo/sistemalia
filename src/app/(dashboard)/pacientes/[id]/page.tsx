"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Phone,
  Plus,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientMedicalHistoryTab } from "@/components/patients/patient-medical-history-tab";
import { PatientNotesTab } from "@/components/patients/patient-notes-tab";
import { PatientGalleryTab } from "@/components/patients/patient-gallery-tab";
import { PatientAppointmentsTab } from "@/components/patients/patient-appointments-tab";
import { PatientClinicalRecordsTab } from "@/components/patients/patient-clinical-records-tab";
import { usePatientTagCatalog } from "@/hooks/use-patient-tags";
import { getApiErrorMessage } from "@/lib/api";
import { getPatientProfile, updatePatient } from "@/lib/patients/api";
import {
  calculateAge,
  DOCUMENT_TYPE_LABELS,
  GENDER_LABELS,
  PATIENT_STATUS_LABELS,
  resolveTagColor,
  type Patient,
} from "@/lib/validators/patient";

/** "1990-05-12T00:00:00.000Z" -> "12 may 1990". */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** E.164 "+51987654321" -> WhatsApp deep link. */
function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** Los ids internos de Tabs son camelCase; el deep-link que arma
 *  appointment-detail-dialog.tsx (Módulo 06 Fase 3, Task 3.2) usa
 *  kebab-case por convención de URL — este mapa traduce entre ambos. */
const TAB_QUERY_TO_ID: Record<string, string> = {
  summary: "summary",
  "medical-history": "medicalHistory",
  appointments: "appointments",
  "clinical-records": "clinicalRecords",
  notes: "notes",
  gallery: "gallery",
};

/**
 * /pacientes/:id — Ficha 360° (Módulo 05, Fase 3, plan §1). Loads the full
 * profile (getPatientProfile360 on the backend) once and hands each relation
 * array down to its own tab component; tabs mutate their own slice of state
 * via the onXCreated/onXAdded callbacks instead of refetching the whole
 * ficha after every write.
 */
export default function PatientDetailPage() {
  const t = useTranslations("Patients.detail");
  const tc = useTranslations("Patients.common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const tagCatalog = usePatientTagCatalog();

  // Deep-link desde AppointmentDetailDialog: /pacientes/:id?tab=clinical-records&appointmentId=...
  // Un efecto (no un initializer de useState) porque el mismo componente de
  // página puede recibir un nuevo deep-link sin desmontarse — ej. al hacer
  // clic en "Registrar Atención Clínica" estando ya en la ficha de ese mismo
  // paciente, en otra pestaña.
  const queryTab = searchParams.get("tab");
  const queryAppointmentId = searchParams.get("appointmentId");
  const [activeTab, setActiveTab] = useState("summary");
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    const mappedTab = queryTab ? TAB_QUERY_TO_ID[queryTab] : undefined;
    if (mappedTab) setActiveTab(mappedTab);
    if (queryAppointmentId) setPendingAppointmentId(queryAppointmentId);
  }, [queryTab, queryAppointmentId]);

  const clearAppointmentDeepLink = useCallback(() => {
    setPendingAppointmentId(null);
    router.replace(`/pacientes/${params.id}`);
    // Solo se necesita una vez, cuando ClinicalRecordFormDialog ya consumió
    // el appointmentId — no debe re-ejecutarse por cambios en el router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      const data = await getPatientProfile(params.id);
      setPatient(data);
      setNotFound(false);
    } catch (error) {
      setNotFound(true);
      toast.error(getApiErrorMessage(error, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [params.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTag = useCallback(async () => {
    const tag = tagDraft.trim();
    if (!patient || !tag || patient.tags.includes(tag) || patient.tags.length >= 20) return;
    setSavingTags(true);
    try {
      const updated = await updatePatient(patient.id, { tags: [...patient.tags, tag] });
      setPatient((current) => (current ? { ...current, tags: updated.tags } : current));
      setTagDraft("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("summary.tagUpdateFailed")));
    } finally {
      setSavingTags(false);
    }
  }, [patient, tagDraft, t]);

  const removeTag = useCallback(
    async (tag: string) => {
      if (!patient) return;
      setSavingTags(true);
      try {
        const updated = await updatePatient(patient.id, {
          tags: patient.tags.filter((entry) => entry !== tag),
        });
        setPatient((current) => (current ? { ...current, tags: updated.tags } : current));
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("summary.tagUpdateFailed")));
      } finally {
        setSavingTags(false);
      }
    },
    [patient, t],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !patient) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/pacientes")}>
          <ArrowLeft className="mr-1.5 size-4" />
          {t("back")}
        </Button>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`;
  const age = calculateAge(patient.birthDate);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        onClick={() => router.push("/pacientes")}
      >
        <ArrowLeft className="mr-1.5 size-4" />
        {t("back")}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar size="lg">
            {patient.avatarUrl ? <AvatarImage src={patient.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-base">
              {patient.firstName[0]?.toUpperCase()}
              {patient.lastName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{fullName}</h1>
              <Badge
                variant={
                  patient.status === "ACTIVE"
                    ? "default"
                    : patient.status === "BLOCKED"
                      ? "destructive"
                      : "secondary"
                }
              >
                {PATIENT_STATUS_LABELS[patient.status]}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[patient.documentType]}
              {patient.documentNumber ? ` · ${patient.documentNumber}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {patient.phone && (
            <>
              <a
                href={whatsappLink(patient.phone)}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <WhatsAppIcon className="mr-1.5 size-4" />
                {t("contactWhatsapp")}
              </a>
              <a
                href={`tel:${patient.phone}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Phone className="mr-1.5 size-4" />
                {t("contactCall")}
              </a>
            </>
          )}
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 size-4" />
            {tc("edit")}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab((value as string) ?? "summary")}>
        <TabsList variant="line">
          <TabsTrigger value="summary">{t("tabs.summary")}</TabsTrigger>
          <TabsTrigger value="medicalHistory">{t("tabs.medicalHistory")}</TabsTrigger>
          <TabsTrigger value="appointments">{t("tabs.appointments")}</TabsTrigger>
          <TabsTrigger value="clinicalRecords">{t("tabs.clinicalRecords")}</TabsTrigger>
          <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>
          <TabsTrigger value="gallery">{t("tabs.gallery")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("summary.demographicsTitle")}
              </h3>
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <DetailRow label={t("summary.phoneLabel")} value={patient.phone ?? "—"} />
                <DetailRow label={t("summary.emailLabel")} value={patient.email ?? "—"} />
                <DetailRow
                  label={t("summary.birthDateLabel")}
                  value={patient.birthDate ? formatDate(patient.birthDate) : "—"}
                />
                <DetailRow
                  label={t("summary.ageLabel")}
                  value={age !== null ? t("ageYears", { age }) : "—"}
                />
                <DetailRow
                  label={t("summary.genderLabel")}
                  value={patient.gender ? GENDER_LABELS[patient.gender] : "—"}
                />
                <DetailRow label={t("summary.createdAtLabel")} value={formatDate(patient.createdAt)} />
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("summary.tagsTitle")}
                </h3>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  {patient.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {patient.tags.map((tag) => {
                        const color = resolveTagColor(tag, tagCatalog.tags);
                        return (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="h-6 gap-1 pr-1"
                          style={{ backgroundColor: `${color}1A`, color }}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => void removeTag(tag)}
                            disabled={savingTags}
                            className="rounded-full p-0.5 hover:bg-background/60"
                            aria-label={tag}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addTag();
                        }
                      }}
                      disabled={savingTags}
                      className="h-8"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void addTag()}
                      disabled={savingTags}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("summary.notesTitle")}
                </h3>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {patient.notes || t("summary.noNotes")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="medicalHistory" className="mt-5">
          <PatientMedicalHistoryTab patientId={patient.id} />
        </TabsContent>

        <TabsContent value="appointments" className="mt-5">
          <PatientAppointmentsTab patientId={patient.id} />
        </TabsContent>

        <TabsContent value="clinicalRecords" className="mt-5">
          <PatientClinicalRecordsTab
            patientId={patient.id}
            initialAppointmentId={pendingAppointmentId}
            onInitialAppointmentHandled={clearAppointmentDeepLink}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-5">
          <PatientNotesTab
            patientId={patient.id}
            notes={patient.clinicalNotes ?? []}
            onNoteCreated={(note) =>
              setPatient((current) =>
                current ? { ...current, clinicalNotes: [note, ...(current.clinicalNotes ?? [])] } : current,
              )
            }
          />
        </TabsContent>

        <TabsContent value="gallery" className="mt-5">
          <PatientGalleryTab
            patientId={patient.id}
            images={patient.galleryImages ?? []}
            onImageAdded={(image) =>
              setPatient((current) =>
                current ? { ...current, galleryImages: [image, ...(current.galleryImages ?? [])] } : current,
              )
            }
            onImageRemoved={(imageId) =>
              setPatient((current) =>
                current
                  ? {
                      ...current,
                      galleryImages: (current.galleryImages ?? []).filter((image) => image.id !== imageId),
                    }
                  : current,
              )
            }
          />
        </TabsContent>
      </Tabs>

      <PatientFormDialog open={editOpen} onOpenChange={setEditOpen} patient={patient} onSaved={() => void load()} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
