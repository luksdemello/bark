import { useState } from "react";
import "./App.css";

type ClipboardItem = {
  id: number;
  type: "text" | "image" | "link";
  content: string;
  time: string;
};

const mockItems: ClipboardItem[] = [
  {
    id: 1,
    type: "text",
    content: "Exemplo de texto copiado",
    time: "7m atrás",
  },
  {
    id: 2,
    type: "image",
    content: "https://picsum.photos/seed/demo/240/100",
    time: "17m atrás",
  },
  {
    id: 3,
    type: "link",
    content: "https://github.com/example/repo",
    time: "32m atrás",
  },
];

function ClipboardIcon({ type }: { type: ClipboardItem["type"] }) {
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

function App() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="widget">
      {/* Header */}
      <header className="widget-header">
        <div className="header-left">
          <img src="/src/assets/dog_colored.svg" alt="Bark" width="24" height="24" />
          <span className="header-title">Bark</span>
          <span className="header-subtitle">Clipboard & File Sharing</span>
        </div>
      </header>

      {/* Clipboard List */}
      <div className="clipboard-list">
        {mockItems.map((item) => (
          <div
            key={item.id}
            className="clipboard-item"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="item-icon">
              <ClipboardIcon type={item.type} />
            </div>
            <div className="item-content">
              {item.type === "image" ? (
                <img
                  src={item.content}
                  alt="Imagem copiada"
                  className="item-image"
                />
              ) : (
                <span className="item-text">{item.content}</span>
              )}
              <span className="item-time">{item.time}</span>
            </div>
            <div
              className={`item-actions ${hoveredId === item.id ? "visible" : ""}`}
            >
              <button className="action-btn copy-btn" title="Copiar">
                <CopyIcon />
              </button>
              <button className="action-btn delete-btn" title="Deletar">
                <DeleteIcon />
              </button>
            </div>
          </div>
        ))}
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
