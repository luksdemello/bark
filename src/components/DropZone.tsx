import { UploadIcon } from "./Icons";

interface DropZoneProps {
  filename: string | null;
  progress: number;
  isDragActive: boolean;
}

export function DropZone({ filename, progress, isDragActive }: DropZoneProps) {
  return (
    <footer
      className={`drop-zone${isDragActive ? " drag-over" : ""}${filename ? " uploading" : ""}`}
    >
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
          <span className="dropzone-main">
            {isDragActive ? "Solte para compartilhar" : "Arraste arquivos para compartilhar"}
          </span>
          <span className={`dropzone-sub${isDragActive ? " invisible" : ""}`}>
            Um link será gerado automaticamente
          </span>
        </>
      )}
    </footer>
  );
}
