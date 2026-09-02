"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPatientStats,
  listPatients,
  type PatientFilters,
  type PatientPageSize,
  type PatientStats,
} from "@/lib/patients/api";
import type { Gender, Patient } from "@/lib/validators/patient";

/** Same debounce as useStaffDirectory/useServicesCatalog. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_PAGE_SIZE: PatientPageSize = 12;

export type PatientStatusFilter = "all" | "ACTIVE" | "INACTIVE" | "BLOCKED";
export type PatientGenderFilter = "all" | Gender;

export type { PatientStats };

const EMPTY_STATS: PatientStats = { total: 0, active: 0, newThisMonth: 0 };

function toFilters(
  search: string,
  status: PatientStatusFilter,
  gender: PatientGenderFilter,
  page: number,
  pageSize: PatientPageSize,
): PatientFilters {
  return {
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    gender: gender === "all" ? undefined : gender,
    page,
    pageSize,
  };
}

export interface PatientDirectoryState {
  patients: Patient[];
  stats: PatientStats;
  loading: boolean;
  /** True only on the first load, so filtering does not blank the table. */
  initialLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  status: PatientStatusFilter;
  setStatus: (value: PatientStatusFilter) => void;
  gender: PatientGenderFilter;
  setGender: (value: PatientGenderFilter) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: PatientPageSize;
  setPageSize: (value: PatientPageSize) => void;
  total: number;
  totalPages: number;
  refresh: () => Promise<void>;
}

/**
 * Loads the patient directory and keeps it in step with the filters — same
 * shape as useStaffDirectory (hooks/use-staff.ts). Filtering happens on the
 * SERVER (GET /patients takes search/status/page/pageSize), so this keeps
 * working once a centre has more pacientes than fit comfortably in memory.
 *
 * `stats` (spec: "Total pacientes, Activos, Nuevos este mes") are centre-wide
 * counts, not filtered by `search`/`status` — they're refreshed alongside the
 * table on every `refresh()` (mount, and after any create/edit/delete/import)
 * but never by typing in the search box, since a "cuántos pacientes activos
 * tengo" tile that changes while you search would read as a bug, not a filter.
 */
export function usePatientDirectory(): PatientDirectoryState {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<PatientStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<PatientStatusFilter>("all");
  const [gender, setGenderState] = useState<PatientGenderFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PatientPageSize>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setStatus = useCallback((value: PatientStatusFilter) => {
    setStatusState(value);
    setPage(1);
  }, []);
  const setGender = useCallback((value: PatientGenderFilter) => {
    setGenderState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((value: PatientPageSize) => {
    setPageSizeState(value);
    setPage(1);
  }, []);

  /** Guards against out-of-order responses — same pattern as
   *  useStaffDirectory's requestId. */
  const requestId = useRef(0);

  const load = useCallback(async (filters: PatientFilters) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listPatients(filters);
      if (id !== requestId.current) return;
      setPatients(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      setError("No se pudo cargar el listado de pacientes.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getPatientStats());
    } catch {
      // Non-fatal: the table still renders, the stat tiles just stay at 0.
      setStats(EMPTY_STATS);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([load(toFilters(search, status, gender, page, pageSize)), loadStats()]);
  }, [load, loadStats, search, status, gender, page, pageSize]);

  useEffect(() => {
    void loadStats();
    // Solo al montar — ver el doc comment de `stats` arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, status, gender, page, pageSize));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, status, gender, page, pageSize]);

  return {
    patients,
    stats,
    loading,
    initialLoading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    gender,
    setGender,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    refresh,
  };
}
