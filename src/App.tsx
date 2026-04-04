import { useState, useRef, useEffect, useCallback } from "react";
import { useClipboard } from "./hooks/useClipboard";
import { useEars } from "./hooks/useEars";
import { useSearch } from "./hooks/useSearch";
import { useUpload } from "./hooks/useUpload";
import { ClipboardListItem } from "./components/Item";
import { DogIcon } from "./components/Icons";
import { DropZone } from "./components/DropZone";
import { clipboardService } from "./services/clipboardService";
import "./App.css";

export default function App() {
  const { items, loading: clipLoading, hasMore, loadMore, deleteItem, pinItem } = useClipboard();
  const { ears, triggerBark, startWiggle, stopWiggle } = useEars();
  const [searchQuery, setSearchQuery] = useState("");
  const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { filename, progress, isDragActive } = useUpload();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const displayItems = isSearching ? searchResults : items;
  const loading = isSearching ? searchLoading : clipLoading;

  // Reset selectedIndex whenever the item list changes
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, displayItems.length);
    setSelectedIndex(-1);
  }, [displayItems.length]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (filename) startWiggle();
    else stopWiggle();
    return () => stopWiggle();
  }, [filename, startWiggle, stopWiggle]);

  const handleCopy = useCallback(async (id: number) => {
    await clipboardService.copyItem(id);
    triggerBark();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, [triggerBark]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K — focus search
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // ⌘+1..9 — always active
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (displayItems[idx]) handleCopy(displayItems[idx].id);
        return;
      }

      // Escape — return focus to search
      if (e.key === "Escape") {
        e.preventDefault();
        searchRef.current?.focus();
        setSelectedIndex(-1);
        return;
      }

      // ↑ ↓ Enter — only when search is not focused
      if (isSearchFocused) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.min(prev + 1, displayItems.length - 1);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && displayItems[selectedIndex]) {
          handleCopy(displayItems[selectedIndex].id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSearchFocused, selectedIndex, displayItems, handleCopy]);

  const onScroll = () => {
    if (isSearching || !listRef.current || clipLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
  };

  return (
    <div className="widget">
      <header className="widget-header">
        <DogIcon ears={ears} progress={progress} />
        <div className="header-right">
          <div className="header-info">
            <span className="header-title">Bark</span>
            <span className="header-subtitle">Clipboard</span>
          </div>
          <div className="search-bar">
            <svg
              className="search-icon"
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              placeholder="Buscar no clipboard..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
            {!searchQuery && (
              <span className="search-hint">⌘K</span>
            )}
            {isSearching && (
              <button className="search-clear" onClick={() => setSearchQuery("")} title="Limpar">
                ×
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="clipboard-list" ref={listRef} onScroll={onScroll}>
        {displayItems.length === 0 && !loading && (
          <div className="empty-state">
            {isSearching ? (
              <>
                <span className="empty-text">Nenhum resultado</span>
                <span className="empty-subtext">Tente outra busca</span>
              </>
            ) : (
              <>
                <span className="empty-text">Nenhum item no clipboard</span>
                <span className="empty-subtext">Copie algo para começar</span>
              </>
            )}
          </div>
        )}
        {displayItems.map((item, idx) => (
          <ClipboardListItem
            key={item.id}
            item={item}
            onCopy={handleCopy}
            onDelete={deleteItem}
            onPin={pinItem}
            isCopied={copiedId === item.id}
            isSelected={selectedIndex === idx}
            ref={(el: HTMLDivElement | null) => { itemRefs.current[idx] = el; }}
          />
        ))}
        {loading && <div className="loader">Carregando...</div>}
      </div>

      <DropZone filename={filename} progress={progress} isDragActive={isDragActive} />
    </div>
  );
}
