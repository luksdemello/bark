export type ClipboardItem = {
  id: number;
  content_type: "text" | "image";
  text_content: string | null;
  image_path: string | null;
  image_thumb_base64: string | null;
  hash: string | null;
  pinned: boolean;
  created_at: number;
  last_copied_at: number | null;
};

export type EarState = "normal" | "up" | "down";