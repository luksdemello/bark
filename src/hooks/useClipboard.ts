import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ClipboardItem } from "../types";
import { clipboardService } from "../services/clipboardService";

const PAGE_SIZE = 20;

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await clipboardService.getHistory(pageNum, PAGE_SIZE);
      setItems(prev => (append ? [...prev, ...result] : result));
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems(0, false);

    const unlistenNew = listen<ClipboardItem>("clipboard://new-item", event => {
      setItems(prev => [event.payload, ...prev]);
    });

    // Re-sync when the popover becomes visible (covers items added while closed)
    const unlistenShown = listen("window-shown", () => {
      pageRef.current = 0;
      loadItems(0, false);
    });

    return () => {
      unlistenNew.then(fn => fn());
      unlistenShown.then(fn => fn());
    };
  }, [loadItems]);

  const deleteItem = async (id: number) => {
    await clipboardService.deleteItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const loadMore = () => {
    const next = pageRef.current + 1;
    pageRef.current = next;
    loadItems(next, true);
  };

  return {
    items,
    loading,
    hasMore,
    loadMore,
    deleteItem,
    refresh: () => loadItems(0, false),
  };
}
