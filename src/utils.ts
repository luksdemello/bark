import { ClipboardItem } from "./types";

export function formatTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export const getDisplayType = (item: ClipboardItem) => {
  if (item.content_type === "image") return "image";
  if (item.text_content?.match(/^https?:\/\//)) return "link";
  return "text";
};