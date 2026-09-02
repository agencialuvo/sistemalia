"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createClinicalNote } from "@/lib/patients/api";
import type { PatientClinicalNote } from "@/lib/validators/patient";

/** "2026-08-28T10:00:00.000Z" -> "28 ago 2026, 10:00". */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tab 4 — Notas Clínicas & Evoluciones (Fase 3, plan §1): timeline de notas
 * más un formulario desplegable para redactar una nueva.
 */
export function PatientNotesTab({
  patientId,
  notes,
  onNoteCreated,
}: {
  patientId: string;
  notes: PatientClinicalNote[];
  onNoteCreated: (note: PatientClinicalNote) => void;
}) {
  const t = useTranslations("Patients.detail.notes");
  const tc = useTranslations("Patients.common");

  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t("validationFailed"));
      return;
    }
    setSaving(true);
    try {
      const note = await createClinicalNote(patientId, {
        title: title.trim(),
        content: content.trim(),
        isPrivate,
      });
      onNoteCreated(note);
      toast.success(t("created"));
      setTitle("");
      setContent("");
      setIsPrivate(false);
      setFormOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("createFailed")));
    } finally {
      setSaving(false);
    }
  }, [patientId, title, content, isPrivate, onNoteCreated, t]);

  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        {!formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            {t("addButton")}
          </Button>
        )}
      </div>

      {formOpen && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-medium text-foreground">{t("formTitle")}</h4>
          <div>
            <Label htmlFor="note-title">{t("titleLabel")}</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("titlePlaceholder")}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="note-content">{t("contentLabel")}</Label>
            <Textarea
              id="note-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("contentPlaceholder")}
              rows={4}
              className="mt-1.5"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">{t("privateLabel")}</p>
              <p className="text-xs text-muted-foreground">{t("privateHelp")}</p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("saveButton")}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((note) => (
            <div key={note.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{note.title}</h4>
                <Badge variant={note.isPrivate ? "destructive" : "secondary"} className="shrink-0 gap-1">
                  {note.isPrivate ? <Lock className="size-3" /> : <Users className="size-3" />}
                  {note.isPrivate ? t("privateBadge") : t("sharedBadge")}
                </Badge>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                {note.content}
              </p>
              <p className="mt-2 text-xs text-muted-foreground/70">{formatDateTime(note.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
