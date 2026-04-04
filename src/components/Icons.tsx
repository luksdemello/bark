import { EarState } from "../types";

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

export function DogIcon({ ears, progress = 0 }: { ears: EarState; progress?: number }) {
  const { left, right } = EAR_PATHS[ears];
  const circumference = 100.53; // 2π × 16
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="dog-ring-wrap">
      {progress > 0 && (
        <svg className="ring-svg" viewBox="0 0 36 36">
          <circle className="ring-bg" cx="18" cy="18" r="16" />
          <circle
            className="ring-fill"
            cx="18"
            cy="18"
            r="16"
            stroke="#0a84ff"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
      )}
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d={left}  fill="#8B4513" />
        <path d={right} fill="#8B4513" />
        <ellipse cx="12" cy="11" rx="7" ry="6" fill="#A0522D" />
        <ellipse cx="12" cy="14" rx="4" ry="3.5" fill="#DEB887" />
        <ellipse cx="12" cy="14" rx="1.5" ry="1.2" fill="#333333" />
        <circle cx="9.5" cy="10" r="1" fill="#000000" />
        <circle cx="14.5" cy="10" r="1" fill="#000000" />
        <path d="M8 15C7 15 6 16 6 18C6 20 7 21 8 21H16C17 21 18 20 18 18C18 16 17 15 16 15H8Z" fill="#A0522D" />
      </svg>
    </div>
  );
}

export function ClipboardIcon({ type }: { type: string }) {
  if (type === "image") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  if (type === "link") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

export const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const PinIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
  </svg>
);