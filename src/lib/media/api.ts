import { api } from "@/lib/api";
import type { MediaAsset, MediaKind } from "@/lib/validators/media";

/** Thin typed wrapper over the media-library endpoints (menú "Medios"). */

export async function listMedia(kind?: MediaKind): Promise<MediaAsset[]> {
  const { data } = await api.get<MediaAsset[]>("/media", {
    params: kind ? { kind } : undefined,
  });
  return data;
}

export async function uploadMedia(file: File): Promise<MediaAsset> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<MediaAsset>("/media", form);
  return data;
}

export async function deleteMedia(id: string): Promise<{ id: string; deleted: true }> {
  const { data } = await api.delete<{ id: string; deleted: true }>(`/media/${id}`);
  return data;
}
