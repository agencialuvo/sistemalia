"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConciergeBell, Loader2, Search } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiErrorMessage } from "@/lib/api";
import {
  bulkSyncServiceMatrix,
  getStaffServiceMatrix,
  type ServiceMatrixData,
} from "@/lib/staff/api";
import {
  COMMISSION_SOURCE_LABELS,
  COMMISSION_TYPE_LABELS,
  COMMISSION_TYPES,
  formatCommissionValue,
  resolveCommission,
  type CommissionType,
} from "@/lib/validators/staff";
import { cn } from "@/lib/utils";

/** "1. Por Profesional" pivots on doctores (assign services to a doctor);
 *  "2. Por Servicio" pivots on servicios (assign doctors to a service). Both
 *  perspectives edit the exact same underlying StaffService pairs — switching
 *  tabs never discards pending changes, it only changes which axis is the
 *  master list. */
type Perspective = "staff" | "service";

/** Sentinel for "todas las especialidades/categorías" — never collides with
 *  a real uuid, same convention used across the app's other filter Selects. */
const ALL_FILTER_SENTINEL = "__all__";

const DEBOUNCE_MS = 300;

/** One row of the master list, shape-normalised regardless of perspective —
 *  lets the left panel and its search/filter logic stay perspective-agnostic. */
interface MasterItem {
  id: string;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  /** specialty.id (staff) or category.id (service) — drives the filter Select. */
  filterId: string | null;
}

function keyFor(staffMemberId: string, serviceId: string): string {
  return `${staffMemberId}:${serviceId}`;
}

/** Working draft of one pair's comisión — mirrors the form's string-based
 *  numeric fields (validators/staff.ts's ServiceAssignmentInput) so the
 *  input can be edited freely before being parsed on save. */
interface CommissionDraft {
  type: CommissionType | "";
  value: string;
}

const EMPTY_COMMISSION_DRAFT: CommissionDraft = { type: "", value: "" };

/**
 * Vista Dividida / Pivotable (Master-Detail) para la asignación masiva
 * Doctores <-> Servicios (Engine de Disponibilidad, inspirado en
 * JetAppointment). Reemplaza la grilla matricial: el panel izquierdo lista
 * profesionales o servicios (según la pestaña activa) y el derecho gestiona
 * las asignaciones del elemento seleccionado como chips removibles. Reusable
 * from both /personal and /servicios: the relationship it edits (StaffService)
 * belongs to neither page alone.
 */
export function StaffServiceMatrixDialog({
  open,
  onOpenChange,
  onSaved,
  initialPerspective = "staff",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful save so both pages' lists can refresh their
   *  "servicios habilitados" counters. */
  onSaved: () => void;
  /** Con qué pestaña abre el diálogo — cada página lo llama con la
   *  perspectiva que tiene sentido desde ahí: Personal abre "Por
   *  Profesional", Servicios abre "Por Servicio". Default "staff" para no
   *  romper otros llamadores que no la pasen. */
  initialPerspective?: Perspective;
}) {
  const t = useTranslations("StaffServiceMatrix");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ServiceMatrixData | null>(null);

  // Pending assignments — the single source of truth both perspectives read
  // and write. `originalChecked` is a frozen snapshot of what the server had
  // on load, used only to badge a chip "Nuevo" (spec §3.B) without needing a
  // second round trip.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [originalChecked, setOriginalChecked] = useState<Set<string>>(new Set());

  // Comisión por par (spec §3.B: "editar la comisión en las etiquetas/chips
  // de los elementos asignados") — `commissionDrafts` seeds from the server
  // on load; `touchedCommission` tracks which pairs the user actually edited,
  // since the bulk-matrix endpoint treats an omitted commission as "leave it
  // alone" (see BulkServiceMatrixEntry's doc comment) rather than "clear it".
  const [commissionDrafts, setCommissionDrafts] = useState<Map<string, CommissionDraft>>(new Map());
  const [touchedCommission, setTouchedCommission] = useState<Set<string>>(new Set());

  const [perspective, setPerspective] = useState<Perspective>("staff");
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);

  const [masterSearchInput, setMasterSearchInput] = useState("");
  const [masterSearch, setMasterSearch] = useState("");
  const [masterFilter, setMasterFilter] = useState("");

  const [detailSearchInput, setDetailSearchInput] = useState("");
  const [detailSearch, setDetailSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPerspective(initialPerspective);
    setSelectedMasterId(null);
    setMasterSearchInput("");
    setMasterSearch("");
    setMasterFilter("");
    setDetailSearchInput("");
    setDetailSearch("");
    setCommissionDrafts(new Map());
    setTouchedCommission(new Set());
    getStaffServiceMatrix()
      .then((result) => {
        setData(result);
        const pairs = new Set(result.assignments.map((a) => keyFor(a.staffMemberId, a.serviceId)));
        setChecked(pairs);
        setOriginalChecked(new Set(pairs));
        setCommissionDrafts(
          new Map(
            result.assignments
              .filter((a) => a.customCommissionType !== null)
              .map((a) => [
                keyFor(a.staffMemberId, a.serviceId),
                { type: a.customCommissionType as CommissionType, value: a.customCommissionValue ?? "" },
              ]),
          ),
        );
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error, t("loadFailed")));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [open, t, initialPerspective]);

  // Debounced master search (spec §2: "input de búsqueda con debounce") —
  // the visible field updates instantly, the filter query lags by 300ms.
  useEffect(() => {
    const handle = setTimeout(() => setMasterSearch(masterSearchInput), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [masterSearchInput]);

  useEffect(() => {
    const handle = setTimeout(() => setDetailSearch(detailSearchInput), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [detailSearchInput]);

  function switchPerspective(next: Perspective) {
    if (next === perspective) return;
    setPerspective(next);
    setSelectedMasterId(null);
    setMasterSearchInput("");
    setMasterSearch("");
    setMasterFilter("");
    setDetailSearchInput("");
    setDetailSearch("");
  }

  function selectMaster(id: string) {
    setSelectedMasterId(id);
    setDetailSearchInput("");
    setDetailSearch("");
  }

  const isAssigned = useCallback(
    (masterId: string, detailId: string) => {
      const key = perspective === "staff" ? keyFor(masterId, detailId) : keyFor(detailId, masterId);
      return checked.has(key);
    },
    [checked, perspective],
  );

  const isPendingNew = useCallback(
    (masterId: string, detailId: string) => {
      const key = perspective === "staff" ? keyFor(masterId, detailId) : keyFor(detailId, masterId);
      return checked.has(key) && !originalChecked.has(key);
    },
    [checked, originalChecked, perspective],
  );

  function toggleAssignment(masterId: string, detailId: string) {
    const key = perspective === "staff" ? keyFor(masterId, detailId) : keyFor(detailId, masterId);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pairKey(masterId: string, detailId: string): string {
    return perspective === "staff" ? keyFor(masterId, detailId) : keyFor(detailId, masterId);
  }

  function getCommissionDraft(masterId: string, detailId: string): CommissionDraft {
    return commissionDrafts.get(pairKey(masterId, detailId)) ?? EMPTY_COMMISSION_DRAFT;
  }

  /** Nivel 2 (base del servicio) y nivel 3 (default del profesional) para el
   *  par (masterId, detailId), resueltos vía resolveCommission — el custom
   *  (nivel 1) se ignora aquí a propósito: esto es "lo que aplicaría si NO
   *  se personaliza", mostrado junto al botón "Personalizar". */
  function getInheritedCommission(masterId: string, detailId: string) {
    if (!data) return null;
    const staffMemberId = perspective === "staff" ? masterId : detailId;
    const serviceId = perspective === "staff" ? detailId : masterId;
    const staffMember = data.staffMembers.find((member) => member.id === staffMemberId);
    const service = data.services.find((candidate) => candidate.id === serviceId);
    return resolveCommission(
      { type: null, value: null },
      { type: service?.baseCommissionType ?? null, value: service?.baseCommissionValue ?? null },
      {
        type: staffMember?.defaultCommissionType ?? null,
        value: staffMember?.defaultCommissionValue ?? null,
      },
    );
  }

  /** Backs the "Personalizar comisión" switch — turning it on seeds a draft
   *  (Select defaults to PERCENTAGE) revealing the Select/Input pair; turning
   *  it off drops the draft and falls back to showing the inherited value.
   *  Per the bulk-matrix endpoint's contract there is no "clear" capability
   *  (an omitted commission on save just leaves whatever the pair already
   *  had), so switching off cannot erase a commission already persisted from
   *  a previous save — only cancels an in-progress edit. */
  function setCommissionCustomization(masterId: string, detailId: string, enabled: boolean) {
    const key = pairKey(masterId, detailId);
    setCommissionDrafts((current) => {
      const next = new Map(current);
      if (enabled) next.set(key, next.get(key)?.type ? next.get(key)! : { type: "PERCENTAGE", value: "" });
      else next.delete(key);
      return next;
    });
    setTouchedCommission((current) => new Set(current).add(key));
  }

  function updateCommissionDraft(masterId: string, detailId: string, patch: Partial<CommissionDraft>) {
    const key = pairKey(masterId, detailId);
    setCommissionDrafts((current) => {
      const next = new Map(current);
      next.set(key, { ...(next.get(key) ?? EMPTY_COMMISSION_DRAFT), ...patch });
      return next;
    });
    setTouchedCommission((current) => new Set(current).add(key));
  }

  // ---------------------------------------------------------------------
  // Master list (Panel Izquierdo)
  // ---------------------------------------------------------------------

  const masterItems = useMemo<MasterItem[]>(() => {
    if (!data) return [];
    if (perspective === "staff") {
      return data.staffMembers.map((member) => ({
        id: member.id,
        title: `${member.firstName} ${member.lastName}`,
        subtitle: member.specialty?.name ?? null,
        avatarUrl: member.avatarUrl,
        filterId: member.specialty?.id ?? null,
      }));
    }
    return data.services.map((service) => ({
      id: service.id,
      title: service.name,
      subtitle: service.category?.name ?? null,
      avatarUrl: null,
      filterId: service.category?.id ?? null,
    }));
  }, [data, perspective]);

  const masterFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of masterItems) {
      if (item.filterId && item.subtitle) seen.set(item.filterId, item.subtitle);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [masterItems]);

  const countFor = useCallback(
    (masterId: string) => {
      if (!data) return 0;
      if (perspective === "staff") {
        return data.services.filter((service) => isAssigned(masterId, service.id)).length;
      }
      return data.staffMembers.filter((member) => isAssigned(masterId, member.id)).length;
    },
    [data, perspective, isAssigned],
  );

  const filteredMasterItems = useMemo(() => {
    const query = masterSearch.trim().toLowerCase();
    return masterItems.filter((item) => {
      const matchesSearch = !query || item.title.toLowerCase().includes(query);
      const matchesFilter = !masterFilter || item.filterId === masterFilter;
      return matchesSearch && matchesFilter;
    });
  }, [masterItems, masterSearch, masterFilter]);

  // ---------------------------------------------------------------------
  // Detail workspace (Panel Derecho)
  // ---------------------------------------------------------------------

  const detailItems = useMemo(() => {
    if (!data) return [];
    if (perspective === "staff") {
      return data.services.map((service) => ({
        id: service.id,
        title: service.name,
        subtitle: service.category?.name ?? null,
        avatarUrl: null as string | null,
      }));
    }
    return data.staffMembers.map((member) => ({
      id: member.id,
      title: `${member.firstName} ${member.lastName}`,
      subtitle: member.specialty?.name ?? null,
      avatarUrl: member.avatarUrl,
    }));
  }, [data, perspective]);

  // Single combined list for the Panel Derecho inspector — assigned items
  // float to the top so the switch/checkbox affordances stay visible without
  // scrolling, everything else (search) applies across both assigned and
  // unassigned items alike, replacing the old two-section "current" /
  // "add new" split.
  const filteredDetailItems = useMemo(() => {
    if (!selectedMasterId) return [];
    const query = detailSearch.trim().toLowerCase();
    const matches = detailItems.filter(
      (item) => !query || item.title.toLowerCase().includes(query),
    );
    return [...matches].sort((a, b) => {
      const assignedA = isAssigned(selectedMasterId, a.id);
      const assignedB = isAssigned(selectedMasterId, b.id);
      return assignedA === assignedB ? 0 : assignedA ? -1 : 1;
    });
  }, [detailItems, selectedMasterId, detailSearch, isAssigned]);

  const hasUnassignedFiltered = useMemo(
    () =>
      !!selectedMasterId &&
      filteredDetailItems.some((item) => !isAssigned(selectedMasterId, item.id)),
    [filteredDetailItems, selectedMasterId, isAssigned],
  );

  const hasAssignedFiltered = useMemo(
    () =>
      !!selectedMasterId &&
      filteredDetailItems.some((item) => isAssigned(selectedMasterId, item.id)),
    [filteredDetailItems, selectedMasterId, isAssigned],
  );

  function selectAllFiltered() {
    if (!selectedMasterId) return;
    setChecked((current) => {
      const next = new Set(current);
      for (const item of filteredDetailItems) {
        if (isAssigned(selectedMasterId, item.id)) continue;
        next.add(
          perspective === "staff"
            ? keyFor(selectedMasterId, item.id)
            : keyFor(item.id, selectedMasterId),
        );
      }
      return next;
    });
  }

  function deselectAll() {
    if (!selectedMasterId) return;
    setChecked((current) => {
      const next = new Set(current);
      for (const item of filteredDetailItems) {
        if (!isAssigned(selectedMasterId, item.id)) continue;
        next.delete(
          perspective === "staff"
            ? keyFor(selectedMasterId, item.id)
            : keyFor(item.id, selectedMasterId),
        );
      }
      return next;
    });
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const assignments = [...checked].map((key) => {
        const [staffMemberId, serviceId] = key.split(":");
        // Commission fields are included only for pairs the user actually
        // edited this session (touchedCommission) — omitted otherwise, so
        // the backend leaves whatever commission that pair already had
        // untouched (see BulkServiceMatrixEntry's doc comment).
        const draft = touchedCommission.has(key) ? commissionDrafts.get(key) : undefined;
        if (draft?.type && draft.value.trim() !== "") {
          return {
            staffMemberId,
            serviceId,
            customCommissionType: draft.type,
            customCommissionValue: Number(draft.value.replace(",", ".")),
          };
        }
        return { staffMemberId, serviceId };
      });
      const result = await bulkSyncServiceMatrix(
        data.services.map((service) => service.id),
        assignments,
      );
      toast.success(t("saved", { assigned: result.assigned }));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  const selectedMaster = masterItems.find((item) => item.id === selectedMasterId) ?? null;
  const hasPrerequisites = !!data && data.staffMembers.length > 0 && data.services.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Pestañas de Perspectiva / pivotMode (spec §1) */}
        <Tabs
          value={perspective}
          onValueChange={(value) => switchPerspective(value as Perspective)}
          className="shrink-0 border-b border-border/80 px-6 py-3"
        >
          <TabsList>
            <TabsTrigger value="staff">{t("perspective.staff")}</TabsTrigger>
            <TabsTrigger value="service">{t("perspective.service")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex flex-1 justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasPrerequisites ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("emptyPrerequisite")}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Panel Izquierdo — Lista Máster / Fuente (spec §2) */}
            <div className="flex w-64 shrink-0 flex-col border-r border-border/80">
              <div className="shrink-0 space-y-2 border-b border-border/80 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={masterSearchInput}
                    onChange={(event) => setMasterSearchInput(event.target.value)}
                    placeholder={t(`searchPlaceholder.${perspective}`)}
                    className="pl-9"
                  />
                </div>
                {masterFilterOptions.length > 0 && (
                  <Select
                    value={masterFilter || ALL_FILTER_SENTINEL}
                    onValueChange={(value) =>
                      setMasterFilter(!value || value === ALL_FILTER_SENTINEL ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t(`filterAll.${perspective}`)}>
                        {(value: string | null) =>
                          !value || value === ALL_FILTER_SENTINEL
                            ? t(`filterAll.${perspective}`)
                            : (masterFilterOptions.find((option) => option.id === value)?.name ??
                              t(`filterAll.${perspective}`))
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTER_SENTINEL}>
                        {t(`filterAll.${perspective}`)}
                      </SelectItem>
                      {masterFilterOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {filteredMasterItems.length === 0 ? (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    {t("noMasterMatch")}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filteredMasterItems.map((item) => {
                      const count = countFor(item.id);
                      const active = item.id === selectedMasterId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectMaster(item.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                              active
                                ? "border-primary bg-primary/5"
                                : "border-transparent hover:bg-muted/60",
                            )}
                          >
                            {perspective === "staff" ? (
                              <Avatar size="sm" className="shrink-0">
                                {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt="" /> : null}
                                <AvatarFallback>{item.title[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                            ) : (
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                                <ConciergeBell className="size-3.5 text-muted-foreground" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                            <Badge variant={count > 0 ? "default" : "secondary"} className="shrink-0">
                              {count}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Panel Derecho — Espacio de Trabajo / Destino (spec §3) */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!selectedMaster ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t(`selectPrompt.${perspective}`)}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selectedMaster.title}</h3>
                    {selectedMaster.subtitle && (
                      <p className="text-xs text-muted-foreground">{selectedMaster.subtitle}</p>
                    )}
                  </div>

                  {/* Inspector unificado: checkbox de asignación + comisión inline
                      por ítem, con búsqueda que funciona como combobox rápido
                      para agregar nuevos elementos (spec §1, Panel Derecho). */}
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`detailListTitle.${perspective}`)}
                      </h4>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllFiltered}
                          disabled={!hasUnassignedFiltered}
                        >
                          {t("selectAllFiltered")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={deselectAll}
                          disabled={!hasAssignedFiltered}
                        >
                          {t("deselectAll")}
                        </Button>
                      </div>
                    </div>

                    <div className="relative mb-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={detailSearchInput}
                        onChange={(event) => setDetailSearchInput(event.target.value)}
                        placeholder={t(`detailSearchPlaceholder.${perspective}`)}
                        className="pl-9"
                      />
                    </div>

                    {filteredDetailItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noDetailMatch")}</p>
                    ) : (
                      <ul className="max-h-[26rem] space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                        {filteredDetailItems.map((item) => {
                          const assigned = isAssigned(selectedMaster.id, item.id);
                          const draft = getCommissionDraft(selectedMaster.id, item.id);
                          const inherited =
                            assigned && !draft.type
                              ? getInheritedCommission(selectedMaster.id, item.id)
                              : null;
                          return (
                            <li
                              key={item.id}
                              className={cn(
                                "rounded-md px-2 py-1.5 transition-colors",
                                assigned ? "bg-primary/5" : "hover:bg-muted/60",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={assigned}
                                  onCheckedChange={() => toggleAssignment(selectedMaster.id, item.id)}
                                  aria-label={t("toggleAssignment", { name: item.title })}
                                />
                                {perspective === "service" ? (
                                  <Avatar size="sm" className="shrink-0">
                                    {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt="" /> : null}
                                    <AvatarFallback>{item.title[0]?.toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                ) : (
                                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <ConciergeBell className="size-3.5 text-muted-foreground" />
                                  </span>
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-foreground">
                                    {item.title}
                                  </span>
                                  {item.subtitle && (
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {item.subtitle}
                                    </span>
                                  )}
                                </span>
                                {isPendingNew(selectedMaster.id, item.id) && (
                                  <Badge variant="default" className="h-4 shrink-0 px-1.5 text-[10px]">
                                    {t("newBadge")}
                                  </Badge>
                                )}
                              </div>

                              {assigned && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
                                  <Switch
                                    checked={!!draft.type}
                                    onCheckedChange={(checked) =>
                                      setCommissionCustomization(selectedMaster.id, item.id, checked)
                                    }
                                  />
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {t("customizeCommissionLabel")}
                                  </span>

                                  {draft.type ? (
                                    <>
                                      <Select
                                        value={draft.type}
                                        onValueChange={(value) =>
                                          updateCommissionDraft(selectedMaster.id, item.id, {
                                            type: value as CommissionType,
                                          })
                                        }
                                      >
                                        <SelectTrigger className="h-6 w-16 px-1.5 text-[11px]">
                                          <SelectValue>
                                            {(value: string | null) =>
                                              COMMISSION_TYPE_LABELS[
                                                (value as CommissionType) ?? "PERCENTAGE"
                                              ]
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
                                      <Input
                                        value={draft.value}
                                        onChange={(event) =>
                                          updateCommissionDraft(selectedMaster.id, item.id, {
                                            value: event.target.value,
                                          })
                                        }
                                        inputMode="decimal"
                                        placeholder={draft.type === "PERCENTAGE" ? "10" : "0.00"}
                                        className="h-6 w-16 px-1.5 text-[11px]"
                                        aria-label={t("commissionValueLabel")}
                                      />
                                    </>
                                  ) : (
                                    inherited && (
                                      <span
                                        className="text-[11px] font-normal text-muted-foreground"
                                        title={COMMISSION_SOURCE_LABELS[inherited.source]}
                                      >
                                        {formatCommissionValue(inherited.type, inherited.value)} ·{" "}
                                        {COMMISSION_SOURCE_LABELS[inherited.source]}
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 flex-col items-stretch gap-3 border-t border-border/80 px-6 py-4 sm:flex-col sm:items-stretch">
          <p className="text-xs text-muted-foreground">{t("accumulationNote")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving || loading || !data}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
