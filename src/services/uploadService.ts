import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "../lib/supabase";

const BUCKET = "bark-files";
const SIGNED_URL_EXPIRES_IN = 3600;

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    zip: "application/zip",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
  };
  return mimeTypes[ext] ?? "application/octet-stream";
}

export async function uploadAndShare(filePath: string): Promise<string> {
  const fileName = filePath.split("/").pop() ?? filePath;
  const uniqueName = `${crypto.randomUUID()}-${fileName}`;
  const mimeType = getMimeType(fileName);

  const bytes = await readFile(filePath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(uniqueName, bytes, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRES_IN * 1000);

  const { error: dbError } = await supabase
    .from("files")
    .insert({
      path: uniqueName,
      expires_at: expiresAt.toISOString(),
    });

  if (dbError) {
    throw new Error(`Failed to save file metadata: ${dbError.message}`);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(uniqueName, SIGNED_URL_EXPIRES_IN);

  if (signedUrlError || !data?.signedUrl) {
    throw new Error(
      `Failed to generate link: ${signedUrlError?.message ?? "Unknown error"}`
    );
  }

  return data.signedUrl;
}
