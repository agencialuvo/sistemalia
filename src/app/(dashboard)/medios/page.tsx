"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Images } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { MediaCard, MediaCardSkeleton } from "@/components/media/media-card";
import { MediaUploadDropzone } from "@/components/media/media-upload-dropzone";
import { getApiErrorMessage } from "@/lib/api";
import { deleteMedia, listMedia } from "@/lib/media/api";
import { MEDIA_KINDS, type MediaAsset, type MediaKind } from "@/lib/validators/media";
import { cn } from "@/lib/utils";

type KindFilter = "all" | MediaKind;

/**
 * /medios — biblioteca de medios del tenant.
 *
 * Filtering happens client-side over the already-fetched list rather than a
 * server round trip per tab: GET /media has no pagination (a centre's media
 * library is not expected to reach the size where that matters), so there is
 * nothing a server-side filter would save here.
 */
export default function MediaPage() {
  const t = useTranslations("Media");

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await listMedia());
      setError(null);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (kindFilter === "all" ? assets : assets.filter((asset) => asset.kind === kindFilter)),
    [assets, kindFilter],
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMedia(deleteTarget.id);
      setAssets((current) => current.filter((asset) => asset.id !== deleteTarget.id));
      toast.success(t("deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("deleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <MediaUploadDropzone
        onUploaded={(asset) => setAssets((current) => [asset, ...current])}
      />

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...MEDIA_KINDS] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKindFilter(option)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              kindFilter === option
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {option === "all" ? t("filters.all") : t(`kinds.${option}`)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-foreground">{error}</p>
        </div>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <MediaCardSkeleton key={index} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
            <Images className="size-6 text-primary" />
          </div>
          <div className="max-w-sm">
            <h2 className="text-sm font-semibold text-foreground">{t("empty.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("empty.description")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((asset) => (
            <MediaCard key={asset.id} asset={asset} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        title={deleteTarget ? t("deleteConfirmTitle", { name: deleteTarget.fileName }) : ""}
        description={t("deleteConfirmDescription")}
      />
    </div>
  );
}
