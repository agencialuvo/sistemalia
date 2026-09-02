"use client";

import { useCallback, useEffect, useState } from "react";

import { listPatientTags } from "@/lib/patients/api";
import type { PatientTag } from "@/lib/validators/patient";

/**
 * Thin cache of the patient tag catalogue for consumers that only need it to
 * resolve colors (the table, the ficha 360° summary tab) — not the full CRUD
 * state that PatientTagManagerDialog owns. Loads once and exposes `refresh`
 * so callers can re-sync after the dialog closes.
 */
export function usePatientTagCatalog() {
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setTags(await listPatientTags());
    } catch {
      // Best-effort: colors just fall back to the deterministic hash.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tags, loading, refresh };
}
