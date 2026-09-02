"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, Target, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProspectDetailDrawer } from "@/components/marketing/prospect-detail-drawer";
import {
  type ProspectSourceFilter,
  type ProspectStatusFilter,
  useProspectDirectory,
} from "@/hooks/use-prospects";
import {
  PROSPECT_PAGE_SIZES,
  PROSPECT_STATUS_BADGE_VARIANT,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUSES,
  SOURCE_PROVIDER_LABELS,
  type Prospect,
} from "@/lib/prospects/api";
import { SOCIAL_CHANNEL_PROVIDERS } from "@/lib/social-channels/api";

const STATUS_OPTIONS: ProspectStatusFilter[] = ["all", ...PROSPECT_STATUSES];
const SOURCE_OPTIONS: ProspectSourceFilter[] = ["all", ...SOCIAL_CHANNEL_PROVIDERS];

/**
 * /marketing/prospectos — Módulo 11, Fase 3. Tabla + filtros (spec RF-2:
 * "Búsqueda, filtrado por estado... y por origen de canal") — click en una
 * fila abre `ProspectDetailDrawer` con las respuestas del formulario y las
 * acciones de estado/conversión.
 */
export default function ProspectsPage() {
  const t = useTranslations("Prospects");
  const directory = useProspectDirectory();
  const [viewing, setViewing] = useState<Prospect | null>(null);

  const hasFilters = directory.search.trim() !== "" || directory.status !== "all" || directory.source !== "all";

  function clearFilters() {
    directory.setSearch("");
    directory.setStatus("all");
    directory.setSource("all");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={directory.search}
            onChange={(event) => directory.setSearch(event.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            className="pl-9"
            aria-label={t("filters.searchPlaceholder")}
          />
        </div>

        <Select
          value={directory.status}
          onValueChange={(value) => directory.setStatus((value as ProspectStatusFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {(value: ProspectStatusFilter | null) =>
                !value || value === "all" ? t("filters.status.all") : PROSPECT_STATUS_LABELS[value]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? t("filters.status.all") : PROSPECT_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={directory.source}
          onValueChange={(value) => directory.setSource((value as ProspectSourceFilter | null) ?? "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: ProspectSourceFilter | null) =>
                !value || value === "all" ? t("filters.source.all") : SOURCE_PROVIDER_LABELS[value]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? t("filters.source.all") : SOURCE_PROVIDER_LABELS[option]}
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

      {directory.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{directory.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void directory.refresh()}>
            {t("retry")}
          </Button>
        </div>
      ) : directory.initialLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : directory.prospects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Target className="size-7 text-primary" />
          </div>
          <div className="max-w-sm">
            <h2 className="text-base font-semibold text-foreground">
              {hasFilters ? t("empty.filteredTitle") : t("empty.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters ? t("empty.filteredDescription") : t("empty.description")}
            </p>
          </div>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t("filters.clear")}
            </Button>
          )}
        </div>
      ) : (
        <div className={directory.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.contact")}</TableHead>
                  <TableHead>{t("table.source")}</TableHead>
                  <TableHead>{t("table.campaign")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.createdAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.prospects.map((prospect) => (
                  <TableRow
                    key={prospect.id}
                    className="cursor-pointer"
                    onClick={() => setViewing(prospect)}
                  >
                    <TableCell className="font-medium text-foreground">{prospect.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{prospect.phone}</span>
                        {prospect.email && (
                          <span className="text-xs text-muted-foreground/80">{prospect.email}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SOURCE_PROVIDER_LABELS[prospect.sourceProvider]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prospect.campaignName || t("table.noCampaign")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PROSPECT_STATUS_BADGE_VARIANT[prospect.status]}>
                        {PROSPECT_STATUS_LABELS[prospect.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(prospect.createdAt).toLocaleDateString("es-PE")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("resultCount", { count: directory.total })}</p>
            <Pagination
              page={directory.page}
              totalPages={directory.totalPages}
              pageSize={directory.pageSize}
              pageSizeOptions={PROSPECT_PAGE_SIZES}
              onPageChange={directory.setPage}
              onPageSizeChange={directory.setPageSize}
              perPageLabel={t("pagination.perPage")}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </div>
      )}

      <ProspectDetailDrawer
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        prospect={viewing}
        onChanged={() => {
          void directory.refresh();
          // Refleja el cambio (estado, conversión) sin cerrar el drawer de
          // inmediato — mismo criterio que StaffFormDialog al editar: el
          // usuario ve el resultado antes de que se cierre solo.
          setViewing((current) =>
            current ? (directory.prospects.find((p) => p.id === current.id) ?? current) : current,
          );
        }}
      />
    </div>
  );
}
