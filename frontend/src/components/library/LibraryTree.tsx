import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FolderIcon, ImageIcon, TagIcon } from "lucide-react";
import { toast } from "sonner";
import {
  createFolder,
  createProject,
  createTag,
  listFolders,
  type Folder,
  type Project,
  type Tag,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Scope } from "./constants";
import { InlineCreate } from "./InlineCreate";

/** Left-rail navigation: All media · Projects (→ folders) · Tags. Every level can create
 * inline, so organizing never means leaving the workspace. */
export function LibraryTree({
  scope,
  setScope,
  projects,
  tags,
  onProjectsChanged,
  onTagsChanged,
  className,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  projects: Project[];
  tags: Tag[];
  onProjectsChanged: () => void;
  onTagsChanged: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [foldersByProject, setFoldersByProject] = useState<Record<string, Folder[]>>({});

  const loadFolders = useCallback((projectId: string) => {
    listFolders({ projectId })
      .then((f) => setFoldersByProject((prev) => ({ ...prev, [projectId]: f })))
      .catch(() => {});
  }, []);

  // Keep the active project expanded + its folders loaded.
  useEffect(() => {
    const pid = scope.kind === "project" || scope.kind === "folder" ? scope.projectId : null;
    if (pid && !expanded.has(pid)) {
      setExpanded((prev) => new Set(prev).add(pid));
      loadFolders(pid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const toggle = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else {
        next.add(projectId);
        if (!foldersByProject[projectId]) loadFolders(projectId);
      }
      return next;
    });
  };

  const rowCls = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
      active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  return (
    <div className={cn("space-y-4 text-sm", className)}>
      <button type="button" className={rowCls(scope.kind === "all")} onClick={() => setScope({ kind: "all" })}>
        <ImageIcon className="h-4 w-4 shrink-0" /> All media
      </button>

      <div className="space-y-1">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</p>
        {projects.map((p) => {
          const isOpen = expanded.has(p.id);
          const folders = foldersByProject[p.id] ?? [];
          return (
            <div key={p.id}>
              <div className="flex items-center">
                <button type="button" onClick={() => toggle(p.id)} className="rounded p-1 text-muted-foreground hover:bg-accent/50" aria-label="Toggle folders">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className={cn(rowCls(scope.kind === "project" && scope.projectId === p.id), "flex-1")}
                  onClick={() => setScope({ kind: "project", projectId: p.id })}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "currentColor" }} />
                  <span className="truncate">{p.name}</span>
                </button>
              </div>
              {isOpen && (
                <div className="ml-6 space-y-0.5 border-l pl-2">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={rowCls(scope.kind === "folder" && scope.folderId === f.id)}
                      onClick={() => setScope({ kind: "folder", projectId: p.id, folderId: f.id })}
                    >
                      <FolderIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                  <InlineCreate
                    label="folder"
                    onCreate={async (name) => {
                      await createFolder({ name, project_id: p.id });
                      loadFolders(p.id);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        <InlineCreate
          label="project"
          onCreate={async (name) => {
            try {
              await createProject({ name });
              onProjectsChanged();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </div>

      <div className="space-y-1">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
        <div className="flex flex-wrap gap-1.5 px-2">
          {tags.map((t) => {
            const active = scope.kind === "tag" && scope.tagId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setScope(active ? { kind: "all" } : { kind: "tag", tagId: t.id })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  active ? "border-foreground bg-accent" : "text-muted-foreground hover:border-accent-foreground/30",
                )}
              >
                <TagIcon className="h-3 w-3" /> {t.name}
              </button>
            );
          })}
        </div>
        <InlineCreate
          label="tag"
          className="mx-1"
          onCreate={async (name) => {
            try {
              await createTag({ name });
              onTagsChanged();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </div>
    </div>
  );
}
