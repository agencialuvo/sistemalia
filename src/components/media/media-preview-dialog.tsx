"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatFileSize, type MediaAsset } from "@/lib/validators/media";

/**
 * Preview popup opened by clicking a MediaCard: the actual image/video/PDF,
 * plus the file name and its link — the link is the point, since that's what
 * gets pasted into other modules (e.g. the "avatarUrl" column of the Staff
 * bulk-import template) to point at this asset.
 */
export function MediaPreviewDialog({
  asset,
  onOpenChange,
  onDelete,
}: {
  asset: MediaAsset | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  const t = useTranslations("Media");
  if (!asset) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(asset!.url);
      toast.success(t("preview.linkCopied"));
    } catch {
      toast.error(t("preview.copyFailed"));
    }
  }

  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,780px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/80 px-6 pt-6 pb-4">
          <DialogTitle className="truncate text-base" title={asset.fileName}>
            {asset.fileName}
          </DialogTitle>
          <DialogDescription>
            {t(`kinds.${asset.kind}`)} · {formatFileSize(asset.sizeBytes)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
          {asset.kind === "IMAGE" ? (
            // Arbitrary aspect ratio and unknown intrinsic size — next/image
            // needs one or the other, a plain <img> needs neither.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={asset.fileName}
              className="max-h-[55vh] max-w-full rounded-lg object-contain"
            />
          ) : asset.kind === "VIDEO" ? (
            <video
              src={asset.url}
              controls
              preload="metadata"
              className="max-h-[55vh] max-w-full rounded-lg"
            />
          ) : asset.kind === "AUDIO" ? (
            <audio src={asset.url} controls preload="metadata" className="w-full max-w-md" />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <FileText className="size-10" />
              <p className="text-sm">{t("preview.noPreview")}</p>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-1.5 border-t border-border/80 px-6 py-4">
          <p className="text-xs font-medium text-muted-foreground">{t("preview.linkLabel")}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={asset.url}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
              <Copy className="mr-1.5 size-3.5" />
              {t("preview.copyLink")}
            </Button>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/80 px-6 py-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onDelete(asset);
              onOpenChange(false);
            }}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            {t("card.delete")}
          </Button>
          <a href={asset.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm">
              <ExternalLink className="mr-1.5 size-3.5" />
              {t("preview.openOriginal")}
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
