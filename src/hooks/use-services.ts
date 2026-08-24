"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCategories,
  listServices,
  type ServiceFilters,
  type ServicePageSize,
} from "@/lib/services/api";
import type { Service, ServiceCategory } from "@/lib/validators/service";

/** Keystrokes settle before the request goes out. Long enough to skip the
 *  intermediate letters of a word, short enough to still feel live. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_PAGE_SIZE: ServicePageSize = 12;

export type StatusFilter = "all" | "active" | "inactive";

export interface CatalogState {
  services: Service[];
  categories: ServiceCategory[];
  loading: boolean;
  /** True only on the first load, so filtering does not blank the grid. */
  initialLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  status: StatusFilter;
  setStatus: (value: StatusFilter) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: ServicePageSize;
  setPageSize: (value: ServicePageSize) => void;
  total: number;
  totalPages: number;
  refresh: () => Promise<void>;
  refreshCategories: () => Promise<void>;
}

function toFilters(
  search: string,
  categoryId: string,
  status: StatusFilter,
  page: number,
  pageSize: ServicePageSize,
): ServiceFilters {
  return {
    search: search.trim() || undefined,
    categoryId: categoryId || undefined,
    isActive: status === "all" ? undefined : status === "active",
    page,
    pageSize,
  };
}

/**
 * Loads the catalogue and keeps it in step with the filters.
 *
 * Filtering happens on the SERVER (GET /services takes categoryId/search/
 * isActive) rather than over an in-memory array, so the grid keeps working
 * when a centre has hundreds of services and the accent-insensitive search
 * matches the same way the database does.
 */
export function useServicesCatalog(): CatalogState {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [categoryId, setCategoryIdState] = useState("");
  const [status, setStatusState] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<ServicePageSize>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Changing what's being filtered/sized invalidates the current page number
  // — page 3 of an unfiltered catalogue may not exist once a filter narrows
  // the result set, so every one of these resets back to page 1.
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setCategoryId = useCallback((value: string) => {
    setCategoryIdState(value);
    setPage(1);
  }, []);
  const setStatus = useCallback((value: StatusFilter) => {
    setStatusState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((value: ServicePageSize) => {
    setPageSizeState(value);
    setPage(1);
  }, []);

  /**
   * Guards against out-of-order responses. Typing "láser" fires several
   * requests; if the one for "lá" resolves after the one for "láser", the grid
   * would show results for a query the user has already moved past. Only the
   * newest request is allowed to write state.
   */
  const requestId = useRef(0);

  const load = useCallback(async (filters: ServiceFilters) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listServices(filters);
      if (id !== requestId.current) return;
      setServices(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(null);
    } catch {
      if (id !== requestId.current) return;
      setError("No se pudo cargar el catálogo de servicios.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await listCategories());
    } catch {
      // Non-fatal: the grid still renders, the category filter is just empty.
      setCategories([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      load(toFilters(search, categoryId, status, page, pageSize)),
      refreshCategories(),
    ]);
  }, [load, refreshCategories, search, categoryId, status, page, pageSize]);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, categoryId, status, page, pageSize));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, categoryId, status, page, pageSize]);

  return {
    services,
    categories,
    loading,
    initialLoading,
    error,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    status,
    setStatus,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    refresh,
    refreshCategories,
  };
}
