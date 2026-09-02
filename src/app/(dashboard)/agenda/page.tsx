"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgendaGrid } from "@/components/appointments/agenda-grid";
import { AgendaMonthGrid } from "@/components/appointments/agenda-month-grid";
import { AppointmentBulkImportDialog } from "@/components/appointments/appointment-bulk-import-dialog";
import { AppointmentDetailDialog } from "@/components/appointments/appointment-detail-dialog";
import { AppointmentFormDialog } from "@/components/appointments/appointment-form-dialog";
import { AppointmentQuickPopover } from "@/components/appointments/appointment-quick-popover";
import { DateJumpPopover } from "@/components/appointments/date-jump-popover";
import { EntityFilterPopover, type EntityFilterOption } from "@/components/appointments/entity-filter-popover";
import { GoogleSyncIndicator } from "@/components/appointments/google-sync-indicator";
import { UnifiedAgendaGrid } from "@/components/appointments/unified-agenda-grid";
import { addDays, addMonths, monthMatrixDays, monthYearEs, shortDateEs, weekDays, weekdayNumberEs } from "@/lib/appointments/date-helpers";
import { downloadAppointmentsTemplate, getAppointmentsGrid, listEquipment, listRooms } from "@/lib/appointments/api";
import { getApiErrorMessage } from "@/lib/api";
import { listStaff } from "@/lib/staff/api";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  formatTimeUtc,
  todayDateOnly,
  type Appointment,
  type AppointmentGridGroupBy,
  type AppointmentGridResource,
  type AppointmentResourceRef,
  type AppointmentStatus,
} from "@/lib/validators/appointment";
import type { StaffMember } from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "__all__";
/** Id sintético para agrupar/filtrar el personal sin especialidad asignada
 *  — no existe como fila real en el catálogo de especialidades. */
const NO_SPECIALTY_ID = "__no_specialty__";

/** Filtros de entidad (grupo izquierdo de la cabecera). "overview" y
 *  "specialty" comparten la vista de columnas-de-tarjetas, salvo que
 *  "overview" ahora es la línea de tiempo unificada de toda la clínica
 *  (UnifiedAgendaGrid), no columnas por doctor — ver `showResourceColumns`
 *  más abajo. "staff"/"room"/"equipment" son las tres dimensiones reales
 *  que soporta la grilla interactiva con drag & drop (AgendaGrid), pero
 *  solo en escala Día (ver nota de `scale`). */
type Grouping = "overview" | "specialty" | "staff" | "room" | "equipment";
type Scale = "month" | "week" | "day";

const GRID_GROUPINGS: Grouping[] = ["staff", "room", "equipment"];

/** Qué agrupador del backend (GET /appointments/grid) alimenta cada modo de
 *  la UI — "overview"/"specialty" reutilizan PROFESSIONAL: ambos parten de
 *  la misma lista de citas por profesional, solo la re-agrupan distinto en
 *  el cliente (por profesional o por su especialidad). */
function groupByFor(grouping: Grouping): AppointmentGridGroupBy {
  if (grouping === "room") return "ROOM";
  if (grouping === "equipment") return "EQUIPMENT";
  return "PROFESSIONAL";
}

/** "YYYY-MM-DD" -> a UTC day's [00:00, 24:00) window — same convention as
 *  the backend slot engine (dateOnlyToUtc). */
function dayRange(date: string): { startDate: string; endDate: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** Rango a pedir al backend según la escala activa — Semana/Mes piden todo
 *  el bloque de días visible de una sola vez. */
function fetchRangeFor(scale: Scale, date: string): { startDate: string; endDate: string } {
  if (scale === "day") return dayRange(date);
  const days = scale === "week" ? weekDays(date) : monthMatrixDays(date);
  return { startDate: dayRange(days[0]).startDate, endDate: dayRange(days[days.length - 1]).endDate };
}

/** Normaliza para el buscador de texto (spec §3.1): minúsculas + sin tildes,
 *  así "garcia" encuentra "García" y viceversa. */
function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * /agenda — Módulo 06 unificado ("Citas" + "Calendario" fusionados en un
 * único módulo profesional), conectado a GET /appointments/grid.
 *
 * Escala temporal (Día/Semana/Mes) y filtro de entidad (Visión General/
 * Especialidad/Profesional/Sala/Equipo) son ejes independientes, pero solo
 * se cruzan de verdad en escala Día: ahí "Por Profesional/Sala/Equipo" abre
 * columnas reales por recurso (AgendaGrid, con drag & drop) y "Especialidad"
 * columnas por especialidad. Semana y Mes SIEMPRE muestran la vista
 * consolidada (UnifiedAgendaGrid / AgendaMonthGrid) sin importar el filtro
 * de entidad activo — una grilla recurso×día×hora sería del tamaño de una
 * hoja de cálculo y prácticamente inusable, así que la escala temporal
 * "gana" por encima de la columna de recurso. "Visión General" en escala
 * Día usa esa misma vista consolidada.
 *
 * Cada pestaña de entidad (salvo Visión General) abre un popover de
 * selección múltiple (EntityFilterPopover) — la selección hecha ahí actúa
 * como un filtro GLOBAL (se aplica sin importar qué pestaña esté activa en
 * ese momento, igual que el filtro de estado/búsqueda), no solo mientras esa
 * pestaña está seleccionada — así "elegí estos 3 profesionales" sigue
 * filtrando aunque el usuario cambie a Sala/Box después.
 */
export default function AgendaPage() {
  const t = useTranslations("Appointments");

  const [date, setDate] = useState(todayDateOnly());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [grouping, setGrouping] = useState<Grouping>("overview");
  const [scale, setScale] = useState<Scale>("week");

  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>([]);
  const [staffPopoverOpen, setStaffPopoverOpen] = useState(false);
  const [roomPopoverOpen, setRoomPopoverOpen] = useState(false);
  const [equipmentPopoverOpen, setEquipmentPopoverOpen] = useState(false);
  const [specialtyPopoverOpen, setSpecialtyPopoverOpen] = useState(false);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rooms, setRooms] = useState<AppointmentResourceRef[]>([]);
  const [equipment, setEquipment] = useState<AppointmentResourceRef[]>([]);
  const [resources, setResources] = useState<AppointmentGridResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formPrefill, setFormPrefill] = useState<{
    staffId?: string;
    roomId?: string;
    equipmentId?: string;
    startAt?: string;
  }>({});
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Semana y Mes siempre piden PROFESSIONAL (ver doc comment de la página):
  // es el único agrupador que nunca deja citas fuera (todo Appointment tiene
  // staffMemberId, no todos tienen roomId/equipmentId), así que es la fuente
  // correcta para reconstruir la línea de tiempo consolidada o la matriz de
  // mes sin perder citas sin sala/equipo asignados.
  const groupBy: AppointmentGridGroupBy = scale === "day" ? groupByFor(grouping) : "PROFESSIONAL";

  useEffect(() => {
    void listStaff({ isActive: true })
      .then((result) => setStaff(result.data))
      .catch(() => setStaff([]));
    void listRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
    void listEquipment()
      .then(setEquipment)
      .catch(() => setEquipment([]));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = fetchRangeFor(scale, date);
      const result = await getAppointmentsGrid({ startDate, endDate, groupBy });

      // Filtro de columna (oculta recursos enteros vacíos) — solo un ajuste
      // visual para AgendaGrid en escala Día (evita columnas fantasma de
      // profesionales/salas/equipos sin ninguna cita que pase el filtro).
      // La aplicación real del filtro (la que garantiza que Semana y Mes
      // también respeten Especialidad/Profesional/Sala/Equipo, no solo Día)
      // ocurre por-cita más abajo, en `filteredResources`, sin importar la
      // escala activa.
      let scopedResources = result.resources;
      if (groupBy === "PROFESSIONAL") {
        if (selectedStaffIds.length > 0) {
          scopedResources = scopedResources.filter((resource) => selectedStaffIds.includes(resource.id));
        }
        if (selectedSpecialtyIds.length > 0) {
          scopedResources = scopedResources.filter((resource) => {
            const member = staff.find((candidate) => candidate.id === resource.id);
            const specialtyId = member?.specialty?.id ?? NO_SPECIALTY_ID;
            return selectedSpecialtyIds.includes(specialtyId);
          });
        }
      } else if (groupBy === "ROOM" && selectedRoomIds.length > 0) {
        scopedResources = scopedResources.filter((resource) => selectedRoomIds.includes(resource.id));
      } else if (groupBy === "EQUIPMENT" && selectedEquipmentIds.length > 0) {
        scopedResources = scopedResources.filter((resource) => selectedEquipmentIds.includes(resource.id));
      }

      const normalizedSearch = normalizeSearch(searchQuery);

      const filteredResources = scopedResources.map((resource) => ({
        ...resource,
        appointments: resource.appointments
          .filter((appointment) => {
            if (statusFilter !== ALL_STATUSES && appointment.status !== (statusFilter as AppointmentStatus)) {
              return false;
            }
            if (selectedStaffIds.length > 0 && !selectedStaffIds.includes(appointment.staffMemberId)) return false;
            if (selectedSpecialtyIds.length > 0) {
              const member = staff.find((candidate) => candidate.id === appointment.staffMemberId);
              const specialtyId = member?.specialty?.id ?? NO_SPECIALTY_ID;
              if (!selectedSpecialtyIds.includes(specialtyId)) return false;
            }
            if (
              selectedRoomIds.length > 0 &&
              (!appointment.roomId || !selectedRoomIds.includes(appointment.roomId))
            ) {
              return false;
            }
            if (
              selectedEquipmentIds.length > 0 &&
              (!appointment.equipmentId || !selectedEquipmentIds.includes(appointment.equipmentId))
            ) {
              return false;
            }
            if (normalizedSearch) {
              const haystack = normalizeSearch(
                `${appointment.patient.firstName} ${appointment.patient.lastName} ${appointment.patient.phone ?? ""} ${appointment.service.name}`,
              );
              if (!haystack.includes(normalizedSearch)) return false;
            }
            return true;
          })
          .sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }));

      setResources(filteredResources);
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [
    date,
    scale,
    groupBy,
    staff,
    selectedStaffIds,
    selectedRoomIds,
    selectedEquipmentIds,
    selectedSpecialtyIds,
    statusFilter,
    searchQuery,
    t,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flatAppointments = useMemo(
    () => resources.flatMap((resource) => resource.appointments),
    [resources],
  );

  /** "Especialidad" no es una dimensión que el backend agrupe — se deriva
   *  en el cliente re-cubetando los mismos resources por-profesional según
   *  la especialidad de cada StaffMember (catálogo ya cargado en `staff`). */
  const specialtyColumns = useMemo(() => {
    if (grouping !== "specialty") return [];
    const byName = new Map<string, AppointmentGridResource>();
    for (const resource of resources) {
      const member = staff.find((candidate) => candidate.id === resource.id);
      const specialtyName = member?.specialty?.name ?? t("grouping.noSpecialty");
      const existing = byName.get(specialtyName);
      if (existing) {
        existing.appointments.push(...resource.appointments);
        existing.bookedMinutes += resource.bookedMinutes;
      } else {
        byName.set(specialtyName, {
          ...resource,
          id: specialtyName,
          name: specialtyName,
          color: null,
          appointments: [...resource.appointments],
        });
      }
    }
    return [...byName.values()]
      .map((entry) => ({
        ...entry,
        appointments: [...entry.appointments].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [grouping, resources, staff, t]);

  const staffOptions = useMemo<EntityFilterOption[]>(
    () => staff.map((member) => ({ id: member.id, name: `${member.firstName} ${member.lastName}` })),
    [staff],
  );
  const roomOptions = useMemo<EntityFilterOption[]>(() => rooms.map((room) => ({ id: room.id, name: room.name })), [rooms]);
  const equipmentOptions = useMemo<EntityFilterOption[]>(
    () => equipment.map((item) => ({ id: item.id, name: item.name })),
    [equipment],
  );
  const specialtyOptions = useMemo<EntityFilterOption[]>(() => {
    const byId = new Map<string, string>();
    let hasUnassigned = false;
    for (const member of staff) {
      if (member.specialty) byId.set(member.specialty.id, member.specialty.name);
      else hasUnassigned = true;
    }
    const options = [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (hasUnassigned) options.push({ id: NO_SPECIALTY_ID, name: t("grouping.noSpecialty") });
    return options;
  }, [staff, t]);

  // Columnas por recurso (drag & drop) o por especialidad solo existen en
  // escala Día — Semana/Mes siempre son la vista consolidada.
  const showResourceColumns = scale === "day" && GRID_GROUPINGS.includes(grouping);
  const showSpecialtyColumns = scale === "day" && grouping === "specialty";
  const listColumns = showSpecialtyColumns ? specialtyColumns : resources;

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of flatAppointments) {
      const key = appointment.startAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appointment);
    }
    return map;
  }, [flatAppointments]);

  const unifiedDayColumns = useMemo(() => {
    if (scale === "day") {
      return [{ date, label: shortDateEs(date), appointments: appointmentsByDate.get(date) ?? flatAppointments }];
    }
    if (scale === "week") {
      const today = todayDateOnly();
      return weekDays(date).map((day) => ({
        date: day,
        label: day === today ? `${weekdayNumberEs(day)} · ${t("today")}` : weekdayNumberEs(day),
        appointments: appointmentsByDate.get(day) ?? [],
      }));
    }
    return [];
  }, [scale, date, appointmentsByDate, flatAppointments, t]);

  const monthCells = useMemo(() => {
    if (scale !== "month") return [];
    const monthPrefix = date.slice(0, 7);
    const today = todayDateOnly();
    return monthMatrixDays(date).map((day) => ({
      date: day,
      dayNumber: Number(day.slice(8, 10)),
      inCurrentMonth: day.slice(0, 7) === monthPrefix,
      isToday: day === today,
      appointments: appointmentsByDate.get(day) ?? [],
    }));
  }, [scale, date, appointmentsByDate]);

  const rangeLabel =
    scale === "day"
      ? null
      : scale === "week"
        ? (() => {
            const days = weekDays(date);
            return `${shortDateEs(days[0])} – ${shortDateEs(days[6])}`;
          })()
        : monthYearEs(date);

  const isToday = date === todayDateOnly();
  const hasEntityFilters =
    selectedStaffIds.length > 0 ||
    selectedRoomIds.length > 0 ||
    selectedEquipmentIds.length > 0 ||
    selectedSpecialtyIds.length > 0;
  const hasFilters = hasEntityFilters || statusFilter !== ALL_STATUSES || searchQuery.trim() !== "";

  function navigate(delta: number) {
    setDate((current) =>
      scale === "day" ? addDays(current, delta) : scale === "week" ? addDays(current, delta * 7) : addMonths(current, delta),
    );
  }

  function openCreate() {
    setFormPrefill({});
    setFormOpen(true);
  }

  function openCreateAt(resourceId: string, startAtIso: string) {
    const prefill: { staffId?: string; roomId?: string; equipmentId?: string; startAt?: string } = {
      startAt: startAtIso,
    };
    if (groupBy === "PROFESSIONAL") prefill.staffId = resourceId;
    else if (groupBy === "ROOM") prefill.roomId = resourceId;
    else prefill.equipmentId = resourceId;
    setFormPrefill(prefill);
    setFormOpen(true);
  }

  /** Clic en celda vacía de la vista consolidada (spec §5.1) — no hay una
   *  columna-recurso única a la que atar la cita, así que solo se prellena
   *  la hora/fecha; el usuario elige profesional en el formulario. */
  function openCreateAtUnscoped(startAtIso: string) {
    setFormPrefill({ startAt: startAtIso });
    setFormOpen(true);
  }

  function expandDay(dateOnly: string) {
    setDate(dateOnly);
    setScale("day");
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter(ALL_STATUSES);
    setSelectedStaffIds([]);
    setSelectedRoomIds([]);
    setSelectedEquipmentIds([]);
    setSelectedSpecialtyIds([]);
  }

  /** Pestaña "Visión General (Mostrar Todo)" — a diferencia de las otras
   *  pestañas, no solo cambia el agrupador: también resetea los 4 filtros de
   *  entidad (que de otro modo siguen aplicando como filtro GLOBAL sin
   *  importar la pestaña activa, ver doc comment de la página), para que
   *  "Mostrar Todo" realmente muestre la totalidad de los registros. */
  function resetToOverview() {
    setGrouping("overview");
    setSelectedStaffIds([]);
    setSelectedRoomIds([]);
    setSelectedEquipmentIds([]);
    setSelectedSpecialtyIds([]);
  }

  async function handleDownloadTemplate() {
    try {
      await downloadAppointmentsTemplate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("downloadTemplateFailed")));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleDownloadTemplate()}>
              <Download className="mr-1.5 size-4" />
              {t("downloadTemplateButton")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp className="mr-1.5 size-4" />
              {t("importButton")}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              {t("newButton")}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <GoogleSyncIndicator />
          </div>
        </div>
      </header>

      {/* Cabecera separada en dos grupos (spec §2): izquierda = filtros de
          entidad (qué se está mirando), derecha = perspectiva temporal (cómo
          se está mirando). Cada pestaña de entidad (salvo Visión General)
          abre un popover de selección múltiple anclado debajo del botón. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
          <EntityTabButton
            label={t("grouping.overview")}
            active={grouping === "overview"}
            hasFilter={false}
            onClick={resetToOverview}
          />
          <EntityFilterPopover
            trigger={
              <EntityTabButton
                label={t("grouping.specialty")}
                active={grouping === "specialty"}
                hasFilter={selectedSpecialtyIds.length > 0}
                onClick={() => setGrouping("specialty")}
              />
            }
            options={specialtyOptions}
            selectedIds={selectedSpecialtyIds}
            onApply={setSelectedSpecialtyIds}
            open={specialtyPopoverOpen}
            onOpenChange={setSpecialtyPopoverOpen}
            emptyLabel={t("noResources.specialty")}
          />
          <EntityFilterPopover
            trigger={
              <EntityTabButton
                label={t("grouping.staff")}
                active={grouping === "staff"}
                hasFilter={selectedStaffIds.length > 0}
                onClick={() => setGrouping("staff")}
              />
            }
            options={staffOptions}
            selectedIds={selectedStaffIds}
            onApply={setSelectedStaffIds}
            open={staffPopoverOpen}
            onOpenChange={setStaffPopoverOpen}
            emptyLabel={t("noResources.staff")}
          />
          <EntityFilterPopover
            trigger={
              <EntityTabButton
                label={t("grouping.room")}
                active={grouping === "room"}
                hasFilter={selectedRoomIds.length > 0}
                onClick={() => setGrouping("room")}
              />
            }
            options={roomOptions}
            selectedIds={selectedRoomIds}
            onApply={setSelectedRoomIds}
            open={roomPopoverOpen}
            onOpenChange={setRoomPopoverOpen}
            emptyLabel={t("noResources.room")}
          />
          <EntityFilterPopover
            trigger={
              <EntityTabButton
                label={t("grouping.equipment")}
                active={grouping === "equipment"}
                hasFilter={selectedEquipmentIds.length > 0}
                onClick={() => setGrouping("equipment")}
              />
            }
            options={equipmentOptions}
            selectedIds={selectedEquipmentIds}
            onApply={setSelectedEquipmentIds}
            open={equipmentPopoverOpen}
            onOpenChange={setEquipmentPopoverOpen}
            emptyLabel={t("noResources.equipment")}
          />
        </div>

        <SegmentedControl
          value={scale}
          onChange={setScale}
          options={[
            { value: "month", label: t("scale.month") },
            { value: "week", label: t("scale.week") },
            { value: "day", label: t("scale.day") },
          ]}
          disabledHint={t("scale.soon")}
        />
      </div>

      {/* Barra de filtros (spec §3): búsqueda general + selector de fecha +
          estado. El filtro de profesional único de antes lo absorben los
          popovers de pestaña de arriba (selección múltiple, más potente). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              className="h-9 w-64 pl-8"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <DateJumpPopover
              date={date}
              onSelectDate={setDate}
              trigger={
                scale === "day" ? (
                  <div className="flex cursor-pointer items-center gap-1.5 px-1">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="w-[9.5rem] px-1 text-sm text-foreground">{date}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex min-w-[11rem] items-center justify-center gap-1.5 px-2 text-sm font-medium text-foreground"
                  >
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                    {rangeLabel}
                  </button>
                )
              }
            />
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setDate(todayDateOnly())}>
              {t("today")}
            </Button>
          )}

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? ALL_STATUSES)}>
            <SelectTrigger className="w-44">
              <SelectValue>
                {(value: string | null) =>
                  !value || value === ALL_STATUSES
                    ? t("filters.allStatuses")
                    : APPOINTMENT_STATUS_LABELS[value as AppointmentStatus]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>{t("filters.allStatuses")}</SelectItem>
              {APPOINTMENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {APPOINTMENT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 size-4" />
              {t("filters.clear")}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (showResourceColumns || showSpecialtyColumns) && listColumns.length === 0 ? (
        // Solo Día + Profesional/Sala/Equipo/Especialidad dependen de un
        // catálogo de recursos que puede estar vacío — Visión General,
        // Semana y Mes son vistas consolidadas que siempre tienen algo que
        // pintar (aunque sea "sin citas" adentro de cada columna/celda).
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <CalendarDays className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">{t(`noResources.${grouping}`)}</p>
        </div>
      ) : (
        <div
          className={cn(
            "min-h-0 flex-1 transition-opacity",
            loading ? "opacity-60" : "opacity-100",
            showSpecialtyColumns ? "overflow-x-auto" : "overflow-hidden",
          )}
        >
          {showSpecialtyColumns ? (
            <div className="flex h-full min-w-fit gap-3 pb-2">
              {listColumns.map((column) => (
                <div
                  key={column.id}
                  className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/20"
                >
                  <div className="flex items-center gap-2 border-b border-border/80 px-3 py-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: column.color ?? "var(--muted-foreground)" }}
                    />
                    <p className="truncate text-sm font-medium text-foreground">{column.name}</p>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {column.appointments.length}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {column.appointments.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">{t("noAppointments")}</p>
                    ) : (
                      column.appointments.map((appointment) => (
                        <AppointmentQuickPopover
                          key={appointment.id}
                          appointment={appointment}
                          onEdit={() => setViewing(appointment)}
                          onChanged={() => void refresh()}
                          trigger={
                            <button
                              type="button"
                              className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs shadow-sm transition-transform hover:-translate-y-0.5 ${APPOINTMENT_STATUS_COLORS[appointment.status]}`}
                            >
                              <p className="font-semibold">
                                {formatTimeUtc(appointment.startAt)}–{formatTimeUtc(appointment.endAt)}
                              </p>
                              <p className="mt-0.5 truncate font-medium text-foreground">
                                {appointment.patient.firstName} {appointment.patient.lastName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {appointment.service.name}
                              </p>
                            </button>
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : showResourceColumns ? (
            <AgendaGrid
              date={date}
              groupBy={groupBy}
              resources={resources}
              appointments={flatAppointments}
              onOpenAppointment={setViewing}
              onCreateAt={openCreateAt}
              onChanged={() => void refresh()}
            />
          ) : scale === "month" ? (
            <AgendaMonthGrid
              days={monthCells}
              onOpenAppointment={setViewing}
              onChanged={() => void refresh()}
              onExpandDay={expandDay}
            />
          ) : (
            <UnifiedAgendaGrid
              days={unifiedDayColumns}
              onOpenAppointment={setViewing}
              onCreateAt={openCreateAtUnscoped}
              onChanged={() => void refresh()}
            />
          )}
        </div>
      )}

      <AppointmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultDate={date}
        defaultStaffId={formPrefill.staffId}
        defaultRoomId={formPrefill.roomId}
        defaultEquipmentId={formPrefill.equipmentId}
        defaultStartAt={formPrefill.startAt}
        onCreated={() => void refresh()}
      />
      <AppointmentDetailDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        appointment={viewing}
        onChanged={() => void refresh()}
      />
      <AppointmentBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void refresh()}
      />
    </div>
  );
}

function EntityTabButton({
  label,
  active,
  hasFilter,
  onClick,
}: {
  label: string;
  active: boolean;
  hasFilter: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {hasFilter && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />}
    </button>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabledHint,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabledHint: string;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map((option) =>
        option.disabled ? (
          <Tooltip key={option.value}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground/50"
                >
                  {option.label}
                </button>
              }
            />
            <TooltipContent>{disabledHint}</TooltipContent>
          </Tooltip>
        ) : (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}
