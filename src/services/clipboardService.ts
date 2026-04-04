import { invoke } from "@tauri-apps/api/core";
import { ClipboardItem } from "../types";

export const clipboardService = {
  getHistory(page: number, limit: number): Promise<ClipboardItem[]> {
    return invoke("get_clipboard_history", { page, limit });
  },

  searchHistory(query: string, limit: number): Promise<ClipboardItem[]> {
    return invoke("search_clipboard_history", { query, limit });
  },

  copyItem(id: number): Promise<void> {
    return invoke("copy_item", { id });
  },

  deleteItem(id: number): Promise<void> {
    return invoke("delete_item", { id });
  },

  pinItem(id: number): Promise<void> {
    return invoke("pin_item", { id });
  },

  clearHistory(): Promise<void> {
    return invoke("clear_history");
  },

  getItemById(id: number): Promise<ClipboardItem | null> {
    return invoke("get_item_by_id", { id });
  },

  uploadFile(name: string, bytes: number[]): Promise<void> {
    return invoke("upload_file", { name, bytes });
  },
};
