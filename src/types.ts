export type ClipboardItem = {
  id: number;
  content_type: "text" | "image";
  text_content: string | null;
  image_path: string | null;
  image_thumb_base64: string | null;
  created_at: number;
};

export type EarState = "normal" | "up" | "down";