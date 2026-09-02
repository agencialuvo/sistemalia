"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { FileText, Film, Music, Trash2 } from "lucide-react";

import { formatFileSize, type MediaAsset } from "@/lib/validators/media";

/** One tile in the media grid. Images get a real thumbnail; video, audio and
 *  PDF get a representative icon — generating a video poster frame or a PDF
 *  thumbnail server-side is a separate feature, not something this card can
 *  do with a plain <img>. */
export function MediaCard({
  asset,
  onView,
  onDelete,
}: {
  asset: MediaAsset;
  /** Opens the preview popup — fired by clicking anywhere on the card that
   *  isn't the delete button. */
  onView: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  const t = useTranslations("Media");
  const isPreviewable = asset.kind === "IMAGE";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView(asset)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView(asset);
        }
      }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md"
    >
      <div className="relative flex h-32 w-full items-center justify-center bg-muted">
        {isPreviewable ? (
          <Image
            src={asset.url}
            alt={asset.fileName}
            fill
            sizes="(max-width: 768px) 50vw, 220px"
            className="object-cover"
            unoptimized
          />
        ) : asset.kind === "VIDEO" ? (
          <Film className="size-8 text-muted-foreground/50" />
        ) : asset.kind === "AUDIO" ? (
          <Music className="size-8 text-muted-foreground/50" />
        ) : (
          <FileText className="size-8 text-muted-foreground/50" />
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(asset);
          }}
          aria-label={t("card.delete")}
          className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/90 text-destructive opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="truncate text-xs font-medium text-foreground" title={asset.fileName}>
          {asset.fileName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t(`kinds.${asset.kind}`)} · {formatFileSize(asset.sizeBytes)}
        </p>
      </div>
    </div>
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-32 w-full animate-pulse bg-muted" />
      <div className="space-y-1.5 p-2.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
