import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClipboard } from "./hooks/useClipboard";
import { useEars } from "./hooks/useEars"; 
import { ClipboardListItem } from "./components/Item";
import { DogIcon, UploadIcon } from "./components/Icons";
import "./App.css";

export default function App() {
  const { items, loading, hasMore, loadMore, deleteItem } = useClipboard();
  const { ears, triggerBark } = useEars();
  const listRef = useRef<HTMLDivElement>(null);

  const handleCopy = async (id: number) => {
    await invoke("copy_item", { id });
    triggerBark();
  };

  const onScroll = () => {
    if (!listRef.current || loading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) loadMore();
  };

  return (
    <div className="widget">
      <header className="widget-header">
        <DogIcon ears={ears} />
        <div className="header-info">
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard</span>
        </div>
      </header>

      <div className="clipboard-list" ref={listRef} onScroll={onScroll}>
        {items.map(item => (
          <ClipboardListItem 
            key={item.id} 
            item={item} 
            onCopy={handleCopy} 
            onDelete={deleteItem} 
          />
        ))}
        {loading && <div className="loader">Carregando...</div>}
      </div>

      <footer className="drop-zone">
        <UploadIcon />
        <span>Arraste arquivos aqui</span>
      </footer>
    </div>
  );
}