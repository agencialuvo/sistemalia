"use client";

import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DoorOpen, Plus, User, Wrench } from "lucide-react";
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
import { rescheduleAppointment, type ReschedulePayload } from "@/lib/appointments/api";
import {
  DEFAULT_END_MIN,
  DEFAULT_START_MIN,
  PX_PER_MINUTE,
  ROW_MINUTES,
  SNAP_MINUTES,
  roundDownTo,
  roundUpTo,
} from "@/lib/appointments/pack-overlaps";
import {
  APPOINTMENT_STATUS_COLORS,
  formatTimeUtc,
  isoAtUtcMinutes,
  minutesFromMidnightUtc,
  type Appointment,
  type AppointmentGridGroupBy,
} from "@/lib/validators/appointment";
import { cn } from "@/lib/utils";

/** Un recurso agendable — profesional, sala o equipo, según `groupBy`. Mismo
 *  shape que devuelve GET /appointments/grid (sin las citas, que se
 *  distribuyen aparte en `appointmentsByResource`). */
export interface AgendaResource {
  id: string;
  name: string;
  color: string | null;
}

/** Nombre del campo de recurso que reagendar debe reasignar cuando la
 *  tarjeta se arrastra a otra columna — depende de qué dimensión agrupa la
 *  grilla actualmente. */
function resourceFieldFor(groupBy: AppointmentGridGroupBy): keyof ReschedulePayload {
  if (groupBy === "PROFESSIONAL") return "staffMemberId";
  if (groupBy === "ROOM") return "roomId";
  return "equipmentId";
}

function resourceIdOf(appointment: Appointment, groupBy: AppointmentGridGroupBy): string | null {
  if (groupBy === "PROFESSIONAL") return appointment.staffMemberId;
  if (groupBy === "ROOM") return appointment.roomId;
  return appointment.equipmentId;
}

export interface AgendaGridProps {
  /** "YYYY-MM-DD" the grid is showing. */
  date: string;
  /** Qué dimensión agrupa las columnas — determina qué campo reasigna el
   *  drag & drop entre columnas y qué id recibe onCreateAt/onChanged. */
  groupBy: AppointmentGridGroupBy;
  resources: AgendaResource[];
  appointments: Appointment[];
  onOpenAppointment: (appointment: Appointment) => void;
  onCreateAt: (resourceId: string, startAtIso: string) => void;
  /** Called after a drag successfully reschedules a cita, so the caller can
   *  re-fetch the day. */
  onChanged: () => void;
}

/**
 * Matriz temporal de la Agenda (Módulo 06): filas = horas del día, columnas
 * = un recurso cada una (profesional, sala o equipo según `groupBy`).
 * Arrastrar una tarjeta la reprograma (misma columna = solo cambia la hora;
 * otra columna = también reasigna el recurso de esa dimensión) llamando a
 * PATCH .../reschedule, que revalida el horario en el servidor — un drop a
 * un horario ocupado se revierte con un toast de error (409, con el nombre
 * exacto del recurso ocupado), no se aplica optimistamente.
 */
export function AgendaGrid({
  date,
  groupBy,
  resources,
  appointments,
  onOpenAppointment,
  onCreateAt,
  onChanged,
}: AgendaGridProps) {
  const t = useTranslations("Appointments.grid");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sensors = useSensors(
    // Distance guard so a plain click-to-open isn't swallowed as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { gridStart, gridEnd } = useMemo(() => {
    let start = DEFAULT_START_MIN;
    let end = DEFAULT_END_MIN;
    for (const appointment of appointments) {
      start = Math.min(start, roundDownTo(minutesFromMidnightUtc(appointment.startAt), ROW_MINUTES));
      end = Math.max(end, roundUpTo(minutesFromMidnightUtc(appointment.endAt), ROW_MINUTES));
    }
    return { gridStart: start, gridEnd: end };
  }, [appointments]);

  const totalMinutes = gridEnd - gridStart;
  const gridHeight = totalMinutes * PX_PER_MINUTE;
  const rows = useMemo(() => {
    const list: number[] = [];
    for (let m = gridStart; m < gridEnd; m += ROW_MINUTES) list.push(m);
    return list;
  }, [gridStart, gridEnd]);

  const appointmentsByResource = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const resource of resources) map.set(resource.id, []);
    for (const appointment of appointments) {
      const resourceId = resourceIdOf(appointment, groupBy);
      if (resourceId) map.get(resourceId)?.push(appointment);
    }
    return map;
  }, [resources, appointments, groupBy]);

  const activeAppointment = activeId ? (appointments.find((a) => a.id === activeId) ?? null) : null;

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
    if (!overId.startsWith("col:")) return;
    const targetResourceId = overId.slice(4);

    const appointment = appointments.find((a) => a.id === String(active.id));
    if (!appointment) return;

    const durationMinutes = minutesFromMidnightUtc(appointment.endAt) - minutesFromMidnightUtc(appointment.startAt);
    const originalStart = minutesFromMidnightUtc(appointment.startAt);
    const rawStart = originalStart + delta.y / PX_PER_MINUTE;
    const snapped = Math.round(rawStart / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.min(Math.max(snapped, gridStart), gridEnd - durationMinutes);

    const newStartAt = isoAtUtcMinutes(date, clamped);
    const resourceField = resourceFieldFor(groupBy);
    const resourceChanged = targetResourceId !== resourceIdOf(appointment, groupBy);
    if (newStartAt === appointment.startAt && !resourceChanged) return;

    setPendingId(appointment.id);
    try {
      await rescheduleAppointment(appointment.id, {
        startAt: newStartAt,
        ...(resourceChanged ? { [resourceField]: targetResourceId } : {}),
      });
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
        {/* Time gutter */}
        <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-border bg-background">
          <div className="h-11 border-b border-border/80" />
          <div className="relative" style={{ height: gridHeight }}>
            {rows.map((minute) => (
              <div
                key={minute}
                className="absolute inset-x-0 flex justify-end pr-2 text-[11px] text-muted-foreground"
                style={{ top: Math.max(0, (minute - gridStart) * PX_PER_MINUTE - 6) }}
              >
                {minute % 60 === 0 ? formatTimeUtc(isoAtUtcMinutes(date, minute)) : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div className="flex min-w-0 flex-1 items-start">
          {resources.map((resource) => (
            <AgendaColumn
              key={resource.id}
              resource={resource}
              groupBy={groupBy}
              appointments={appointmentsByResource.get(resource.id) ?? []}
              rows={rows}
              gridStart={gridStart}
              gridHeight={gridHeight}
              date={date}
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
          <div className="w-56 opacity-90 shadow-lg">
            <AppointmentCard appointment={activeAppointment} groupBy={groupBy} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function AgendaColumn({
  resource,
  groupBy,
  appointments,
  rows,
  gridStart,
  gridHeight,
  date,
  pendingId,
  onOpenAppointment,
  onCreateAt,
  onChanged,
}: {
  resource: AgendaResource;
  groupBy: AppointmentGridGroupBy;
  appointments: Appointment[];
  rows: number[];
  gridStart: number;
  gridHeight: number;
  date: string;
  pendingId: string | null;
  onOpenAppointment: (appointment: Appointment) => void;
  onCreateAt: (resourceId: string, startAtIso: string) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("Appointments.grid");
  const { setNodeRef, isOver } = useDroppable({ id: `col:${resource.id}` });

  return (
    <div className="min-w-0 flex-1 border-r border-border last:border-r-0">
      <div className="flex h-11 items-center gap-2 border-b border-border/80 bg-muted/30 px-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: resource.color ?? "var(--muted-foreground)" }}
        />
        <p className="truncate text-sm font-medium text-foreground">{resource.name}</p>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{appointments.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn("relative", isOver && "bg-primary/5")}
        style={{ height: gridHeight }}
      >
        {/* Background rows — each an empty-slot "+ Reservar" affordance,
            sitting BELOW the absolutely-positioned appointment cards so a
            booked span is never clickable-through. */}
        {rows.map((minute) => (
          <button
            key={minute}
            type="button"
            onClick={() => onCreateAt(resource.id, isoAtUtcMinutes(date, minute))}
            className="group absolute inset-x-0 flex items-center justify-center border-t border-border/60 text-muted-foreground/0 transition-colors hover:bg-primary/5 hover:text-primary"
            style={{ top: (minute - gridStart) * PX_PER_MINUTE, height: ROW_MINUTES * PX_PER_MINUTE }}
          >
            <span className="flex items-center gap-1 text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
              <Plus className="size-3" />
              {t("bookHere")}
            </span>
          </button>
        ))}

        {appointments.map((appointment) => (
          <DraggableAppointmentCard
            key={appointment.id}
            appointment={appointment}
            groupBy={groupBy}
            date={date}
            gridStart={gridStart}
            pending={pendingId === appointment.id}
            onOpen={() => onOpenAppointment(appointment)}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableAppointmentCard({
  appointment,
  groupBy,
  date,
  gridStart,
  pending,
  onOpen,
  onChanged,
}: {
  appointment: Appointment;
  groupBy: AppointmentGridGroupBy;
  date: string;
  gridStart: number;
  pending: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("Appointments.grid");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: appointment.id });
  const [previewMinutes, setPreviewMinutes] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);

  const top = (minutesFromMidnightUtc(appointment.startAt) - gridStart) * PX_PER_MINUTE;
  const durationMinutes = minutesFromMidnightUtc(appointment.endAt) - minutesFromMidnightUtc(appointment.startAt);
  const height = Math.max((previewMinutes ?? durationMinutes) * PX_PER_MINUTE, 24);

  /** Redimensiona el borde inferior (spec §5.3): arrastra solo la duración,
   *  sin tocar `startAt` — usa listeners nativos de `pointer` en `window` en
   *  vez de dnd-kit para no interferir con el drag de mover (que sí usa
   *  dnd-kit sobre toda la tarjeta). `stopPropagation` en el handle evita
   *  que el pointerdown también dispare el listener de mover de dnd-kit. */
  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (pending) return;
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    let currentMinutes = durationMinutes;
    setResizing(true);
    setPreviewMinutes(durationMinutes);

    function handleMove(moveEvent: PointerEvent) {
      const deltaY = moveEvent.clientY - startY;
      const rawDuration = durationMinutes + deltaY / PX_PER_MINUTE;
      currentMinutes = Math.max(SNAP_MINUTES, Math.round(rawDuration / SNAP_MINUTES) * SNAP_MINUTES);
      setPreviewMinutes(currentMinutes);
    }

    async function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setResizing(false);
      if (currentMinutes === durationMinutes) {
        setPreviewMinutes(null);
        return;
      }
      const startMinutes = minutesFromMidnightUtc(appointment.startAt);
      const newEndAt = isoAtUtcMinutes(date, startMinutes + currentMinutes);
      try {
        await rescheduleAppointment(appointment.id, { startAt: appointment.startAt, endAt: newEndAt });
        toast.success(t("resized"));
        onChanged();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("resizeFailed")));
        setPreviewMinutes(null);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

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
            "group absolute inset-x-1 z-[1] cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-opacity active:cursor-grabbing",
            APPOINTMENT_STATUS_COLORS[appointment.status],
            (isDragging || pending || resizing) && "opacity-40",
          )}
          style={{ top, height }}
        >
          <AppointmentCard appointment={appointment} groupBy={groupBy} compact={height < 54} />
          <div
            onPointerDown={handleResizeStart}
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-row-resize opacity-0 transition-opacity group-hover:opacity-100"
          >
            <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-60" />
          </div>
        </button>
      }
    />
  );
}

/** Distintivos de Sala/Equipo/Profesional en la tarjeta — siempre se
 *  muestran los tres cuando aplican (spec: "profesional, sala y equipo,
 *  además del paciente"), no solo la dimensión que agrupa la columna
 *  actual, para que la tarjeta sea informativa sin abrir el detalle. */
function AppointmentCard({
  appointment,
  groupBy,
  compact,
}: {
  appointment: Appointment;
  groupBy: AppointmentGridGroupBy;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold">
        {formatTimeUtc(appointment.startAt)}–{formatTimeUtc(appointment.endAt)}
      </p>
      <p className="truncate font-medium text-foreground">
        {appointment.patient.firstName} {appointment.patient.lastName}
      </p>
      {!compact && (
        <>
          <p className="truncate text-[11px] text-muted-foreground">{appointment.service.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {groupBy !== "PROFESSIONAL" && (
              <span className="flex min-w-0 items-center gap-1">
                <User className="size-3 shrink-0" />
                <span className="truncate">
                  {appointment.staffMember.firstName} {appointment.staffMember.lastName}
                </span>
              </span>
            )}
            {groupBy !== "ROOM" && appointment.room && (
              <span className="flex min-w-0 items-center gap-1">
                <DoorOpen className="size-3 shrink-0" />
                <span className="truncate">{appointment.room.name}</span>
              </span>
            )}
            {groupBy !== "EQUIPMENT" && appointment.equipment && (
              <span className="flex min-w-0 items-center gap-1">
                <Wrench className="size-3 shrink-0" />
                <span className="truncate">{appointment.equipment.name}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
