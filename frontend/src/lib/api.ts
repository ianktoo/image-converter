import { throwApiError } from "./apiErrors";
import { env } from "./env";
import { getSessionHeaders, setSessionId } from "./session";

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
