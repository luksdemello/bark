import { UploadIcon } from "./Icons";
import type { UploadStatus } from "../hooks/useUpload";

interface DropZoneProps {
  filename: string | null;
  progress: number;
  isDragActive: boolean;
  status: UploadStatus;
  error: string | null;
}

export function DropZone({ filename, progress, isDragActive, status, error }: DropZoneProps) {
  const isUploading = status === "uploading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <footer
      className={[
        "drop-zone",
        isDragActive ? "drag-over" : "",
        isUploading ? "uploading" : "",
        isSuccess ? "success" : "",
        isError ? "error" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isError ? (
        <>
          <UploadIcon />
          <span className="dropzone-main error-text">Falha no upload</span>
          <span className="dropzone-sub">{error}</span>
        </>
      ) : isSuccess ? (
        <>
          <UploadIcon />
          <span className="dropzone-main success-text">Link copiado!</span>
          <span className="dropzone-sub">{filename}</span>
        </>
      ) : filename ? (
        <>
          <UploadIcon />
          <div className="upload-filename">{filename}</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="upload-percent">{isUploading ? `${progress}%` : ""}</div>
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
