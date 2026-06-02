import { throwApiError } from "./apiErrors";
import { env } from "./env";
import { getSessionHeaders, getSessionId, setSessionId } from "./session";

const API = env.apiBaseUrl ? `${env.apiBaseUrl.replace(/\/$/, "")}/api` : "/api";

/** Fetch with session ID; capture X-Session-ID from response so new sessions are persisted. */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const sessionHeaders = getSessionHeaders();
  Object.entries(sessionHeaders).forEach(([k, v]) => headers.set(k, v));
  const r = await fetch(input, { ...init, headers });
  const newSid = r.headers.get("X-Session-ID");
  if (newSid) setSessionId(newSid);
  return r;
}

export type FormatsResponse = {
  image: string[];
  video: string[];
  output_image: string[];
  output_video: string[];
};

export type PresetsResponse = Record<string, [number, number] | null>;

export type BatchResponse = {
  batch_id: string;
  status: string;
  task_ids: string[];
  error?: string | null;
  zip_filename?: string | null;
};

export type TaskResponse = {
  task_id: string;
  filename: string;
  status: string;
  progress: number;
  error?: string | null;
  output_formats: string[];
  output_paths: string[];
  input_size?: number | null;
  output_sizes?: number[];
};

/** Response from POST /api/url-preview for displaying image and properties from a URL. */
export type UrlPreviewResponse = {
  filename: string;
  content_type: string;
  content_length: number;
  width?: number;
  height?: number;
  data_url?: string;
};

export type LimitsResponse = {
  max_images_per_upload: number;
  max_image_size_mb: number;
  max_image_size_bytes: number;
  max_videos_per_upload: number;
  max_video_size_mb: number;
  max_video_size_bytes: number;
};

export type SessionStatsResponse = {
  images_uploaded: number;
  images_output: number;
  total_input_bytes: number;
  total_output_bytes: number;
  compression_percent: number;
  time_spent_seconds: number;
};

export type SessionActivity = {
  task_id: string;
  batch_id: string | null;
  filename: string | null;
  input_bytes: number | null;
  output_bytes: number | null;
  output_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
};

export async function getLimits(): Promise<LimitsResponse> {
  const r = await apiFetch(`${API}/limits`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function getSessionStats(): Promise<SessionStatsResponse> {
  const r = await apiFetch(`${API}/session/stats`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function getSessionActivities(limit = 50): Promise<{ activities: SessionActivity[] }> {
  const r = await apiFetch(`${API}/session/activities?limit=${limit}`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function deleteSessionData(): Promise<void> {
  const r = await apiFetch(`${API}/session/data`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

export async function getUrlPreview(url: string): Promise<UrlPreviewResponse> {
  const r = await apiFetch(`${API}/url-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export type UploadOptions = {
  sizes?: string[];
  fillMode?: string;
  fillColor?: string;
  sizeReductionPercent?: number;
  stripMetadata?: boolean;
  progressive?: boolean;
  aggressiveCompression?: boolean;
  zipFolderStructure?: "flat" | "by_file" | "by_format";
  saveToLibrary?: boolean;
};

export async function getFormats(): Promise<FormatsResponse> {
  const r = await apiFetch(`${API}/formats`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function getPresets(): Promise<PresetsResponse> {
  const r = await apiFetch(`${API}/presets`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function uploadMultiple(
  files: File[],
  formats: string[],
  webOptimized: boolean,
  options?: UploadOptions
): Promise<{ tasks: TaskResponse[] }> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const params = new URLSearchParams();
  params.set("formats", formats.join(","));
  params.set("web_optimized", String(webOptimized));
  if (options?.sizes?.length) params.set("sizes", options.sizes.join(","));
  if (options?.fillMode) params.set("fill_mode", options.fillMode ?? "crop");
  if (options?.fillColor) params.set("fill_color", options.fillColor ?? "");
  if (options?.sizeReductionPercent != null) params.set("size_reduction_percent", String(options.sizeReductionPercent));
  if (options?.stripMetadata) params.set("strip_metadata", "true");
  if (options?.progressive) params.set("progressive", "true");
  if (options?.aggressiveCompression) params.set("aggressive_compression", "true");
  if (options?.saveToLibrary) params.set("save_to_library", "true");
  const r = await apiFetch(`${API}/upload-multiple?${params}`, {
    method: "POST",
    body: form,
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

/** Download from URL and convert. Uses same options as upload-multiple. */
export async function uploadFromUrl(
  url: string,
  formats: string[],
  webOptimized: boolean,
  options?: UploadOptions
): Promise<{ tasks: TaskResponse[] }> {
  const params = new URLSearchParams();
  params.set("formats", formats.join(","));
  params.set("web_optimized", String(webOptimized));
  if (options?.sizes?.length) params.set("sizes", options.sizes.join(","));
  if (options?.fillMode) params.set("fill_mode", options.fillMode ?? "crop");
  if (options?.fillColor) params.set("fill_color", options.fillColor ?? "");
  if (options?.sizeReductionPercent != null) params.set("size_reduction_percent", String(options.sizeReductionPercent));
  if (options?.stripMetadata) params.set("strip_metadata", "true");
  if (options?.progressive) params.set("progressive", "true");
  if (options?.aggressiveCompression) params.set("aggressive_compression", "true");
  const r = await apiFetch(`${API}/upload-from-url?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function uploadBatch(
  files: File[],
  formats: string[],
  webOptimized: boolean,
  options?: UploadOptions
): Promise<{ batch_id: string; status: string }> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const params = new URLSearchParams();
  params.set("formats", formats.join(","));
  params.set("web_optimized", String(webOptimized));
  if (options?.sizes?.length) params.set("sizes", options.sizes.join(","));
  if (options?.fillMode) params.set("fill_mode", options.fillMode ?? "crop");
  if (options?.fillColor) params.set("fill_color", options.fillColor ?? "");
  if (options?.sizeReductionPercent != null) params.set("size_reduction_percent", String(options.sizeReductionPercent));
  if (options?.stripMetadata) params.set("strip_metadata", "true");
  if (options?.progressive) params.set("progressive", "true");
  if (options?.aggressiveCompression) params.set("aggressive_compression", "true");
  if (options?.zipFolderStructure) params.set("zip_folder_structure", options.zipFolderStructure);
  const r = await apiFetch(`${API}/upload-batch?${params}`, {
    method: "POST",
    body: form,
  });
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export async function getBatchStatus(batchId: string): Promise<BatchResponse> {
  const r = await apiFetch(`${API}/batch/${batchId}`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export function batchZipUrl(batchId: string): string {
  return `${API}/batch/${batchId}/zip`;
}

export async function getTask(taskId: string): Promise<TaskResponse> {
  const r = await apiFetch(`${API}/task/${taskId}`);
  if (!r.ok) await throwApiError(r);
  return r.json();
}

export function downloadUrl(taskId: string, filename: string): string {
  return `${API}/download/${encodeURIComponent(taskId)}/${encodeURIComponent(filename)}`;
}

export type ZipFolderStructure = "flat" | "by_file" | "by_format";

/** Create a ZIP of converted outputs and return as blob for download. */
export async function createZipOutputs(
  taskIds: string[],
  folderStructure: ZipFolderStructure = "flat"
): Promise<Blob> {
  const r = await apiFetch(`${API}/zip-outputs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_ids: taskIds, folder_structure: folderStructure }),
  });
  if (!r.ok) await throwApiError(r);
  return r.blob();
}

// ============================================================================
// Phase 2: Projects, folders, tags, media library
// ============================================================================

export type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type Folder = {
  id: string;
  name: string;
  project_id: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type MediaItem = {
  task_id: string;
  batch_id: string | null;
  filename: string | null;
  input_bytes: number | null;
  output_bytes: number | null;
  output_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  project_id: string | null;
  folder_id: string | null;
  notes: string | null;
  kind: "image" | "video" | null;
  mime_type: string | null;
  outputs: string[];
  has_source?: boolean;
  tags?: Tag[];
};

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) await throwApiError(r);
  return r.json() as Promise<T>;
}

// --- projects ---

export async function listProjects(): Promise<Project[]> {
  const r = await apiFetch(`${API}/projects`);
  const data = await jsonOrThrow<{ projects: Project[] }>(r);
  return data.projects;
}

export async function createProject(input: { name: string; description?: string; color?: string }): Promise<Project> {
  const r = await apiFetch(`${API}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Project>(r);
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string; color?: string },
): Promise<Project> {
  const r = await apiFetch(`${API}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<Project>(r);
}

export async function deleteProject(id: string): Promise<void> {
  const r = await apiFetch(`${API}/projects/${id}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

// --- folders ---

export async function listFolders(filter?: { projectId?: string; parentId?: string }): Promise<Folder[]> {
  const params = new URLSearchParams();
  if (filter?.projectId) params.set("project_id", filter.projectId);
  if (filter?.parentId) params.set("parent_id", filter.parentId);
  const url = params.toString() ? `${API}/folders?${params}` : `${API}/folders`;
  const r = await apiFetch(url);
  const data = await jsonOrThrow<{ folders: Folder[] }>(r);
  return data.folders;
}

export async function createFolder(input: { name: string; project_id?: string; parent_id?: string }): Promise<Folder> {
  const r = await apiFetch(`${API}/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Folder>(r);
}

export async function updateFolder(
  id: string,
  patch: { name?: string; project_id?: string; parent_id?: string; clear_project?: boolean; clear_parent?: boolean },
): Promise<Folder> {
  const r = await apiFetch(`${API}/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<Folder>(r);
}

export async function deleteFolder(id: string): Promise<void> {
  const r = await apiFetch(`${API}/folders/${id}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

// --- tags ---

export async function listTags(): Promise<Tag[]> {
  const r = await apiFetch(`${API}/tags`);
  const data = await jsonOrThrow<{ tags: Tag[] }>(r);
  return data.tags;
}

export async function createTag(input: { name: string; color?: string }): Promise<Tag> {
  const r = await apiFetch(`${API}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Tag>(r);
}

export async function updateTag(id: string, patch: { name?: string; color?: string }): Promise<Tag> {
  const r = await apiFetch(`${API}/tags/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<Tag>(r);
}

export async function deleteTag(id: string): Promise<void> {
  const r = await apiFetch(`${API}/tags/${id}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

// --- media library ---

export type MediaFilter = {
  projectId?: string;
  folderId?: string;
  tagId?: string;
  q?: string;
  limit?: number;
};

export async function listMedia(filter?: MediaFilter): Promise<MediaItem[]> {
  const params = new URLSearchParams();
  if (filter?.projectId) params.set("project_id", filter.projectId);
  if (filter?.folderId) params.set("folder_id", filter.folderId);
  if (filter?.tagId) params.set("tag_id", filter.tagId);
  if (filter?.q) params.set("q", filter.q);
  if (filter?.limit != null) params.set("limit", String(filter.limit));
  const url = params.toString() ? `${API}/media?${params}` : `${API}/media`;
  const r = await apiFetch(url);
  const data = await jsonOrThrow<{ items: MediaItem[] }>(r);
  return data.items;
}

export async function getMedia(taskId: string): Promise<MediaItem> {
  const r = await apiFetch(`${API}/media/${encodeURIComponent(taskId)}`);
  return jsonOrThrow<MediaItem>(r);
}

export async function updateMedia(
  taskId: string,
  patch: {
    project_id?: string;
    folder_id?: string;
    notes?: string;
    clear_project?: boolean;
    clear_folder?: boolean;
  },
): Promise<MediaItem> {
  const r = await apiFetch(`${API}/media/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<MediaItem>(r);
}

export async function addMediaTags(taskId: string, tagIds: string[]): Promise<{ tag_ids: string[]; tags: Tag[] }> {
  const r = await apiFetch(`${API}/media/${encodeURIComponent(taskId)}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_ids: tagIds }),
  });
  return jsonOrThrow<{ tag_ids: string[]; tags: Tag[] }>(r);
}

export async function removeMediaTag(taskId: string, tagId: string): Promise<void> {
  const r = await apiFetch(
    `${API}/media/${encodeURIComponent(taskId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" },
  );
  if (!r.ok) await throwApiError(r);
}

// --- save-first library: ingest, serve, convert, delete ---

/** Save files into the library WITHOUT converting. Optionally drop into a project/folder. */
export async function saveMedia(
  files: File[],
  opts?: { projectId?: string; folderId?: string },
): Promise<MediaItem[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const params = new URLSearchParams();
  if (opts?.projectId) params.set("project_id", opts.projectId);
  if (opts?.folderId) params.set("folder_id", opts.folderId);
  const url = params.toString() ? `${API}/media/save?${params}` : `${API}/media/save`;
  const r = await apiFetch(url, { method: "POST", body: form });
  const data = await jsonOrThrow<{ items: MediaItem[] }>(r);
  return data.items;
}

/**
 * Append the session id as a `sid` query param. <img>/<a download> requests can't send
 * the X-Session-ID header, so session-scoped media endpoints need it on the URL instead.
 */
function withSid(url: string): string {
  const sid = getSessionId();
  if (!sid) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sid=${encodeURIComponent(sid)}`;
}

/** URL of the persisted original for a saved library item. */
export function mediaSourceUrl(taskId: string): string {
  return withSid(`${API}/media/${encodeURIComponent(taskId)}/source`);
}

/** URL of a converted output for a media item (served from the DB record, restart-safe). */
export function mediaOutputUrl(taskId: string, filename: string): string {
  return withSid(`${API}/media/${encodeURIComponent(taskId)}/output/${encodeURIComponent(filename)}`);
}

/** Best thumbnail URL for a media item: a converted output if present, else the saved original. */
export function mediaThumbUrl(item: MediaItem): string | null {
  if (item.kind !== "image") return null;
  if (item.outputs.length > 0) return mediaOutputUrl(item.task_id, item.outputs[0]!);
  if (item.has_source) return mediaSourceUrl(item.task_id);
  return null;
}

/** Convert a saved library item's original through the standard pipeline. */
export async function convertMedia(
  taskId: string,
  formats: string[],
  options?: UploadOptions & { webOptimized?: boolean },
): Promise<MediaItem> {
  const params = new URLSearchParams();
  params.set("formats", formats.join(","));
  if (options?.webOptimized) params.set("web_optimized", "true");
  if (options?.sizes?.length) params.set("sizes", options.sizes.join(","));
  if (options?.fillMode) params.set("fill_mode", options.fillMode);
  if (options?.fillColor) params.set("fill_color", options.fillColor);
  if (options?.sizeReductionPercent != null) params.set("size_reduction_percent", String(options.sizeReductionPercent));
  if (options?.stripMetadata) params.set("strip_metadata", "true");
  if (options?.progressive) params.set("progressive", "true");
  if (options?.aggressiveCompression) params.set("aggressive_compression", "true");
  const r = await apiFetch(`${API}/media/${encodeURIComponent(taskId)}/convert?${params}`, {
    method: "POST",
  });
  return jsonOrThrow<MediaItem>(r);
}

export async function deleteMedia(taskId: string): Promise<void> {
  const r = await apiFetch(`${API}/media/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

/** Scope for a bulk library conversion: explicit items, or a whole project/folder. */
export type LibraryConvertScope =
  | { task_ids: string[] }
  | { project_id: string }
  | { folder_id: string };

/**
 * Convert every saved original in a scope in the background (outputs attach back to each
 * library item) and build one ZIP. Returns a batch_id — poll getBatchStatus and download
 * via batchZipUrl, same as the upload batch flow.
 */
export async function libraryConvert(
  scope: LibraryConvertScope,
  formats: string[],
  options?: UploadOptions & { webOptimized?: boolean; zipFolderStructure?: ZipFolderStructure },
): Promise<{ batch_id: string; status: string; count: number }> {
  const params = new URLSearchParams();
  params.set("formats", formats.join(","));
  if (options?.webOptimized) params.set("web_optimized", "true");
  if (options?.sizes?.length) params.set("sizes", options.sizes.join(","));
  if (options?.fillMode) params.set("fill_mode", options.fillMode);
  if (options?.fillColor) params.set("fill_color", options.fillColor);
  if (options?.sizeReductionPercent != null) params.set("size_reduction_percent", String(options.sizeReductionPercent));
  if (options?.stripMetadata) params.set("strip_metadata", "true");
  if (options?.progressive) params.set("progressive", "true");
  if (options?.aggressiveCompression) params.set("aggressive_compression", "true");
  if (options?.zipFolderStructure) params.set("zip_folder_structure", options.zipFolderStructure);
  const r = await apiFetch(`${API}/library/convert?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scope),
  });
  return jsonOrThrow<{ batch_id: string; status: string; count: number }>(r);
}

// --- observability ---

export type ObservabilitySummary = {
  sessions_total: number;
  events_total: number;
  media_total: number;
  conversions_total: number;
  failed_total: number;
  total_input_bytes: number;
  total_output_bytes: number;
  events_by_type: Record<string, number>;
};

export async function getObservability(): Promise<ObservabilitySummary> {
  const r = await apiFetch(`${API}/observability/summary`);
  return jsonOrThrow<ObservabilitySummary>(r);
}

// ============================================================================
// Phase 4: AI explain + customizable prompt templates
// ============================================================================

export type PromptTemplate = {
  id: string;
  name: string;
  body: string;
  system_prompt: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Explanation = {
  id: string;
  task_id: string;
  template_id: string | null;
  prompt: string;
  system_prompt: string | null;
  response: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export type AIStatus = {
  configured: boolean;
  model: string;
  max_image_bytes: number;
};

export async function getAIStatus(): Promise<AIStatus> {
  const r = await apiFetch(`${API}/ai/status`);
  return jsonOrThrow<AIStatus>(r);
}

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  const r = await apiFetch(`${API}/prompts`);
  const data = await jsonOrThrow<{ templates: PromptTemplate[] }>(r);
  return data.templates;
}

export async function createPromptTemplate(input: {
  name: string;
  body: string;
  system_prompt?: string;
}): Promise<PromptTemplate> {
  const r = await apiFetch(`${API}/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<PromptTemplate>(r);
}

export async function updatePromptTemplate(
  id: string,
  patch: { name?: string; body?: string; system_prompt?: string },
): Promise<PromptTemplate> {
  const r = await apiFetch(`${API}/prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<PromptTemplate>(r);
}

export async function deletePromptTemplate(id: string): Promise<void> {
  const r = await apiFetch(`${API}/prompts/${id}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}

export async function explainImage(input: {
  task_id: string;
  prompt: string;
  system_prompt?: string;
  template_id?: string;
  model?: string;
  output_filename?: string;
}): Promise<Explanation> {
  const r = await apiFetch(`${API}/ai/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Explanation>(r);
}

export async function listExplanations(taskId?: string, limit = 50): Promise<Explanation[]> {
  const params = new URLSearchParams();
  if (taskId) params.set("task_id", taskId);
  params.set("limit", String(limit));
  const r = await apiFetch(`${API}/ai/explanations?${params}`);
  const data = await jsonOrThrow<{ explanations: Explanation[] }>(r);
  return data.explanations;
}

export async function deleteExplanation(id: string): Promise<void> {
  const r = await apiFetch(`${API}/ai/explanations/${id}`, { method: "DELETE" });
  if (!r.ok) await throwApiError(r);
}
