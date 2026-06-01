import { useCallback, useEffect, useState } from "react";
import { FolderIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const SWATCHES = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Group media items into projects. Each project can contain folders.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New project
          </Button>
        </div>

        {projects === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <FolderIcon className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground">Create one to start organizing your media.</p>
              </div>
              <Button onClick={() => setCreateOpen(true)} size="sm">
                <Plus className="mr-1 h-4 w-4" /> Create project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditProject(p)}
                className="group rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-accent-foreground/30"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: p.color || "var(--muted-foreground)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    {p.description && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">{p.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSaved={() => {
          refresh();
        }}
      />
      <ProjectFormDialog
        open={!!editProject}
        onOpenChange={(open) => !open && setEditProject(null)}
        mode="edit"
        project={editProject ?? undefined}
        onSaved={() => {
          setEditProject(null);
          refresh();
        }}
      />
    </div>
  );
}

function ProjectFormDialog({
  open,
  onOpenChange,
  mode,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  project?: Project;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? SWATCHES[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setDescription(project?.description ?? "");
      setColor(project?.color ?? SWATCHES[0]);
    }
  }, [open, project]);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (mode === "create") {
        await createProject({ name: trimmed, description: description.trim() || undefined, color });
        toast.success("Project created");
      } else if (project) {
        await updateProject(project.id, { name: trimmed, description: description.trim(), color });
        toast.success("Project updated");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New project" : "Edit project"}</DialogTitle>
          <DialogDescription>
            Projects help group media items. Color is shown as a small dot in lists.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand redesign" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description</Label>
            <Input id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
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
          {mode === "edit" && (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={busy || !name.trim()}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
