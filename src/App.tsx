import { useState, useRef, useEffect } from "react";
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
  const { items, loading: clipLoading, hasMore, loadMore, deleteItem } = useClipboard();
  const { ears, triggerBark, startWiggle, stopWiggle } = useEars();
  const [searchQuery, setSearchQuery] = useState("");
  const { results: searchResults, loading: searchLoading, isActive: isSearching } = useSearch(searchQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const { filename, progress, isDragActive } = useUpload();

  useEffect(() => {
    if (filename) startWiggle();
    else stopWiggle();
    return () => stopWiggle();
  }, [filename, startWiggle, stopWiggle]);

  const handleCopy = async (id: number) => {
    await clipboardService.copyItem(id);
    triggerBark();
  };

  const onScroll = () => {
    if (isSearching || !listRef.current || clipLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
  };

  const displayItems = isSearching ? searchResults : items;
  const loading = isSearching ? searchLoading : clipLoading;

  return (
    <div className="widget">
      <header className="widget-header">
        <DogIcon ears={ears} progress={progress} />
        <div className="header-info">
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard</span>
        </div>
      </header>

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
          className="search-input"
          type="text"
          placeholder="Buscar no clipboard..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
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
        {displayItems.map(item => (
          <ClipboardListItem
            key={item.id}
            item={item}
            onCopy={handleCopy}
            onDelete={deleteItem}
          />
        ))}
        {loading && <div className="loader">Carregando...</div>}
      </div>

      <DropZone filename={filename} progress={progress} isDragActive={isDragActive} />
    </div>
  );
}
