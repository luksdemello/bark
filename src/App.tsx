import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type ClipboardItem = {
  id: number;
  content_type: "text" | "image";
  text_content: string | null;
  image_path: string | null;
  image_thumb_base64: string | null;
  created_at: number;
  last_copied_at: number | null;
};

type DisplayType = "text" | "image" | "link";
type EarState = "normal" | "up" | "down";

const EAR_PATHS: Record<EarState, { left: string; right: string }> = {
  normal: {
    left:  "M6 4C5.5 4 5 5 5 6.5C5 8 5.5 9 6 9C6.5 9 7 8 7 6.5C7 5 6.5 4 6 4Z",
    right: "M18 4C17.5 4 17 5 17 6.5C17 8 17.5 9 18 9C18.5 9 19 8 19 6.5C19 5 18.5 4 18 4Z",
  },
  up: {
    left:  "M6 2C5.5 2 5 3 5 4.5C5 6 5.5 7 6 7C6.5 7 7 6 7 4.5C7 3 6.5 2 6 2Z",
    right: "M18 2C17.5 2 17 3 17 4.5C17 6 17.5 7 18 7C18.5 7 19 6 19 4.5C19 3 18.5 2 18 2Z",
  },
  down: {
    left:  "M6 6C5.5 6 5 7 5 8.5C5 10 5.5 11 6 11C6.5 11 7 10 7 8.5C7 7 6.5 6 6 6Z",
    right: "M18 6C17.5 6 17 7 17 8.5C17 10 17.5 11 18 11C18.5 11 19 10 19 8.5C19 7 18.5 6 18 6Z",
  },
};

function DogIcon({ ears }: { ears: EarState }) {
  const { left, right } = EAR_PATHS[ears];
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={left}  fill="#8B4513" />
      <path d={right} fill="#8B4513" />
      <ellipse cx="12" cy="11" rx="7" ry="6" fill="#A0522D" />
      <ellipse cx="12" cy="14" rx="4" ry="3.5" fill="#DEB887" />
      <ellipse cx="12" cy="14" rx="1.5" ry="1.2" fill="#333333" />
      <circle cx="9.5" cy="10" r="1" fill="#000000" />
      <circle cx="14.5" cy="10" r="1" fill="#000000" />
      <path d="M8 15C7 15 6 16 6 18C6 20 7 21 8 21H16C17 21 18 20 18 18C18 16 17 15 16 15H8Z" fill="#A0522D" />
      <rect x="8" y="20" width="2" height="3" rx="1" fill="#8B4513" />
      <rect x="14" y="20" width="2" height="3" rx="1" fill="#8B4513" />
    </svg>
  );
}

function getDisplayType(item: ClipboardItem): DisplayType {
  if (item.content_type === "image") return "image";
  if (
    item.text_content &&
    (item.text_content.startsWith("http://") ||
      item.text_content.startsWith("https://"))
  ) {
    return "link";
  }
  return "text";
}

function formatTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function ClipboardIcon({ type }: { type: DisplayType }) {
  if (type === "image") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  if (type === "link") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function QuitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const PAGE_SIZE = 20;

function App() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [ears, setEars] = useState<EarState>("normal");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<number | null>(null);

  const loadItems = useCallback(async (pageNum: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await invoke<ClipboardItem[]>("get_clipboard_history", {
        page: pageNum,
        limit: PAGE_SIZE,
      });
      if (append) {
        setItems((prev) => [...prev, ...result]);
      } else {
        setItems(result);
        if (!append && pageNum === 0 && result.length > 0) {
          latestIdRef.current = result[0].id;
        }
      }
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadItems(0, false);
  }, [loadItems]);

  // Listen for new clipboard items
  useEffect(() => {
    const unlisten = listen<ClipboardItem>("clipboard://new-item", (event) => {
      setItems((prev) => [event.payload, ...prev]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reload when window becomes visible (events may be missed while hidden)
  useEffect(() => {
    const unlisten = listen("window-shown", () => {
      setPage(0);
      loadItems(0, false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadItems]);

  // Polling fallback: check for new items every 500ms (covers cases where
  // the clipboard monitor event doesn't fire while the window is open)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await invoke<ClipboardItem[]>("get_clipboard_history", {
          page: 0,
          limit: 1,
        });
        if (result.length === 0) return;
        const latestId = result[0].id;
        if (latestIdRef.current !== null && latestId !== latestIdRef.current) {
          setPage(0);
          loadItems(0, false);
        }
        latestIdRef.current = latestId;
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(interval);
  }, [loadItems]);

  // Scroll-based pagination
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadItems(nextPage, true);
    }
  }, [loading, hasMore, page, loadItems]);

  const animateEars = useCallback(() => {
    const frames: [EarState, number][] = [["up", 150], ["down", 150], ["up", 150], ["normal", 0]];
    let delay = 0;
    for (const [state, ms] of frames) {
      setTimeout(() => setEars(state), delay);
      delay += ms;
    }
  }, []);

  const handleCopy = async (id: number) => {
    await invoke("copy_item", { id });
    animateEars();
  };

  const handleDelete = async (id: number) => {
    await invoke("delete_item", { id });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="widget">
      {/* Header */}
      <header className="widget-header">
        <div className="header-left">
          <DogIcon ears={ears} />
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard & File Sharing</span>
        </div>
        <div className="header-actions">
          <button
            className="header-btn quit-btn"
            title="Encerrar Bark"
            onClick={() => invoke("quit_app")}
          >
            <QuitIcon />
          </button>
        </div>
      </header>

      {/* Clipboard List */}
      <div className="clipboard-list" ref={listRef} onScroll={handleScroll}>
        {items.length === 0 && !loading && (
          <div className="empty-state">
            <span className="empty-text">Nenhum item no clipboard</span>
            <span className="empty-subtext">
              Copie algo para começar
            </span>
          </div>
        )}
        {items.map((item) => {
          const displayType = getDisplayType(item);
          return (
            <div
              key={item.id}
              className="clipboard-item"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="item-icon">
                <ClipboardIcon type={displayType} />
              </div>
              <div className="item-content">
                {item.content_type === "image" ? (
                  item.image_thumb_base64 ? (
                    <img
                      src={`data:image/png;base64,${item.image_thumb_base64}`}
                      alt="Imagem copiada"
                      className="item-image"
                    />
                  ) : (
                    <span className="item-text">[Imagem]</span>
                  )
                ) : (
                  <span className="item-text">
                    {item.text_content || ""}
                  </span>
                )}
                <span className="item-time">
                  {formatTime(item.created_at)}
                </span>
              </div>
              <div
                className={`item-actions ${hoveredId === item.id ? "visible" : ""}`}
              >
                <button
                  className="action-btn copy-btn"
                  title="Copiar"
                  onClick={() => handleCopy(item.id)}
                >
                  <CopyIcon />
                </button>
                <button
                  className="action-btn delete-btn"
                  title="Deletar"
                  onClick={() => handleDelete(item.id)}
                >
                  <DeleteIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${isDragOver ? "drag-over" : ""}`}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => setIsDragOver(false)}
      >
        <UploadIcon />
        <span className="drop-title">Arraste arquivos aqui</span>
        <span className="drop-subtitle">Múltiplos arquivos permitidos</span>
      </div>
    </div>
  );
}

export default App;
