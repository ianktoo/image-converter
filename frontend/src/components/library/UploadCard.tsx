import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createFolder,
  createProject,
  listFolders,
  saveMedia,
  type Folder,
  type Project,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { NONE_VALUE } from "./constants";
import { InlineCreate } from "./InlineCreate";

/** Drop/select files to save into the library (no conversion). Target project/folder
 * default to the current scope, and both are creatable inline so you never leave. */
export function UploadCard({
  projects,
  defaultProjectId,
  defaultFolderId,
  onSaved,
  onProjectsChanged,
}: {
  projects: Project[];
  defaultProjectId?: string;
  defaultFolderId?: string;
  onSaved: () => void;
  onProjectsChanged: () => void;
}) {
  const [targetProject, setTargetProject] = useState<string>(defaultProjectId ?? NONE_VALUE);
  const [targetFolder, setTargetFolder] = useState<string>(defaultFolderId ?? NONE_VALUE);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the target in sync when the surrounding scope changes.
  useEffect(() => {
    setTargetProject(defaultProjectId ?? NONE_VALUE);
    setTargetFolder(defaultFolderId ?? NONE_VALUE);
  }, [defaultProjectId, defaultFolderId]);

  const loadFolders = useCallback((projectId: string) => {
    if (projectId === NONE_VALUE) {
      setFolders([]);
      return;
    }
    listFolders({ projectId }).then(setFolders).catch(() => setFolders([]));
  }, []);

  useEffect(() => {
    if (targetProject === NONE_VALUE) {
      setFolders([]);
      setTargetFolder(NONE_VALUE);
      return;
    }
    loadFolders(targetProject);
  }, [targetProject, loadFolders]);

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
          <p className="text-xs text-muted-foreground">Images and videos are saved to your library without converting.</p>
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
          <InlineCreate
            label="project"
            onCreate={async (name) => {
              const p = await createProject({ name });
              onProjectsChanged();
              setTargetProject(p.id);
            }}
          />
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
          {targetProject !== NONE_VALUE && (
            <InlineCreate
              label="folder"
              onCreate={async (name) => {
                const f = await createFolder({ name, project_id: targetProject });
                loadFolders(targetProject);
                setTargetFolder(f.id);
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
