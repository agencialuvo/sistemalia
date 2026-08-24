/** Mirrors backend/src/modules/media (menú "Medios"). */

export const MEDIA_KINDS = ["IMAGE", "GIF", "VIDEO", "PDF"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export interface MediaAsset {
  id: string;
  tenantId: string;
  fileName: string;
  url: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
  createdAt: string;
}

/** Accepted by the file picker's `accept` attribute — kept in sync with
 *  MEDIA_TYPE_RULES on the backend so a rejected file never reaches upload. */
export const ACCEPTED_MEDIA_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** "2.4 MB" — same idea as formatSoles: a small, boring formatter kept next
 *  to the type it formats instead of scattered inline at each call site. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
