"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listCategories, listServices, type ServiceFilters } from "@/lib/services/api";
import type { Service, ServiceCategory } from "@/lib/validators/service";

/** Keystrokes settle before the request goes out. Long enough to skip the
 *  intermediate letters of a word, short enough to still feel live. */
const SEARCH_DEBOUNCE_MS = 300;

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
  refresh: () => Promise<void>;
  refreshCategories: () => Promise<void>;
}

function toFilters(search: string, categoryId: string, status: StatusFilter): ServiceFilters {
  return {
    search: search.trim() || undefined,
    categoryId: categoryId || undefined,
    isActive: status === "all" ? undefined : status === "active",
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

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

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
      const data = await listServices(filters);
      if (id !== requestId.current) return;
      setServices(data);
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
    await Promise.all([load(toFilters(search, categoryId, status)), refreshCategories()]);
  }, [load, refreshCategories, search, categoryId, status]);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(toFilters(search, categoryId, status));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load, search, categoryId, status]);

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
    refresh,
    refreshCategories,
  };
}
