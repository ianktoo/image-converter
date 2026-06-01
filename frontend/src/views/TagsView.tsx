import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createTag, deleteTag, listTags, updateTag, type Tag } from "@/lib/api";
import { cn } from "@/lib/utils";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6"];

export function TagsView() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);

  const refresh = useCallback(() => {
    listTags()
      .then(setTags)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createTag({ name: trimmed, color: newColor });
      toast.success(`Tag "${trimmed}" created`);
      setNewName("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lightweight labels for cross-cutting organization. Each conversion can have any number of tags.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onCreate} className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="New tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="min-w-0 max-w-xs flex-1"
              />
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform",
                      newColor === c ? "scale-110 border-foreground" : "border-transparent",
                    )}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <Button type="submit" disabled={!newName.trim() || creating} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">All tags</h2>
          {tags === null ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-20" />)}
            </div>
          ) : tags.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <TagIcon className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No tags yet. Add one above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setEditTag(tag)}
                  className="group inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-accent-foreground/30"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: tag.color || "var(--muted-foreground)" }}
                  />
                  <span>{tag.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editTag} onOpenChange={(open) => !open && setEditTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit tag</DialogTitle>
          </DialogHeader>
          {editTag && (
            <EditTagForm
              tag={editTag}
              onSaved={() => {
                setEditTag(null);
                refresh();
              }}
              onCancel={() => setEditTag(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditTagForm({ tag, onSaved, onCancel }: { tag: Tag; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || COLORS[0]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateTag(tag.id, { name: name.trim(), color });
      toast.success("Tag updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteTag(tag.id);
      toast.success("Tag deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tag-name">Name</Label>
          <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform",
                  color === c ? "scale-110 border-foreground" : "border-transparent",
                )}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={busy || !name.trim()}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
