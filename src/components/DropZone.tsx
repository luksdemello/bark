import { useState, DragEvent } from "react";
import { UploadIcon } from "./Icons";
import { clipboardService } from "../services/clipboardService";

export function DropZone() {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      await clipboardService.uploadFile(file.name, bytes).catch(() => {});
    }
  };

  return (
    <footer
      className={`drop-zone${dragging ? " drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <UploadIcon />
      <span>{dragging ? "Solte aqui" : "Arraste arquivos aqui"}</span>
    </footer>
  );
}
