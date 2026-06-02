import type { MediaFilter } from "@/lib/api";

/** Sentinel select values (empty string isn't allowed by the Select primitive). */
export const NONE_VALUE = "__none__";
export const ALL_VALUE = "__all__";

export const IMAGE_FORMATS = ["webp", "jpeg", "png", "avif"];
export const VIDEO_FORMATS = ["webp", "mp4", "webm"];

/** The active "place" in the library the user is viewing. */
export type Scope =
  | { kind: "all" }
  | { kind: "project"; projectId: string }
  | { kind: "folder"; projectId: string; folderId: string }
  | { kind: "tag"; tagId: string };

/** Map a scope to the listMedia() filter. */
export function scopeToFilter(scope: Scope): MediaFilter {
  switch (scope.kind) {
    case "project":
      return { projectId: scope.projectId };
    case "folder":
      return { folderId: scope.folderId };
    case "tag":
      return { tagId: scope.tagId };
    default:
      return {};
  }
}

export function scopesEqual(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "project" && b.kind === "project") return a.projectId === b.projectId;
  if (a.kind === "folder" && b.kind === "folder") return a.folderId === b.folderId;
  if (a.kind === "tag" && b.kind === "tag") return a.tagId === b.tagId;
  return true;
}
