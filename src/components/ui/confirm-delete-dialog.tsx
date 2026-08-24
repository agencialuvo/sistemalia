"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Generic "are you sure" gate for irreversible deletes (spec: "modal de
 * confirmación... antes de ejecutar la eliminación en backend").
 *
 * Deliberately content-agnostic — title/description are passed in — so the
 * same component guards both the single-card "Eliminar" action and the bulk
 * "Eliminar seleccionados" bar without two near-identical dialogs drifting
 * apart over time.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  loading,
  onConfirm,
  cancelLabel,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  loading: boolean;
  onConfirm: () => void;
  /** Overrides the default Services-namespace labels — pass these when the
   *  dialog is reused from another module (e.g. /personal), so the buttons
   *  read from that module's own translations instead. */
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  const t = useTranslations("Services");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {confirmLabel ?? t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
