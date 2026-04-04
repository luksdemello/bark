import { useDropzone } from "react-dropzone";
import { UploadIcon } from "./Icons";

interface DropZoneProps {
  filename: string | null;
  progress: number;
  onDrop: (files: File[]) => void;
}

export function DropZone({ filename, progress, onDrop }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <footer
      {...getRootProps()}
      className={`drop-zone${isDragActive ? " drag-over" : ""}${filename ? " uploading" : ""}`}
    >
      <input {...getInputProps()} />
      {filename ? (
        <>
          <UploadIcon />
          <div className="upload-filename">{filename}</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="upload-percent">{progress}%</div>
        </>
      ) : (
        <>
          <UploadIcon />
          <span>{isDragActive ? "Solte aqui" : "Arraste arquivos aqui"}</span>
        </>
      )}
    </footer>
  );
}
