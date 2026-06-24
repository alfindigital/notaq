import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { subscribeDbChanges, checkSchemaVersion } from "@/lib/storage";

// Map IDB key → React Query keys to invalidate on cross-tab writes.
const KEY_TO_QUERIES: Record<string, string[][]> = {
  business: [["business"]],
  presets: [["presets"]],
  notes: [["notes"]],
  expenses: [["expenses"]],
  seq: [["seq"]],
  prefs: [["prefs"]],
};

export function DbSync() {
  const qc = useQueryClient();

  // Multi-tab: invalidate React Query when another tab writes.
  useEffect(() => {
    return subscribeDbChanges((key) => {
      const queries = KEY_TO_QUERIES[key];
      if (!queries) return;
      for (const q of queries) qc.invalidateQueries({ queryKey: q });
    });
  }, [qc]);

  // Schema-version gate: warn if data was written by a newer build.
  useEffect(() => {
    let cancelled = false;
    checkSchemaVersion()
      .then((res) => {
        if (cancelled || res.ok) return;
        toast.warning(
          "Data Notaku ini berasal dari versi yang lebih baru. Sebagian fitur bisa tidak kompatibel — perbarui aplikasi.",
          { duration: 10_000 },
        );
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return null;
}
