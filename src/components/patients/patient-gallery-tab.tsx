"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Images, Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPickerDialog } from "@/components/media/media-picker-dialog";
import { getApiErrorMessage } from "@/lib/api";
import { addGalleryImage, removeGalleryImage } from "@/lib/patients/api";
import type { MediaAsset } from "@/lib/validators/media";
import {
  GALLERY_CATEGORIES,
  GALLERY_CATEGORY_LABELS,
  type PatientGalleryCategory,
  type PatientGalleryImage,
} from "@/lib/validators/patient";

const CATEGORY_BADGE_VARIANT: Record<PatientGalleryCategory, "default" | "secondary" | "destructive"> = {
  BEFORE: "secondary",
  AFTER: "default",
  PROGRESS: "secondary",
};

/**
 * Tab 5 — Galería "Antes y Después" (Fase 3, plan §1): grid clasificado por
 * categoría, comparador lado a lado, y alta de nuevas fotos desde Medios (no
 * un upload propio — mismo patrón que el resto de la app para reusar assets).
 */
export function PatientGalleryTab({
  patientId,
  images,
  onImageAdded,
  onImageRemoved,
}: {
  patientId: string;
  images: PatientGalleryImage[];
  onImageAdded: (image: PatientGalleryImage) => void;
  onImageRemoved: (imageId: string) => void;
}) {
  const t = useTranslations("Patients.detail.gallery");
  const tc = useTranslations("Patients.common");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [category, setCategory] = useState<PatientGalleryCategory>("BEFORE");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientGalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [compareBeforeId, setCompareBeforeId] = useState<string>("");
  const [compareAfterId, setCompareAfterId] = useState<string>("");

  const beforeImages = useMemo(() => images.filter((image) => image.category === "BEFORE"), [images]);
  const afterImages = useMemo(() => images.filter((image) => image.category === "AFTER"), [images]);

  const compareBefore = beforeImages.find((image) => image.id === compareBeforeId) ?? beforeImages[0];
  const compareAfter = afterImages.find((image) => image.id === compareAfterId) ?? afterImages[0];

  function openUpload() {
    setSelectedAsset(null);
    setCategory("BEFORE");
    setCaption("");
    setUploadOpen(true);
  }

  const submitUpload = useCallback(async () => {
    if (!selectedAsset) {
      toast.error(t("imageRequired"));
      return;
    }
    setSaving(true);
    try {
      const image = await addGalleryImage(patientId, {
        imageUrl: selectedAsset.url,
        category,
        caption: caption.trim() || undefined,
      });
      onImageAdded(image);
      toast.success(t("added"));
      setUploadOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("addFailed")));
    } finally {
      setSaving(false);
    }
  }, [patientId, selectedAsset, category, caption, onImageAdded, t]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeGalleryImage(patientId, deleteTarget.id);
      onImageRemoved(deleteTarget.id);
      toast.success(t("removed"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("removeFailed")));
    } finally {
      setDeleting(false);
    }
  }, [patientId, deleteTarget, onImageRemoved, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <Button variant="outline" size="sm" onClick={openUpload}>
          <Plus className="mr-1.5 size-4" />
          {t("addButton")}
        </Button>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
          <Images className="size-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.imageUrl}
                  alt={image.caption ?? GALLERY_CATEGORY_LABELS[image.category]}
                  className="aspect-square w-full object-cover"
                />
                <Badge
                  variant={CATEGORY_BADGE_VARIANT[image.category]}
                  className="absolute left-1.5 top-1.5"
                >
                  {GALLERY_CATEGORY_LABELS[image.category]}
                </Badge>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(image)}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-background/80 text-destructive opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
                  aria-label={t("remove")}
                >
                  <Trash2 className="size-3.5" />
                </button>
                {image.caption && (
                  <p className="truncate bg-background/90 px-2 py-1 text-[11px] text-foreground">
                    {image.caption}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-sm font-medium text-foreground">{t("compareTitle")}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("compareHelp")}</p>

            {beforeImages.length === 0 || afterImages.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("noPairForCompare")}</p>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("selectBefore")}</Label>
                    <Select
                      value={compareBefore?.id ?? ""}
                      onValueChange={(value) => setCompareBeforeId(value ?? "")}
                    >
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue>
                          {() => compareBefore?.caption || t("beforeLabel")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {beforeImages.map((image) => (
                          <SelectItem key={image.id} value={image.id}>
                            {image.caption || t("beforeLabel")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("selectAfter")}</Label>
                    <Select
                      value={compareAfter?.id ?? ""}
                      onValueChange={(value) => setCompareAfterId(value ?? "")}
                    >
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue>
                          {() => compareAfter?.caption || t("afterLabel")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {afterImages.map((image) => (
                          <SelectItem key={image.id} value={image.id}>
                            {image.caption || t("afterLabel")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-center text-xs font-medium text-muted-foreground">
                      {t("beforeLabel")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={compareBefore?.imageUrl}
                      alt={t("beforeLabel")}
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-center text-xs font-medium text-muted-foreground">
                      {t("afterLabel")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={compareAfter?.imageUrl}
                      alt={t("afterLabel")}
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("uploadTitle")}</DialogTitle>
            <DialogDescription>{t("uploadDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              {selectedAsset ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedAsset.url}
                    alt={selectedAsset.fileName}
                    className="size-14 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selectedAsset.fileName}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                    {t("changeImage")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
                  <Images className="mr-1.5 size-4" />
                  {t("chooseImage")}
                </Button>
              )}
            </div>

            <div>
              <Label>{t("categoryLabel")}</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory((value as PatientGalleryCategory) ?? "BEFORE")}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      GALLERY_CATEGORY_LABELS[(value as PatientGalleryCategory) ?? "BEFORE"]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GALLERY_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {GALLERY_CATEGORY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gallery-caption">{t("captionLabel")}</Label>
              <Input
                id="gallery-caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder={t("captionPlaceholder")}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => void submitUpload()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("saveButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedKinds={["IMAGE"]}
        onSelect={setSelectedAsset}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("removeConfirmTitle")}
        description={t("removeConfirmDescription")}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
        cancelLabel={tc("cancel")}
        confirmLabel={t("remove")}
      />
    </div>
  );
}
