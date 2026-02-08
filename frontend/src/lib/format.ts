/** Format byte count for display (e.g. "1.2 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const unit = ["B", "KB", "MB", "GB"][i] ?? "B";
  return value % 1 === 0 ? `${value} ${unit}` : `${value.toFixed(1)} ${unit}`;
}

/** Describe size difference: "45% smaller" or "12% larger". */
export function formatSizeDiff(originalBytes: number, newBytes: number): string {
  if (originalBytes <= 0) return newBytes > 0 ? "new" : "—";
  const pct = ((newBytes - originalBytes) / originalBytes) * 100;
  if (Math.abs(pct) < 0.5) return "~same size";
  if (pct < 0) return `${Math.round(-pct)}% smaller`;
  return `${Math.round(pct)}% larger`;
}

/** Format file type from MIME (e.g. "image/jpeg" → "JPEG"). */
export function formatMimeType(mime: string): string {
  const part = mime.split("/").pop() ?? mime;
  return part.toUpperCase();
}

/** Format last modified date for display. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Format duration in seconds (e.g. "2 min 30 sec" or "45 sec"). */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return s === 0 ? "0 sec" : `${s} sec`;
  return s === 0 ? `${m} min` : `${m} min ${s} sec`;
}
