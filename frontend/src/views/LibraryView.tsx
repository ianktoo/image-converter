import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listMedia,
  listProjects,
  listTags,
  type LibraryConvertScope,
  type MediaItem,
  type Project,
  type Tag,
} from "@/lib/api";
import { BulkActionBar } from "@/components/library/BulkActionBar";
import { ConvertAllDialog } from "@/components/library/ConvertAllDialog";
import { LibraryScopeSelect } from "@/components/library/LibraryScopeSelect";
import { LibraryTree } from "@/components/library/LibraryTree";
import { MediaCard } from "@/components/library/MediaCard";
import { MediaDetailDialog } from "@/components/library/MediaDetailDialog";
import { UploadCard } from "@/components/library/UploadCard";
import { scopeToFilter, type Scope } from "@/components/library/constants";

type KindFilter = "all" | "image" | "video";

type ConvertRequest = {
  scope: LibraryConvertScope;
  title: string;
  convertibleCount: number;
  skippedCount: number;
  kind: "image" | "video" | "mixed";
};

export function LibraryView() {
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = useState<MediaItem | null>(null);
  const [convertReq, setConvertReq] = useState<ConvertRequest | null>(null);

  const refreshProjects = useCallback(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);
  const refreshTags = useCallback(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    const filter = scopeToFilter(scope);
    filter.limit = 500;
    if (q.trim()) filter.q = q.trim();
    listMedia(filter)
      .then(setItems)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [scope, q]);

  useEffect(() => {
    refreshProjects();
    refreshTags();
  }, [refreshProjects, refreshTags]);

  useEffect(refresh, [refresh]);

  // Selection is per-view: clear it whenever the scope changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [scope]);

  const visibleItems = useMemo(() => {
    if (!items) return null;
    if (kindFilter === "all") return items;
    return items.filter((m) => m.kind === kindFilter);
  }, [items, kindFilter]);

  const toggleSelect = (taskId: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const scopeTitle = useMemo(() => {
    if (scope.kind === "project") return projects.find((p) => p.id === scope.projectId)?.name ?? "Project";
    if (scope.kind === "folder") return "Folder";
    if (scope.kind === "tag") return `#${tags.find((t) => t.id === scope.tagId)?.name ?? "tag"}`;
    return "All media";
  }, [scope, projects, tags]);

  const kindOf = (set: MediaItem[]): "image" | "video" | "mixed" => {
    const hasVideo = set.some((m) => m.kind === "video");
    const hasImage = set.some((m) => m.kind === "image");
    if (hasVideo && !hasImage) return "video";
    if (hasImage && !hasVideo) return "image";
    return "mixed";
  };

  /** Build the convert request from the current selection (preferred) or the whole scope. */
  const buildConvertRequest = (single?: MediaItem): ConvertRequest | null => {
    let base: MediaItem[];
    let convertScope: LibraryConvertScope;
    let title: string;

    if (single) {
      base = [single];
      convertScope = { task_ids: [single.task_id] };
      title = single.filename ?? "1 item";
    } else if (selectedIds.size > 0) {
      base = (visibleItems ?? []).filter((m) => selectedIds.has(m.task_id));
      convertScope = { task_ids: base.map((m) => m.task_id) };
      title = `${base.length} selected`;
    } else {
      base = visibleItems ?? [];
      if (scope.kind === "folder") convertScope = { folder_id: scope.folderId };
      else if (scope.kind === "project") convertScope = { project_id: scope.projectId };
      else convertScope = { task_ids: base.map((m) => m.task_id) }; // all / tag
      title = scopeTitle;
    }

    const convertible = base.filter((m) => m.has_source);
    if (convertible.length === 0 && !("project_id" in convertScope || "folder_id" in convertScope)) {
      toast.error("Nothing to convert — these items have no saved original.");
      return null;
    }
    return {
      scope: convertScope,
      title,
      convertibleCount: convertible.length,
      skippedCount: base.length - convertible.length,
      kind: kindOf(convertible.length ? convertible : base),
    };
  };

  const openConvertAll = (single?: MediaItem) => {
    const req = buildConvertRequest(single);
    if (req) setConvertReq(req);
  };

  const selectedArr = useMemo(() => [...selectedIds], [selectedIds]);

  return (
    <div className="flex min-h-full">
      {/* Desktop tree rail */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto border-r p-4 md:block">
        <LibraryTree
          scope={scope}
          setScope={setScope}
          projects={projects}
          tags={tags}
          onProjectsChanged={refreshProjects}
          onTagsChanged={refreshTags}
        />
      </aside>

      <div className="min-w-0 flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Save media, organize into projects, folders, and tags, and convert it — all in one place.
            </p>
          </div>

          {/* Mobile scope picker */}
          <div className="md:hidden">
            <LibraryScopeSelect scope={scope} setScope={setScope} projects={projects} tags={tags} className="w-full" />
          </div>

          <UploadCard
            projects={projects}
            defaultProjectId={scope.kind === "project" || scope.kind === "folder" ? scope.projectId : undefined}
            defaultFolderId={scope.kind === "folder" ? scope.folderId : undefined}
            onSaved={refresh}
            onProjectsChanged={refreshProjects}
          />

          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 pt-6">
              <div className="relative min-w-0 flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filenames" className="pl-8" />
              </div>
              <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="image">Images</TabsTrigger>
                  <TabsTrigger value="video">Videos</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                type="button"
                className="ml-auto"
                onClick={() => openConvertAll()}
                disabled={!visibleItems || visibleItems.length === 0}
              >
                <Wand2 className="mr-1.5 h-4 w-4" /> Convert all
              </Button>
            </CardContent>
          </Card>

          {selectedArr.length > 0 && (
            <BulkActionBar
              selectedIds={selectedArr}
              projects={projects}
              tags={tags}
              onClear={() => setSelectedIds(new Set())}
              onConvertSelected={() => openConvertAll()}
              onChanged={() => {
                refresh();
                setSelectedIds(new Set());
              }}
            />
          )}

          {visibleItems === null ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : visibleItems.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Nothing here yet</p>
                  <p className="text-sm text-muted-foreground">Upload files above to start building your library.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleItems.map((m) => (
                <MediaCard
                  key={m.task_id}
                  item={m}
                  projects={projects}
                  tags={tags}
                  selected={selectedIds.has(m.task_id)}
                  onToggleSelect={() => toggleSelect(m.task_id)}
                  onOpen={() => setOpenItem(m)}
                  onChanged={refresh}
                  onConvertOne={() => openConvertAll(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MediaDetailDialog
        item={openItem}
        projects={projects}
        tags={tags}
        onClose={() => setOpenItem(null)}
        onSaved={refresh}
        onTagsChanged={refreshTags}
      />

      {convertReq && (
        <ConvertAllDialog
          scope={convertReq.scope}
          title={convertReq.title}
          convertibleCount={convertReq.convertibleCount}
          skippedCount={convertReq.skippedCount}
          kind={convertReq.kind}
          onClose={() => setConvertReq(null)}
          onConverted={refresh}
        />
      )}
    </div>
  );
}
