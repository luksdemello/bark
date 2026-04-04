import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/plugin-fs before importing uploadService
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

// Mock the supabase module
vi.mock("../../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

import { readFile } from "@tauri-apps/plugin-fs";
import { supabase } from "../../lib/supabase";
import { uploadAndShare } from "../uploadService";

const mockReadFile = vi.mocked(readFile);
const mockFrom = vi.mocked(supabase.storage.from);

describe("uploadAndShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads file bytes, uploads to Supabase, and returns a signed URL", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockReadFile.mockResolvedValue(fakeBytes);

    const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://supabase.co/signed?token=abc" },
      error: null,
    });
    mockFrom.mockReturnValue({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
    } as any);

    const url = await uploadAndShare("/Users/test/foto.png");

    expect(mockReadFile).toHaveBeenCalledWith("/Users/test/foto.png");
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+-foto\.png$/),
      expect.any(File)
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]+-foto\.png$/),
      3600
    );
    expect(url).toBe("https://supabase.co/signed?token=abc");
  });

  it("throws if upload fails", async () => {
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const mockUpload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "bucket não encontrado" },
    });
    mockFrom.mockReturnValue({ upload: mockUpload } as any);

    await expect(uploadAndShare("/tmp/arquivo.txt")).rejects.toThrow(
      "Upload failed: bucket não encontrado"
    );
  });

  it("throws if signed URL generation fails", async () => {
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permissão negada" },
    });
    mockFrom.mockReturnValue({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
    } as any);

    await expect(uploadAndShare("/tmp/arquivo.txt")).rejects.toThrow(
      "Failed to generate link: permissão negada"
    );
  });
});
