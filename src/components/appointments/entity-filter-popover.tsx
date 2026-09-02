"use client";

import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface EntityFilterOption {
  id: string;
  name: string;
}

/**
 * Popover de filtrado multi-selección (spec §2): buscador + checkboxes +
 * Cancelar/Aplicar Filtro. Reutilizado por las pestañas Especialidad, Por
 * Profesional, Sala/Box y Equipo — cada una le pasa su propio catálogo de
 * opciones. Selección vacía = "sin filtro" (se muestran todas las
 * entidades), misma semántica que el filtro de profesional que reemplaza.
 *
 * El popover trabaja sobre una selección en borrador (`draft`) que solo se
 * confirma con "Aplicar Filtro" — "Cancelar" descarta los cambios sin tocar
 * `selectedIds`, para que abrir el popover y cerrarlo sin querer nunca
 * altere el filtro activo.
 */
export function EntityFilterPopover({
  trigger,
  options,
  selectedIds,
  onApply,
  open,
  onOpenChange,
  emptyLabel,
}: {
  trigger: ReactElement;
  options: EntityFilterOption[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emptyLabel: string;
}) {
  const t = useTranslations("Appointments.entityFilter");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>(selectedIds);

  /** Reinicia el borrador al abrir (en vez de un useEffect sincronizando
   *  `open`) para no disparar un set-state dentro de un efecto — el reset
   *  solo debe ocurrir en respuesta a la interacción que abre el popover. */
  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(selectedIds);
      setSearch("");
    }
    onOpenChange(next);
  }

  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredOptions = normalizedSearch
    ? options.filter((option) => option.name.toLocaleLowerCase("es").includes(normalizedSearch))
    : options;

  function toggle(id: string, checked: boolean) {
    setDraft((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  function handleApply() {
    onApply(draft);
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  /** Limpia la selección y aplica de inmediato — atajo para volver a "sin
   *  filtro" (= se muestran todas las entidades) sin desmarcar cada checkbox
   *  a mano. */
  function handleShowAll() {
    setDraft([]);
    onApply([]);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-72" sideOffset={8}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-8 pl-8"
            autoFocus
          />
        </div>

        <button
          type="button"
          onClick={handleShowAll}
          className="mt-1.5 flex w-full items-center rounded-md px-1.5 py-1.5 text-left text-sm font-medium text-primary hover:bg-muted/50"
        >
          {t("showAll")}
        </button>

        <ScrollArea className="max-h-64">
          <div className="space-y-0.5 pr-2">
            {options.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t("noMatches")}</p>
            ) : (
              filteredOptions.map((option) => {
                const id = `entity-filter-${option.id}`;
                const checked = draft.includes(option.id);
                return (
                  <div
                    key={option.id}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => toggle(option.id, value === true)}
                    />
                    <Label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm font-normal">
                      {option.name}
                    </Label>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 border-t border-border/80 pt-2.5">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleApply}>
            {t("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
