import { MoreVertical, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addMediaTags,
  deleteMedia,
  mediaThumbUrl,
  removeMediaTag,
  updateMedia,
  type MediaItem,
  type Project,
  type Tag,
} from "@/lib/api";
import { cleanFilename, formatBytes } from "@/lib/format";

/** A library item tile with a multi-select checkbox and an inline quick-action menu
 * (convert / move to project / add tag / delete). Clicking the body opens the detail editor. */
export function MediaCard({
  item,
  projects,
  tags,
  selected,
  onToggleSelect,
  onOpen,
  onChanged,
  onConvertOne,
}: {
  item: MediaItem;
  projects: Project[];
  tags: Tag[];
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onChanged: () => void;
  onConvertOne: () => void;
}) {
  const project = projects.find((p) => p.id === item.project_id);
  const thumbUrl = mediaThumbUrl(item);
  const isSaved = item.outputs.length === 0;
  const itemTagIds = new Set((item.tags ?? []).map((t) => t.id));

  const moveToProject = async (projectId: string | null) => {
    try {
      await updateMedia(item.task_id, projectId ? { project_id: projectId, clear_folder: true } : { clear_project: true, clear_folder: true });
      toast.success(projectId ? "Moved" : "Removed from project");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleTag = async (tag: Tag) => {
    try {
      if (itemTagIds.has(tag.id)) await removeMediaTag(item.task_id, tag.id);
      else await addMediaTags(item.task_id, [tag.id]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    try {
      await deleteMedia(item.task_id);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="group relative flex gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-accent-foreground/30">
      {/* Selection checkbox (always visible when selected, else on hover) */}
      <div
        className={selected ? "absolute left-2 top-2 z-10" : "absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select item" className="bg-card" />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-3 text-left"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
          {thumbUrl ? (
            <img src={thumbUrl} alt={cleanFilename(item.filename)} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
              {item.kind ?? "?"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 pr-6">
            <p className="truncate text-sm font-medium">{cleanFilename(item.filename) || item.task_id.slice(0, 8)}</p>
            <Badge variant={isSaved ? "outline" : "secondary"} className="ml-auto shrink-0 text-[10px]">
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
            {(item.tags ?? []).map((t) => (
              <Badge key={t.id} variant="outline" className="gap-1.5 font-normal">
                <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "currentColor" }} />
                {t.name}
              </Badge>
            ))}
            {item.notes && <Badge variant="outline" className="font-normal italic">note</Badge>}
          </div>
        </div>
      </button>

      {/* Quick-action menu */}
      <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Quick actions"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {item.has_source && (
              <>
                <DropdownMenuItem onSelect={onConvertOne}>
                  <Wand2 className="mr-2 h-4 w-4" /> Convert…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to project</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => moveToProject(null)}>No project</DropdownMenuItem>
                {projects.length > 0 && <DropdownMenuSeparator />}
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => moveToProject(p.id)}>
                    <span className="mr-2 h-2 w-2 rounded-full" style={{ background: p.color ?? "currentColor" }} />
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {tags.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Tags</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {tags.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={itemTagIds.has(t.id)}
                      onSelect={(e) => {
                        e.preventDefault();
                        toggleTag(t);
                      }}
                    >
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
