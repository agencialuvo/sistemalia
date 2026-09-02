"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { AppointmentQuickPopover } from "@/components/appointments/appointment-quick-popover";
import { APPOINTMENT_STATUS_COLORS, formatTimeUtc, type Appointment } from "@/lib/validators/appointment";
import { cn } from "@/lib/utils";

const MAX_CHIPS_PER_CELL = 3;

export interface AgendaMonthGridProps {
  /** Una celda por cada día visible en la matriz (incluye relleno del mes
   *  anterior/siguiente) — `inCurrentMonth` ya viene resuelto por el
   *  llamador, así que este componente no necesita saber qué mes es. */
  days: { date: string; dayNumber: number; inCurrentMonth: boolean; isToday: boolean; appointments: Appointment[] }[];
  onOpenAppointment: (appointment: Appointment) => void;
  onChanged: () => void;
  /** El usuario pidió ver el detalle del día completo ("+N más") — el
   *  llamador cambia a escala Día en esa fecha. */
  onExpandDay: (date: string) => void;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Vista Mes — matriz de semanas × días de la semana (spec: "matriz de días
 * para mes"), sin precisión horaria: cada celda muestra el número de citas y
 * hasta 3 tarjetas compactas, con un "+N más" que lleva a la vista Día
 * completa para esa fecha. No es una grilla de tiempo — construir una
 * grilla hora×recurso×31-días sería ilegible, mismo motivo por el que
 * Semana también renuncia a las columnas por recurso.
 */
export function AgendaMonthGrid({ days, onOpenAppointment, onChanged, onExpandDay }: AgendaMonthGridProps) {
  const weeks = useMemo(() => {
    const rows: typeof days[number][][] = [];
    for (let index = 0; index < days.length; index += 7) {
      rows.push(days.slice(index, index + 7));
    }
    return rows;
  }, [days]);

  return (
    <div className="flex h-full flex-col overflow-auto rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border/80 bg-muted/30">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-rows-[repeat(auto-fill,minmax(7rem,1fr))]">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-border/60 last:border-b-0">
            {week.map((day) => (
              <MonthCell
                key={day.date}
                day={day}
                onOpenAppointment={onOpenAppointment}
                onChanged={onChanged}
                onExpandDay={onExpandDay}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  onOpenAppointment,
  onChanged,
  onExpandDay,
}: {
  day: AgendaMonthGridProps["days"][number];
  onOpenAppointment: (appointment: Appointment) => void;
  onChanged: () => void;
  onExpandDay: (date: string) => void;
}) {
  const t = useTranslations("Appointments");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => [...day.appointments].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [day.appointments],
  );
  const visible = expanded ? sorted : sorted.slice(0, MAX_CHIPS_PER_CELL);
  const overflow = sorted.length - visible.length;

  return (
    <div
      className={cn(
        "flex min-h-28 flex-col gap-1 border-r border-border/60 p-1.5 last:border-r-0",
        !day.inCurrentMonth && "bg-muted/20",
      )}
    >
      <span
        className={cn(
          "self-start rounded-full px-1.5 text-xs font-medium",
          day.isToday
            ? "bg-primary text-primary-foreground"
            : day.inCurrentMonth
              ? "text-foreground"
              : "text-muted-foreground/50",
        )}
      >
        {day.dayNumber}
      </span>

      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        {visible.map((appointment) => (
          <AppointmentQuickPopover
            key={appointment.id}
            appointment={appointment}
            onEdit={() => onOpenAppointment(appointment)}
            onChanged={onChanged}
            trigger={
              <button
                type="button"
                className={cn(
                  "w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] shadow-sm",
                  APPOINTMENT_STATUS_COLORS[appointment.status],
                )}
              >
                {formatTimeUtc(appointment.startAt)} {appointment.patient.firstName} {appointment.patient.lastName}
              </button>
            }
          />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => (sorted.length > MAX_CHIPS_PER_CELL + 2 ? onExpandDay(day.date) : setExpanded(true))}
            className="text-left text-[11px] font-medium text-primary hover:underline"
          >
            {t("month.more", { count: overflow })}
          </button>
        )}
      </div>
    </div>
  );
}
