"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listSpecialties, listStaff, type StaffFilters, type StaffPageSize } from "@/lib/staff/api";
import type { Specialty, StaffMember } from "@/lib/validators/staff";

/** Same debounce as useServicesCatalog (hooks/use-services.ts) — keystrokes
 *  settle before the request goes out. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_PAGE_SIZE: StaffPageSize = 12;

export type StaffStatusFilter = "all" | "active" | "inactive";

export interface StaffDirectoryState {
  staff: StaffMember[];
  specialties: Specialty[];
  loading: boolean;
  /** True only on the first load, so filtering does not blank the grid. */
  initialLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  specialtyId: string;
  setSpecialtyId: (value: string) => void;
  serviceId: string;
  setServiceId: (value: string) => void;
  status: StaffStatusFilter;
  setStatus: (value: StaffStatusFilter) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: StaffPageSize;
  setPageSize: (value: StaffPageSize) => void;
  total: number;
  totalPages: number;
  refresh: () => Promise<void>;
  refreshSpecialties: () => Promise<void>;
}

function toFilters(
  search: string,
  specialtyId: string,
  serviceId: string,
  status: StaffStatusFilter,
  page: number,
  pageSize: StaffPageSize,
): StaffFilters {
  return {
    search: search.trim() || undefined,
    specialtyId: specialtyId || undefined,
    serviceId: serviceId || undefined,
    isActive: status === "all" ? undefined : status === "active",
    page,
    pageSize,
  };
}

/**
 * Loads the staff directory and keeps it in step with the filters.
 *
 * Filtering happens on the SERVER (GET /staff takes specialtyId/serviceId/
 * search/isActive), same reasoning as useServicesCatalog: it keeps working
 * once a centre has more professionals than fit comfortably in memory, and
 * matches the same search the backend uses.
 */
export function useStaffDirectory(): StaffDirectoryState {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [specialtyId, setSpecialtyIdState] = useState("");
  const [serviceId, setServiceIdState] = useState("");
  const [status, setStatusState] = useState<StaffStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<StaffPageSize>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Same reasoning as useServicesCatalog: narrowing what's filtered/sized can
  // invalidate the current page number, so every one of these resets back to
  // page 1.
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setSpecialtyId = useCallback((value: string) => {
    setSpecialtyIdState(value);
    setPage(1);
  }, []);
  const setServiceId = useCallback((value: string) => {
    setServiceIdState(value);
    setPage(1);
  }, []);
  const setStatus = useCallback((value: StaffStatusFilter) => {
    setStatusState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((value: StaffPageSize) => {
    setPageSizeState(value);
    setPage(1);
  }, []);

  /** Guards against out-of-order responses — same pattern as
   *  useServicesCatalog's requestId. */
  const requestId = useRef(0);

  const load = useCallback(async (filters: StaffFilters) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listStaff(filters);
      if (id !== requestId.current) return;
      setStaff(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      setError("No se pudo cargar el personal del centro.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const refreshSpecialties = useCallback(async () => {
    try {
      setSpecialties(await listSpecialties());
    } catch {
      // Non-fatal: the grid still renders, the specialty filter is just empty.
      setSpecialties([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      load(toFilters(search, specialtyId, serviceId, status, page, pageSize)),
      refreshSpecialties(),
    ]);
  }, [load, refreshSpecialties, search, specialtyId, serviceId, status, page, pageSize]);

  useEffect(() => {
    void refreshSpecialties();
  }, [refreshSpecialties]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, specialtyId, serviceId, status, page, pageSize));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, specialtyId, serviceId, status, page, pageSize]);

  return {
    staff,
    specialties,
    loading,
    initialLoading,
    error,
    search,
    setSearch,
    specialtyId,
    setSpecialtyId,
    serviceId,
    setServiceId,
    status,
    setStatus,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    refresh,
    refreshSpecialties,
  };
}
