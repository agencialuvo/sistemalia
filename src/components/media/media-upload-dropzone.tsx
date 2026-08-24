"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";

import { getApiErrorMessage } from "@/lib/api";
import { uploadMedia } from "@/lib/media/api";
import { ACCEPTED_MEDIA_MIME_TYPES, type MediaAsset } from "@/lib/validators/media";
import { cn } from "@/lib/utils";

/** Drag-drop-or-click uploader. Files upload one at a time (not
 *  Promise.all) so the progress count moves visibly instead of everything
 *  landing at once, and one bad file's error doesn't cancel the rest. */
export function MediaUploadDropzone({ onUploaded }: { onUploaded: (asset: MediaAsset) => void }) {
  const t = useTranslations("Media");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setUploading(true);
    setProgress({ done: 0, total: picked.length });

    let failures = 0;
    for (const file of picked) {
      try {
        onUploaded(await uploadMedia(file));
      } catch (error) {
        failures += 1;
        toast.error(`${file.name}: ${getApiErrorMessage(error, t("uploadFailed"))}`);
      } finally {
        setProgress((current) => ({ ...current, done: current.done + 1 }));
      }
    }

    setUploading(false);
    if (failures === 0 && picked.length > 0) {
      toast.success(t("uploaded", { count: picked.length }));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/60 hover:bg-muted/40",
        uploading && "pointer-events-none opacity-70",
      )}
    >
      {uploading ? (
        <>
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {t("uploading", { done: progress.done, total: progress.total })}
          </p>
        </>
      ) : (
        <>
          <UploadCloud className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{t("dropTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("dropHelp")}</p>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_MEDIA_MIME_TYPES.join(",")}
        onChange={(event) => void handleFiles(event.target.files)}
        className="hidden"
      />
    </div>
  );
}
