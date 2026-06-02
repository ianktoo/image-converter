import { useEffect, useState } from "react";
import { Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addMediaTags,
  convertMedia,
  createTag,
  deleteMedia,
  getMedia,
  listFolders,
  mediaOutputUrl,
  mediaThumbUrl,
  removeMediaTag,
  updateMedia,
  type Folder,
  type MediaItem,
  type Project,
  type Tag,
} from "@/lib/api";
import { cleanFilename, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IMAGE_FORMATS, NONE_VALUE, VIDEO_FORMATS } from "./constants";
import { InlineCreate } from "./InlineCreate";

/** Full-detail editor for a single library item: organize (project/folder/tags/notes),
 * convert from the saved original, download outputs, delete. */
export function MediaDetailDialog({
  item,
  projects,
  tags,
  onClose,
  onSaved,
  onTagsChanged,
}: {
  item: MediaItem | null;
  projects: Project[];
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
  onTagsChanged: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [projectId, setProjectId] = useState<string>(NONE_VALUE);
  const [folderId, setFolderId] = useState<string>(NONE_VALUE);
  const [notes, setNotes] = useState("");
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [convertFormats, setConvertFormats] = useState<string[]>(["webp"]);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!item) return;
    getMedia(item.task_id)
      .then((d) => {
        setDetail(d);
        setProjectId(d.project_id ?? NONE_VALUE);
        setFolderId(d.folder_id ?? NONE_VALUE);
        setNotes(d.notes ?? "");
        setActiveTagIds((d.tags ?? []).map((t) => t.id));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [item]);

  useEffect(() => {
    if (projectId === NONE_VALUE) {
      setFolders([]);
      setFolderId(NONE_VALUE);
      return;
    }
    listFolders({ projectId })
      .then((f) => {
        setFolders(f);
        if (folderId !== NONE_VALUE && !f.some((x) => x.id === folderId)) {
          setFolderId(NONE_VALUE);
        }
      })
      .catch(() => setFolders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!item) return null;

  const m = detail ?? item;
  const thumbUrl = mediaThumbUrl(m);
  const canConvert = m.has_source === true;
  const formatChoices = m.kind === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;

  const toggleTag = (tagId: string) =>
    setActiveTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));

  const toggleConvertFormat = (fmt: string) =>
    setConvertFormats((prev) => (prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]));

  const onSave = async () => {
    setBusy(true);
    try {
      const startTagIds = (detail?.tags ?? []).map((t) => t.id);
      const toAdd = activeTagIds.filter((id) => !startTagIds.includes(id));
      const toRemove = startTagIds.filter((id) => !activeTagIds.includes(id));

      const patch: Parameters<typeof updateMedia>[1] = { notes };
      if (projectId === NONE_VALUE) patch.clear_project = true;
      else patch.project_id = projectId;
      if (folderId === NONE_VALUE) patch.clear_folder = true;
      else patch.folder_id = folderId;

      await updateMedia(m.task_id, patch);
      if (toAdd.length) await addMediaTags(m.task_id, toAdd);
      for (const id of toRemove) await removeMediaTag(m.task_id, id);

      toast.success("Saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onConvert = async () => {
    if (!convertFormats.length) {
      toast.error("Pick at least one output format");
      return;
    }
    setConverting(true);
    try {
      const updated = await convertMedia(m.task_id, convertFormats);
      setDetail(updated);
      toast.success(`Converted → ${updated.outputs.length} output${updated.outputs.length === 1 ? "" : "s"}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setConverting(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    try {
      await deleteMedia(m.task_id);
      toast.success("Deleted");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateTag = async (name: string) => {
    try {
      const t = await createTag({ name });
      onTagsChanged();
      setActiveTagIds((prev) => [...prev, t.id]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{cleanFilename(m.filename) || m.task_id.slice(0, 8)}</DialogTitle>
          <DialogDescription>
            {m.outputs.length === 0 ? "saved" : m.status}
            {m.kind ? ` · ${m.kind}` : ""}
            {m.input_bytes != null ? ` · ${formatBytes(m.input_bytes)} in` : ""}
            {m.output_bytes != null ? ` · ${formatBytes(m.output_bytes)} out` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {thumbUrl && (
            <div className="overflow-hidden rounded-lg border bg-muted">
              <img src={thumbUrl} alt="" className="max-h-72 w-full object-contain" loading="lazy" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Folder</Label>
              <Select value={folderId} onValueChange={setFolderId} disabled={projectId === NONE_VALUE}>
                <SelectTrigger>
                  <SelectValue placeholder={projectId === NONE_VALUE ? "Select a project first" : "None"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => {
                const active = activeTagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active ? "border-foreground bg-accent" : "bg-card text-muted-foreground hover:border-accent-foreground/30",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "currentColor" }} />
                    {t.name}
                    {active && <X className="h-3 w-3" />}
                  </button>
                );
              })}
              <InlineCreate label="tag" onCreate={onCreateTag} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="media-notes">Notes</Label>
            <textarea
              id="media-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add a note about this item"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {canConvert && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label className="flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> Convert from original
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {formatChoices.map((fmt) => {
                  const active = convertFormats.includes(fmt);
                  return (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => toggleConvertFormat(fmt)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs uppercase transition-colors",
                        active ? "border-foreground bg-accent" : "bg-card text-muted-foreground hover:border-accent-foreground/30",
                      )}
                    >
                      {fmt}
                    </button>
                  );
                })}
                <Button type="button" size="sm" onClick={onConvert} disabled={converting} className="ml-auto">
                  {converting ? "Converting…" : "Convert"}
                </Button>
              </div>
            </div>
          )}

          {m.outputs.length > 0 && (
            <div className="space-y-1.5">
              <Label>Outputs</Label>
              <div className="flex flex-wrap gap-2">
                {m.outputs.map((name) => (
                  <Button key={name} asChild variant="outline" size="sm">
                    <a href={mediaOutputUrl(m.task_id, name)} download={cleanFilename(name)}>
                      {cleanFilename(name)}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:gap-2">
          <Button type="button" variant="ghost" onClick={onDelete} disabled={busy} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={busy}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
