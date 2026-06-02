import { Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addMediaTags, deleteMedia, updateMedia, type Project, type Tag } from "@/lib/api";

/** Sticky bar shown when one or more items are selected. Bulk ops loop the per-item
 * endpoints; convert hands off to the ConvertAllDialog with the selected task_ids. */
export function BulkActionBar({
  selectedIds,
  projects,
  tags,
  onClear,
  onConvertSelected,
  onChanged,
}: {
  selectedIds: string[];
  projects: Project[];
  tags: Tag[];
  onClear: () => void;
  onConvertSelected: () => void;
  onChanged: () => void;
}) {
  const n = selectedIds.length;

  const run = async (fn: (id: string) => Promise<unknown>, doneMsg: string) => {
    try {
      await Promise.all(selectedIds.map(fn));
      toast.success(doneMsg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const moveAll = (projectId: string | null) =>
    run(
      (id) => updateMedia(id, projectId ? { project_id: projectId, clear_folder: true } : { clear_project: true, clear_folder: true }),
      projectId ? `Moved ${n} item${n === 1 ? "" : "s"}` : "Removed from project",
    );

  const tagAll = (tag: Tag) => run((id) => addMediaTags(id, [tag.id]), `Tagged ${n} item${n === 1 ? "" : "s"}`);

  const deleteAll = () => {
    if (!confirm(`Delete ${n} item${n === 1 ? "" : "s"}? This removes their files too.`)) return;
    run((id) => deleteMedia(id), `Deleted ${n} item${n === 1 ? "" : "s"}`).then(onClear);
  };

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 px-3 shadow-md backdrop-blur">
      <span className="text-sm font-medium">{n} selected</span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-8">
        <X className="mr-1 h-3.5 w-3.5" /> Clear
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onConvertSelected} className="h-8">
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Convert all
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8">Move to</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => moveAll(null)}>No project</DropdownMenuItem>
            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => moveAll(p.id)}>
                <span className="mr-2 h-2 w-2 rounded-full" style={{ background: p.color ?? "currentColor" }} />
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={tags.length === 0}>Add tag</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {tags.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => tagAll(t)}>
                <span className="mr-2 h-2 w-2 rounded-full" style={{ background: t.color ?? "currentColor" }} />
                {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" size="sm" onClick={deleteAll} className="h-8 text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}
