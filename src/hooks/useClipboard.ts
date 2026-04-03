import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardItem } from "../types";

const PAGE_SIZE = 20;

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const latestIdRef = useRef<number | null>(null);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await invoke<ClipboardItem[]>("get_clipboard_history", {
        page: pageNum,
        limit: PAGE_SIZE,
      });
      
      setItems(prev => append ? [...prev, ...result] : result);
      setHasMore(result.length === PAGE_SIZE);
      
      if (pageNum === 0 && result.length > 0) {
        latestIdRef.current = result[0].id;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Listeners de eventos e polling
  useEffect(() => {
    const unlistenNew = listen<ClipboardItem>("clipboard://new-item", (event) => {
      setItems(prev => [event.payload, ...prev]);
    });

    const interval = setInterval(async () => {
      const res = await invoke<ClipboardItem[]>("get_clipboard_history", { page: 0, limit: 1 });
      if (res.length > 0 && res[0].id !== latestIdRef.current) {
        loadItems(0, false);
      }
    }, 1000);

    return () => {
      unlistenNew.then(fn => fn());
      clearInterval(interval);
    };
  }, [loadItems]);

  const deleteItem = async (id: number) => {
    await invoke("delete_item", { id });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return { items, loading, hasMore, loadMore: () => {
    const next = page + 1;
    setPage(next);
    loadItems(next, true);
  }, deleteItem, refresh: () => loadItems(0, false) };
}