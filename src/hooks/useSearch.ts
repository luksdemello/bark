import { useState, useEffect } from "react";
import { ClipboardItem } from "../types";
import { clipboardService } from "../services/clipboardService";

const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 200;

export function useSearch(query: string) {
  const [results, setResults] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const isActive = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await clipboardService.searchHistory(q, SEARCH_LIMIT);
        setResults(result);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading, isActive };
}
