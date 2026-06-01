import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, FolderIcon, GalleryHorizontalEnd } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getObservability,
  listFolders,
  listMedia,
  listTags,
  mediaThumbUrl,
  type Folder,
  type MediaItem,
  type ObservabilitySummary,
  type Tag,
} from "@/lib/api";
import { cleanFilename, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export function GalleryView() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagFilter, setTagFilter] = useState<string>(ALL);
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [obs, setObs] = useState<ObservabilitySummary | null>(null);

  const refresh = useCallback(() => {
    listMedia({ tagId: tagFilter === ALL ? undefined : tagFilter, limit: 500 })
      .then(setItems)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [tagFilter]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    listTags().then(setTags).catch(() => {});
    listFolders().then(setFolders).catch(() => {});
    getObservability().then(setObs).catch(() => {});
  }, []);

  // Only images can be shown as tiles; group them by folder.
  const images = useMemo(
    () => (items ? items.filter((m) => m.kind === "image" && mediaThumbUrl(m)) : null),
    [items],
  );

  const byFolder = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const m of images ?? []) {
      const key = m.folder_id ?? "__loose__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [images]);

  const foldersWithImages = useMemo(
    () => folders.filter((f) => (byFolder.get(f.id)?.length ?? 0) > 0),
    [folders, byFolder],
  );
  const looseImages = byFolder.get("__loose__") ?? [];

  const visibleImages = currentFolder ? (byFolder.get(currentFolder.id) ?? []) : looseImages;

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse your library visually. Folders show a stacked preview of what&apos;s inside — click to open.
          </p>
        </div>

        {obs && <ObservabilityStrip obs={obs} />}

        {tags.length > 0 && !currentFolder && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={tagFilter === ALL} onClick={() => setTagFilter(ALL)} label="All" />
            {tags.map((t) => (
              <FilterChip
                key={t.id}
                active={tagFilter === t.id}
                onClick={() => setTagFilter(t.id)}
                label={t.name}
                color={t.color}
              />
            ))}
          </div>
        )}

        {currentFolder && (
          <button
            type="button"
            onClick={() => setCurrentFolder(null)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> All folders
            <span className="ml-1 font-medium text-foreground">/ {currentFolder.name}</span>
          </button>
        )}

        {images === null ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
          </div>
        ) : (images.length === 0) ? (
          <Empty />
        ) : (
          <div className="space-y-6">
            {/* Folder tiles only at the top level */}
            {!currentFolder && foldersWithImages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {foldersWithImages.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f}
                    items={byFolder.get(f.id) ?? []}
                    onClick={() => setCurrentFolder(f)}
                  />
                ))}
              </div>
            )}

            {visibleImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {visibleImages.map((m) => (
                  <ImageTile key={m.task_id} item={m} onClick={() => setOpenItem(m)} />
                ))}
              </div>
            ) : currentFolder ? (
              <p className="text-sm text-muted-foreground">This folder has no images.</p>
            ) : foldersWithImages.length === 0 ? (
              <Empty />
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={!!openItem} onOpenChange={(open) => !open && setOpenItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {openItem && <PreviewBody item={openItem} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ObservabilityStrip({ obs }: { obs: ObservabilitySummary }) {
  const saved = Math.round(obs.total_input_bytes - obs.total_output_bytes);
  const stats: { label: string; value: string }[] = [
    { label: "Sessions", value: String(obs.sessions_total) },
    { label: "Library items", value: String(obs.media_total) },
    { label: "Conversions", value: String(obs.conversions_total) },
    { label: "Events", value: String(obs.events_total) },
    { label: "Bytes saved", value: saved > 0 ? formatBytes(saved) : "—" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="text-lg font-semibold">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function FolderTile({ folder, items, onClick }: { folder: Folder; items: MediaItem[]; onClick: () => void }) {
  // Build a stacked "pile of photos" from the first few image thumbnails.
  const thumbs = items.map(mediaThumbUrl).filter(Boolean).slice(0, 3) as string[];
  const rotations = ["-6deg", "3deg", "0deg"];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-colors hover:border-accent-foreground/30"
    >
      <div className="relative aspect-square w-full">
        {thumbs.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center rounded-md border bg-muted">
            <FolderIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : (
          thumbs
            .slice()
            .reverse()
            .map((src, idx) => {
              // last in reversed array (top of stack) is the first/most-relevant image
              const layer = thumbs.length - 1 - idx;
              return (
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full rounded-md border bg-muted object-cover shadow-sm transition-transform group-hover:scale-[1.02]"
                  style={{
                    transform: `rotate(${rotations[layer] ?? "0deg"}) translate(${layer * 3}px, ${layer * 3}px)`,
                    zIndex: thumbs.length - layer,
                  }}
                />
              );
            })
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{folder.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{items.length}</span>
      </div>
    </button>
  );
}

function ImageTile({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const url = mediaThumbUrl(item);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
    >
      {url && (
        <img
          src={url}
          alt={cleanFilename(item.filename)}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-left opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-xs font-medium text-white">{cleanFilename(item.filename) || item.task_id.slice(0, 8)}</p>
        {item.input_bytes != null && (
          <p className="text-[10px] text-white/70">{formatBytes(item.input_bytes)}</p>
        )}
      </div>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-foreground bg-accent" : "bg-card text-muted-foreground hover:border-accent-foreground/30",
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}

function Empty() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <GalleryHorizontalEnd className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium">Nothing to show</p>
          <p className="text-sm text-muted-foreground">Upload images on the Media tab and they&apos;ll appear here.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewBody({ item }: { item: MediaItem }) {
  const url = mediaThumbUrl(item);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{cleanFilename(item.filename) || item.task_id.slice(0, 8)}</DialogTitle>
      </DialogHeader>
      {url && (
        <div className="overflow-hidden rounded-lg border bg-muted">
          <img src={url} alt="" className="max-h-[70vh] w-full object-contain" />
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {item.kind ?? "media"}
        {item.input_bytes != null ? ` · ${formatBytes(item.input_bytes)} in` : ""}
        {item.output_bytes != null ? ` · ${formatBytes(item.output_bytes)} out` : ""}
      </p>
    </>
  );
}
