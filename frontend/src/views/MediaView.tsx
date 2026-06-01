import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Search, Trash2, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addMediaTags,
  convertMedia,
  deleteMedia,
  getMedia,
  listFolders,
  listMedia,
  listProjects,
  listTags,
  mediaOutputUrl,
  mediaThumbUrl,
  removeMediaTag,
  saveMedia,
  updateMedia,
  type Folder,
  type MediaFilter,
  type MediaItem,
  type Project,
  type Tag,
} from "@/lib/api";
import { cleanFilename, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const NONE_VALUE = "__none__";
const ALL_VALUE = "__all__";
const IMAGE_FORMATS = ["webp", "jpeg", "png", "avif"];
const VIDEO_FORMATS = ["webp", "mp4", "webm"];

type KindFilter = "all" | "image" | "video";

export function MediaView() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [q, setQ] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>(ALL_VALUE);
  const [tagFilter, setTagFilter] = useState<string>(ALL_VALUE);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);

  const refresh = useCallback(() => {
    const filter: MediaFilter = { limit: 200 };
    if (projectFilter !== ALL_VALUE) filter.projectId = projectFilter;
    if (tagFilter !== ALL_VALUE) filter.tagId = tagFilter;
    if (q.trim()) filter.q = q.trim();
    listMedia(filter)
      .then(setItems)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [q, projectFilter, tagFilter]);

  useEffect(refresh, [refresh]);

  const refreshProjects = useCallback(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    refreshProjects();
    listTags().then(setTags).catch(() => {});
  }, [refreshProjects]);

  const filteredByKind = useMemo(() => {
    if (!items) return null;
    if (kindFilter === "all") return items;
    return items.filter((m) => m.kind === kindFilter);
  }, [items, kindFilter]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Save media to your library, organize it into projects, folders, and tags, then convert it whenever you&apos;re ready.
          </p>
        </div>

        <UploadCard projects={projects} onSaved={refresh} />

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <div className="relative min-w-0 flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search filenames"
                className="pl-8"
              />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="image">Images</TabsTrigger>
                <TabsTrigger value="video">Videos</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {filteredByKind === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : filteredByKind.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredByKind.map((m) => (
              <MediaRow key={m.task_id} item={m} projects={projects} onOpen={() => setOpenItem(m)} />
            ))}
          </div>
        )}
      </div>

      <MediaDetailDialog
        item={openItem}
        projects={projects}
        tags={tags}
        onClose={() => setOpenItem(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function UploadCard({ projects, onSaved }: { projects: Project[]; onSaved: () => void }) {
  const [targetProject, setTargetProject] = useState<string>(NONE_VALUE);
  const [targetFolder, setTargetFolder] = useState<string>(NONE_VALUE);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (targetProject === NONE_VALUE) {
      setFolders([]);
      setTargetFolder(NONE_VALUE);
      return;
    }
    listFolders({ projectId: targetProject })
      .then(setFolders)
      .catch(() => setFolders([]));
  }, [targetProject]);

  const doSave = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      try {
        const items = await saveMedia(files, {
          projectId: targetProject === NONE_VALUE ? undefined : targetProject,
          folderId: targetFolder === NONE_VALUE ? undefined : targetFolder,
        });
        toast.success(`Saved ${items.length} file${items.length === 1 ? "" : "s"} to library`);
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [targetProject, targetFolder, onSaved],
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            doSave(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-foreground bg-accent" : "hover:border-accent-foreground/40",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{busy ? "Saving…" : "Drop files here or click to upload"}</p>
          <p className="text-xs text-muted-foreground">
            Images and videos are saved to your library without converting.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,.heic,.heif"
            className="hidden"
            onChange={(e) => e.target.files && doSave(Array.from(e.target.files))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Save into:</span>
          <Select value={targetProject} onValueChange={setTargetProject}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetFolder} onValueChange={setTargetFolder} disabled={targetProject === NONE_VALUE}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue placeholder={targetProject === NONE_VALUE ? "Pick a project first" : "No folder"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No folder</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No media here</p>
          <p className="text-sm text-muted-foreground">Upload files above to start building your library.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MediaRow({
  item,
  projects,
  onOpen,
}: {
  item: MediaItem;
  projects: Project[];
  onOpen: () => void;
}) {
  const project = projects.find((p) => p.id === item.project_id);
  const thumbUrl = mediaThumbUrl(item);
  const isSaved = item.outputs.length === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-accent-foreground/30"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={cleanFilename(item.filename)}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.kind ?? "?"}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{cleanFilename(item.filename) || item.task_id.slice(0, 8)}</p>
          <Badge variant={isSaved ? "outline" : "secondary"} className="shrink-0 text-[10px]">
            {isSaved ? "Saved" : `${item.output_count} output${item.output_count === 1 ? "" : "s"}`}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {item.input_bytes != null && <span>{formatBytes(item.input_bytes)}</span>}
          {item.kind && <span>· {item.kind}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {project && (
            <Badge variant="secondary" className="gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: project.color ?? "currentColor" }} />
              {project.name}
            </Badge>
          )}
          {item.notes && (
            <Badge variant="outline" className="font-normal italic">
              note
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function MediaDetailDialog({
  item,
  projects,
  tags,
  onClose,
  onSaved,
}: {
  item: MediaItem | null;
  projects: Project[];
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
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

  const toggleTag = (tagId: string) => {
    setActiveTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const toggleConvertFormat = (fmt: string) => {
    setConvertFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt],
    );
  };

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
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tags exist. Create some on the Tags page.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
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
              </div>
            )}
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
