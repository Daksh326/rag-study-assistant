"use client";

import { useCallback, useEffect, useState } from "react";
import type { LibraryDocument } from "@/lib/types";

export function useDocuments() {
  const [documents, setDocuments] = useState<LibraryDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
      const json = (await res.json()) as { documents: LibraryDocument[] };
      setDocuments(json.documents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; refresh() only sets state after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { documents, error, refresh };
}
