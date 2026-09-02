"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listProspects,
  type Prospect,
  type ProspectFilters,
  type ProspectPageSize,
  type ProspectStatus,
} from "@/lib/prospects/api";
import type { SocialChannelProvider } from "@/lib/social-channels/api";

/** Same debounce as useStaffDirectory/usePatientDirectory. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_PAGE_SIZE: ProspectPageSize = 12;

export type ProspectStatusFilter = "all" | ProspectStatus;
export type ProspectSourceFilter = "all" | SocialChannelProvider;

function toFilters(
  search: string,
  status: ProspectStatusFilter,
  source: ProspectSourceFilter,
  page: number,
  pageSize: ProspectPageSize,
): ProspectFilters {
  return {
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    sourceProvider: source === "all" ? undefined : source,
    page,
    pageSize,
  };
}

export interface ProspectDirectoryState {
  prospects: Prospect[];
  loading: boolean;
  /** True only on the first load, so filtering does not blank the table. */
  initialLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  status: ProspectStatusFilter;
  setStatus: (value: ProspectStatusFilter) => void;
  source: ProspectSourceFilter;
  setSource: (value: ProspectSourceFilter) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: ProspectPageSize;
  setPageSize: (value: ProspectPageSize) => void;
  total: number;
  totalPages: number;
  refresh: () => Promise<void>;
}

/** Loads the prospects directory and keeps it in step with the filters —
 *  same shape as usePatientDirectory (hooks/use-patients.ts). Filtering
 *  happens on the SERVER (GET /marketing/prospects takes search/status/
 *  sourceProvider/page/pageSize). */
export function useProspectDirectory(): ProspectDirectoryState {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<ProspectStatusFilter>("all");
  const [source, setSourceState] = useState<ProspectSourceFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<ProspectPageSize>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setStatus = useCallback((value: ProspectStatusFilter) => {
    setStatusState(value);
    setPage(1);
  }, []);
  const setSource = useCallback((value: ProspectSourceFilter) => {
    setSourceState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((value: ProspectPageSize) => {
    setPageSizeState(value);
    setPage(1);
  }, []);

  /** Guards against out-of-order responses — same pattern as
   *  usePatientDirectory's requestId. */
  const requestId = useRef(0);

  const load = useCallback(async (filters: ProspectFilters) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listProspects(filters);
      if (id !== requestId.current) return;
      setProspects(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      setError("No se pudo cargar el listado de prospectos.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(toFilters(search, status, source, page, pageSize));
  }, [load, search, status, source, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, status, source, page, pageSize));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, status, source, page, pageSize]);

  return {
    prospects,
    loading,
    initialLoading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    source,
    setSource,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    refresh,
  };
}
