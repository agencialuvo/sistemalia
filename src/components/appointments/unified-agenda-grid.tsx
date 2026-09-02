"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { AppointmentQuickPopover } from "@/components/appointments/appointment-quick-popover";
import { getApiErrorMessage } from "@/lib/api";
import { rescheduleAppointment } from "@/lib/appointments/api";
import {
  DEFAULT_END_MIN,
  DEFAULT_START_MIN,
  PX_PER_MINUTE,
  ROW_MINUTES,
  SNAP_MINUTES,
  packOverlappingAppointments,
  roundDownTo,
  roundUpTo,
} from "@/lib/appointments/pack-overlaps";
import {
  APPOINTMENT_STATUS_COLORS,
  formatTimeUtc,
  isoAtUtcMinutes,
  minutesFromMidnightUtc,
  type Appointment,
} from "@/lib/validators/appointment";
import { cn } from "@/lib/utils";

export interface UnifiedAgendaGridProps {
  /** Un día ("Visión General" en escala Día) o siete ("Semana") — cada uno
   *  pinta su propia línea de tiempo consolidada, coloreada por profesional
   *  en vez de separada en columnas por recurso. */
  days: { date: string; label: string; appointments: Appointment[] }[];
  onOpenAppointment: (appointment: Appointment) => void;
  onCreateAt: (startAtIso: string) => void;
  onChanged: () => void;
}

/**
 * Grilla temporal unificada — todas las citas de la clínica en una sola
 * línea de tiempo por día (spec "Visión General"), en vez de columnas por
 * doctor. Cuando dos citas se solapan, se reparten carriles lado a lado
 * dentro del mismo día (packOverlappingAppointments); cada tarjeta lleva un
 * acento de color a la izquierda según el profesional asignado
 * (`staffMember.color`) — el fondo sigue reflejando el estado, igual que en
 * AgendaGrid.
 *
 * Drag & drop (spec §5.3): mover una tarjeta reprograma su hora (misma
 * columna) y/o su día (soltar en otra columna) — mismo patrón de @dnd-kit
 * que AgendaGrid, salvo que aquí las columnas droppable son días, no
 * recursos, así que reprogramar nunca reasigna profesional/sala/equipo,
 * solo `startAt`. No hay resize aquí: redimensionar solo tiene sentido en la
 * vista Día por recurso, donde una sola tarjeta no compite por carril con
 * otras del mismo profesional.
 */
export function UnifiedAgendaGrid({ days, onOpenAppointment, onCreateAt, onChanged }: UnifiedAgendaGridProps) {
  const t = useTranslations("Appointments.grid");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const allAppointments = useMemo(() => days.flatMap((day) => day.appointments), [days]);

  const { gridStart, gridEnd } = useMemo(() => {
    let start = DEFAULT_START_MIN;
    let end = DEFAULT_END_MIN;
    for (const appointment of allAppointments) {
      start = Math.min(start, roundDownTo(minutesFromMidnightUtc(appointment.startAt), ROW_MINUTES));
      end = Math.max(end, roundUpTo(minutesFromMidnightUtc(appointment.endAt), ROW_MINUTES));
    }
    return { gridStart: start, gridEnd: end };
  }, [allAppointments]);

  const totalMinutes = gridEnd - gridStart;
  const gridHeight = totalMinutes * PX_PER_MINUTE;
  const rows = useMemo(() => {
    const list: number[] = [];
    for (let m = gridStart; m < gridEnd; m += ROW_MINUTES) list.push(m);
    return list;
  }, [gridStart, gridEnd]);

  const activeAppointment = activeId ? (allAppointments.find((a) => a.id === activeId) ?? null) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over, delta } = event;
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith("day:")) return;
    const targetDate = overId.slice(4);

    const appointment = allAppointments.find((a) => a.id === String(active.id));
    if (!appointment) return;

    const durationMinutes = minutesFromMidnightUtc(appointment.endAt) - minutesFromMidnightUtc(appointment.startAt);
    const originalStart = minutesFromMidnightUtc(appointment.startAt);
    const rawStart = originalStart + delta.y / PX_PER_MINUTE;
    const snapped = Math.round(rawStart / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.min(Math.max(snapped, gridStart), gridEnd - durationMinutes);

    const newStartAt = isoAtUtcMinutes(targetDate, clamped);
    if (newStartAt === appointment.startAt) return;

    setPendingId(appointment.id);
    try {
      await rescheduleAppointment(appointment.id, { startAt: newStartAt });
      toast.success(t("rescheduled"));
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("rescheduleFailed")));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full items-start overflow-y-auto overflow-x-hidden rounded-xl border border-border">
        <div className="sticky left-0 top-0 z-20 w-16 shrink-0 border-r border-border bg-background">
          <div className="sticky top-0 z-20 h-11 border-b border-border/80 bg-background" />
          <div className="relative" style={{ height: gridHeight }}>
            {rows.map((minute) => (
              <div
                key={minute}
                className="absolute inset-x-0 flex justify-end pr-2 text-[11px] text-muted-foreground"
                style={{ top: Math.max(0, (minute - gridStart) * PX_PER_MINUTE - 6) }}
              >
                {minute % 60 === 0 ? formatTimeUtc(isoAtUtcMinutes(days[0]?.date ?? "1970-01-01", minute)) : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-start">
          {days.map((day) => (
            <UnifiedDayColumn
              key={day.date}
              date={day.date}
              label={day.label}
              appointments={day.appointments}
              rows={rows}
              gridStart={gridStart}
              gridHeight={gridHeight}
              pendingId={pendingId}
              onOpenAppointment={onOpenAppointment}
              onCreateAt={onCreateAt}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeAppointment ? (
          <div
            className={cn(
              "w-56 overflow-hidden rounded-md border px-2 py-1 text-left text-xs opacity-90 shadow-lg",
              APPOINTMENT_STATUS_COLORS[activeAppointment.status],
            )}
          >
            <p className="truncate font-semibold">
              {formatTimeUtc(activeAppointment.startAt)}–{formatTimeUtc(activeAppointment.endAt)}
            </p>
            <p className="truncate font-medium text-foreground">
              {activeAppointment.patient.firstName} {activeAppointment.patient.lastName}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function UnifiedDayColumn({
  date,
  label,
  appointments,
  rows,
  gridStart,
  gridHeight,
  pendingId,
  onOpenAppointment,
  onCreateAt,
  onChanged,
}: {
  date: string;
  label: string;
  appointments: Appointment[];
  rows: number[];
  gridStart: number;
  gridHeight: number;
  pendingId: string | null;
  onOpenAppointment: (appointment: Appointment) => void;
  onCreateAt: (startAtIso: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("Appointments");
  const gridT = useTranslations("Appointments.grid");
  const packed = useMemo(() => packOverlappingAppointments(appointments), [appointments]);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });

  return (
    <div className="min-w-0 flex-1 border-r border-border last:border-r-0">
      <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-border/80 bg-muted/30 px-3">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{appointments.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn("relative", isOver && "bg-primary/5")}
        style={{ height: gridHeight }}
      >
        {rows.map((minute) => (
          <button
            key={minute}
            type="button"
            onClick={() => onCreateAt(isoAtUtcMinutes(date, minute))}
            className="group absolute inset-x-0 flex items-center justify-center border-t border-border/60 text-muted-foreground/0 transition-colors hover:bg-primary/5 hover:text-primary"
            style={{ top: (minute - gridStart) * PX_PER_MINUTE, height: ROW_MINUTES * PX_PER_MINUTE }}
          >
            <span className="flex items-center gap-1 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
              <Plus className="size-3" />
              {gridT("bookHere")}
            </span>
          </button>
        ))}

        {packed.length === 0 && (
          <p className="pointer-events-none pt-8 text-center text-xs text-muted-foreground">
            {t("noAppointments")}
          </p>
        )}

        {packed.map(({ appointment, column, columnCount }) => (
          <UnifiedAppointmentCard
            key={appointment.id}
            appointment={appointment}
            gridStart={gridStart}
            column={column}
            columnCount={columnCount}
            pending={pendingId === appointment.id}
            onOpen={() => onOpenAppointment(appointment)}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

function UnifiedAppointmentCard({
  appointment,
  gridStart,
  column,
  columnCount,
  pending,
  onOpen,
  onChanged,
}: {
  appointment: Appointment;
  gridStart: number;
  column: number;
  columnCount: number;
  pending: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: appointment.id });

  const top = (minutesFromMidnightUtc(appointment.startAt) - gridStart) * PX_PER_MINUTE;
  const height = Math.max(
    (minutesFromMidnightUtc(appointment.endAt) - minutesFromMidnightUtc(appointment.startAt)) * PX_PER_MINUTE,
    24,
  );
  const widthPercent = 100 / columnCount;
  const staffColor = appointment.staffMember.color ?? "var(--muted-foreground)";

  return (
    <AppointmentQuickPopover
      appointment={appointment}
      onEdit={onOpen}
      onChanged={onChanged}
      trigger={
        <button
          ref={setNodeRef}
          type="button"
          {...listeners}
          {...attributes}
          className={cn(
            "absolute z-[1] cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-opacity active:cursor-grabbing",
            APPOINTMENT_STATUS_COLORS[appointment.status],
            (isDragging || pending) && "opacity-40",
          )}
          style={{
            top,
            height,
            left: `${column * widthPercent}%`,
            width: `calc(${widthPercent}% - 4px)`,
            borderLeftColor: staffColor,
            borderLeftWidth: 3,
          }}
        >
          <p className="truncate font-semibold">
            {formatTimeUtc(appointment.startAt)}–{formatTimeUtc(appointment.endAt)}
          </p>
          <p className="truncate font-medium text-foreground">
            {appointment.patient.firstName} {appointment.patient.lastName}
          </p>
          {height >= 54 && (
            <p className="truncate text-[11px] text-muted-foreground">
              {appointment.staffMember.firstName} {appointment.staffMember.lastName} · {appointment.service.name}
            </p>
          )}
        </button>
      }
    />
  );
}
