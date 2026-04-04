import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ClipboardItem } from "../types";
import { clipboardService } from "../services/clipboardService";

const PAGE_SIZE = 20;

function sortItems(items: ClipboardItem[]): ClipboardItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned === b.pinned) return 0;
    return a.pinned ? -1 : 1;
  });
}

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await clipboardService.getHistory(pageNum, PAGE_SIZE);
      setItems(prev => sortItems(append ? [...prev, ...result] : result));
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems(0, false);

    const unlistenNew = listen<ClipboardItem>("clipboard://new-item", event => {
      setItems(prev => sortItems([event.payload, ...prev]));
    });

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

  const pinItem = async (id: number) => {
    // Optimistic update: toggle pinned locally before round-trip
    setItems(prev => sortItems(
      prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i)
    ));
    try {
      await clipboardService.pinItem(id);
    } catch {
      // Revert on error
      setItems(prev => sortItems(
        prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i)
      ));
    }
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
    pinItem,
    refresh: () => loadItems(0, false),
  };
}
