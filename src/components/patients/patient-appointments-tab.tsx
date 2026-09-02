"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AppointmentDetailDialog } from "@/components/appointments/appointment-detail-dialog";
import { listAppointments } from "@/lib/appointments/api";
import { getApiErrorMessage } from "@/lib/api";
import {
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  formatDateUtc,
  formatTimeUtc,
  type Appointment,
} from "@/lib/validators/appointment";

/** Ventana amplia (5 años atrás, 1 año adelante) — GET /appointments exige un
 *  rango de fechas, y una ficha de paciente quiere ver todo su historial, no
 *  solo el día de hoy (a diferencia de /agenda). */
function historyRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - 5);
  const to = new Date(now);
  to.setUTCFullYear(to.getUTCFullYear() + 1);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

/**
 * Tab "Historial de Citas" de la Ficha 360° (Módulo 06 Fase 3, Task 3.1) —
 * línea de tiempo descendente de las citas del paciente, reutilizando el
 * mismo modal de detalle de /agenda para ver/accionar cada una.
 */
export function PatientAppointmentsTab({ patientId }: { patientId: string }) {
  const t = useTranslations("Patients.detail.appointments");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Appointment | null>(null);

  function load() {
    setLoading(true);
    const { dateFrom, dateTo } = historyRange();
    listAppointments({ patientId, dateFrom, dateTo })
      .then((result) =>
        setAppointments([...result.data].sort((a, b) => b.startAt.localeCompare(a.startAt))),
      )
      .catch((error) => toast.error(getApiErrorMessage(error, t("loadFailed"))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
        <CalendarClock className="size-7 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>

      <ol className="space-y-3 border-l border-border pl-4">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="relative">
            <span className="absolute top-1.5 -left-[1.35rem] size-2.5 rounded-full border-2 border-background bg-primary" />
            <button
              type="button"
              onClick={() => setViewing(appointment)}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {formatDateUtc(appointment.startAt)} · {formatTimeUtc(appointment.startAt)}–
                  {formatTimeUtc(appointment.endAt)}
                </p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {appointment.service.name} — {appointment.staffMember.firstName}{" "}
                  {appointment.staffMember.lastName}
                </p>
              </div>
              <Badge className={APPOINTMENT_STATUS_COLORS[appointment.status]} variant="outline">
                {APPOINTMENT_STATUS_LABELS[appointment.status]}
              </Badge>
            </button>
          </li>
        ))}
      </ol>

      <AppointmentDetailDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        appointment={viewing}
        onChanged={() => load()}
      />
    </div>
  );
}
