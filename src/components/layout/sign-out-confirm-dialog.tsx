"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";

/**
 * "¿Seguro que quieres cerrar sesión?" gate — a real dialog, not
 * `window.confirm()` (consistent with ConfirmDeleteDialog's reasoning: a
 * native browser alert can't be themed and reads as unpolished next to the
 * rest of the app). Owns the signOut call itself so every trigger point
 * (header dropdown, sidebar dropdown, sidebar's standalone row) can render
 * the same instance behavior without re-wiring useAuth at each call site.
 */
export function SignOutConfirmDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Sidebar");
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const confirm = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      // No `finally -> onOpenChange(false)` needed on success: signOut()
      // navigates away from the dashboard, which unmounts this dialog.
      setSigningOut(false);
    }
  }, [signOut]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
            <LogOut className="size-5 text-destructive" />
          </div>
          <DialogTitle className="text-lg">{t("signOutConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("signOutConfirmDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signingOut}>
            {t("signOutCancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirm()}
            disabled={signingOut}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {signingOut && <LogOut className="mr-1.5 size-4 animate-pulse" />}
            {t("signOutConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
