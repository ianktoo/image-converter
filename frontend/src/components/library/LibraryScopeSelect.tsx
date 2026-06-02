import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project, Tag } from "@/lib/api";
import type { Scope } from "./constants";

/** Compact scope picker for small screens (the tree is hidden below md). Encodes the
 * scope as the select value: "all" | "project:<id>" | "tag:<id>". */
export function LibraryScopeSelect({
  scope,
  setScope,
  projects,
  tags,
  className,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  projects: Project[];
  tags: Tag[];
  className?: string;
}) {
  const value =
    scope.kind === "project" || scope.kind === "folder"
      ? `project:${scope.projectId}`
      : scope.kind === "tag"
        ? `tag:${scope.tagId}`
        : "all";

  const onChange = (v: string) => {
    if (v === "all") setScope({ kind: "all" });
    else if (v.startsWith("project:")) setScope({ kind: "project", projectId: v.slice(8) });
    else if (v.startsWith("tag:")) setScope({ kind: "tag", tagId: v.slice(4) });
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="All media" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All media</SelectItem>
        {projects.length > 0 && (
          <SelectGroup>
            <SelectLabel>Projects</SelectLabel>
            {projects.map((p) => (
              <SelectItem key={p.id} value={`project:${p.id}`}>{p.name}</SelectItem>
            ))}
          </SelectGroup>
        )}
        {tags.length > 0 && (
          <SelectGroup>
            <SelectLabel>Tags</SelectLabel>
            {tags.map((t) => (
              <SelectItem key={t.id} value={`tag:${t.id}`}>#{t.name}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
