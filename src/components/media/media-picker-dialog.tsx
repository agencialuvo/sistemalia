"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Film, Images, Loader2, Music, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { listMedia } from "@/lib/media/api";
import { formatFileSize, type MediaAsset, type MediaKind } from "@/lib/validators/media";

/**
 * Reusable "elegir desde Medios" picker — opens over the biblioteca de medios
 * (menú "Medios") filtered to the kinds the caller accepts, and hands back
 * the chosen asset. Used by ServiceFormDialog's imagen principal (IMAGE only)
 * and galería de testimonios (IMAGE + VIDEO) pickers; any future module that
 * wants to reuse an existing asset instead of re-uploading can reuse this too.
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  allowedKinds,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedKinds: MediaKind[];
  onSelect: (asset: MediaAsset) => void;
}) {
  const t = useTranslations("MediaPicker");

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting the
       picker's own search/loading UI state for a fresh open, same
       load-on-open pattern as StaffServiceMatrixDialog and MediaPage. */
    setLoading(true);
    setSearch("");
    /* eslint-enable react-hooks/set-state-in-effect */
    listMedia()
      .then((result) => setAssets(result))
      .catch((error) => {
        toast.error(getApiErrorMessage(error, t("loadFailed")));
        setAssets([]);
      })
      .finally(() => setLoading(false));
  }, [open, t]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        allowedKinds.includes(asset.kind) &&
        (!query || asset.fileName.toLowerCase().includes(query)),
    );
  }, [assets, allowedKinds, search]);

  function pick(asset: MediaAsset) {
    onSelect(asset);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/80 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border/80 px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Images className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => pick(asset)}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary"
                >
                  <div className="relative flex h-20 w-full items-center justify-center bg-muted">
                    {asset.kind === "IMAGE" ? (
                      // Arbitrary intrinsic size, plain <img> avoids next/image's
                      // width/height requirement for a small grid thumbnail.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.url}
                        alt={asset.fileName}
                        className="size-full object-cover"
                      />
                    ) : asset.kind === "VIDEO" ? (
                      <Film className="size-6 text-muted-foreground/50" />
                    ) : asset.kind === "AUDIO" ? (
                      <Music className="size-6 text-muted-foreground/50" />
                    ) : (
                      <FileText className="size-6 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-medium text-foreground" title={asset.fileName}>
                      {asset.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFileSize(asset.sizeBytes)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
