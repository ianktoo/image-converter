import { useCallback, useEffect, useRef, useState } from "react";
import { ConversionProgress } from "@/components/ConversionProgress";
import { ErrorAlert } from "@/components/ErrorAlert";
import { FilePropertiesPreview } from "@/components/FilePropertiesPreview";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { OutputOptionsCard } from "@/components/OutputOptionsCard";
import {
  batchZipUrl,
  createZipOutputs,
  deleteSessionData,
  downloadUrl,
  getBatchStatus,
  getFormats,
  getLimits,
  getPresets,
  getSessionActivities,
  getSessionStats,
  getUrlPreview,
  uploadBatch,
  uploadFromUrl,
  uploadMultiple,
  type BatchResponse,
  type FormatsResponse,
  type LimitsResponse,
  type PresetsResponse,
  type SessionActivity,
  type SessionStatsResponse,
  type TaskResponse,
  type UrlPreviewResponse,
  type ZipFolderStructure,
} from "@/lib/api";
import { formatBytes, formatDate, formatDuration, formatMimeType, formatSizeDiff } from "@/lib/format";
import { cn } from "@/lib/utils";
import "./App.css";

const ACCEPT_IMAGE = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp,image/tiff";
const ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska";

const POLL_INTERVAL_MS = 1500;

export type MediaMode = "pictures" | "videos";

export default function App() {
  const [mediaMode, setMediaMode] = useState<MediaMode>("pictures");
  const [formats, setFormats] = useState<FormatsResponse | null>(null);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [outputFormats, setOutputFormats] = useState<string[]>(["webp"]);
  const [sizePresets, setSizePresets] = useState<string[]>(["original"]);
  const [targetWidth, setTargetWidth] = useState("");
  const [targetHeight, setTargetHeight] = useState("");
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [fillMode, setFillMode] = useState<"crop" | "color" | "blur">("crop");
  const [fillColor, setFillColor] = useState("#808080");
  const [sizeReductionPercent, setSizeReductionPercent] = useState(0);
  const [webOptimized, setWebOptimized] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(false);
  const [progressive, setProgressive] = useState(false);
  const [aggressiveCompression, setAggressiveCompression] = useState(false);
  const [zipWhenDone, setZipWhenDone] = useState(false);
  const [zipFolderStructure, setZipFolderStructure] = useState<ZipFolderStructure>("by_file");
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    taskId: string;
    filename: string;
    sizeBytes?: number;
    originalSize?: number;
  } | null>(null);
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlPreview, setUrlPreview] = useState<UrlPreviewResponse | null>(null);
  const [urlPreviewLoading, setUrlPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<number, { w: number; h: number }>>({});
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStatsResponse | null>(null);
  const [sessionActivities, setSessionActivities] = useState<SessionActivity[]>([]);
  const [sessionStatsLoading, _setSessionStatsLoading] = useState(false);
  const [clearDataLoading, setClearDataLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshSessionData = useCallback(() => {
    getSessionStats().then(setSessionStats).catch(() => {});
    getSessionActivities(30).then((r) => setSessionActivities(r.activities)).catch(() => {});
  }, []);

  useEffect(() => {
    getLimits().then(setLimits).catch(() => {});
    getSessionStats().then(setSessionStats).catch(() => {});
    getSessionActivities(30).then((r) => setSessionActivities(r.activities)).catch(() => {});
  }, []);

  useEffect(() => {
    setFormatsLoading(true);
    getFormats()
      .then((data) => {
        setFormats(data);
        setFormatsLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setFormatsLoading(false);
      });
    getPresets().then(setPresets).catch(() => {});
  }, []);

  useEffect(() => {
    const urls = selectedFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => {
      prev.forEach(URL.revokeObjectURL);
      return urls;
    });
    return () => urls.forEach(URL.revokeObjectURL);
  }, [selectedFiles]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const setMediaModeAndReset = useCallback((mode: MediaMode) => {
    setMediaMode(mode);
    setSelectedFiles([]);
    setUrlInput("");
    setUrlPreview(null);
    setOutputFormats(mode === "pictures" ? ["webp"] : ["mp4"]);
    setSizePresets(["original"]);
    setTargetWidth("");
    setTargetHeight("");
    setError(null);
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const files = Array.from(list);
    const isPictures = mediaMode === "pictures";
    const maxCount = isPictures ? (limits?.max_images_per_upload ?? 10) : (limits?.max_videos_per_upload ?? 1);
    const maxBytes = isPictures ? (limits?.max_image_size_bytes ?? 20 * 1024 * 1024) : (limits?.max_video_size_bytes ?? 150 * 1024 * 1024);
    const maxMb = maxBytes / (1024 * 1024);
    if (files.length > maxCount) {
      setError(isPictures ? `Max ${maxCount} images at a time.` : `Only ${maxCount} video at a time.`);
      return;
    }
    const tooBig = files.filter((f) => f.size > maxBytes);
    if (tooBig.length > 0) {
      setError(`File(s) too large: ${tooBig.map((f) => f.name).join(", ")}. Max ${maxMb} MB ${isPictures ? "per image" : "per video"}.`);
      return;
    }
    setSelectedFiles(files);
    setImageDimensions({});
    setTasks([]);
    setBatch(null);
    setError(null);
  }, [mediaMode, limits?.max_images_per_upload, limits?.max_image_size_bytes, limits?.max_videos_per_upload, limits?.max_video_size_bytes]);

  const onImageLoad = useCallback((i: number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions((prev) => ({ ...prev, [i]: { w: img.naturalWidth, h: img.naturalHeight } }));
  }, []);

  const toggleOutputFormat = useCallback((fmt: string) => {
    setOutputFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  }, []);

  const toggleSizePreset = useCallback((key: string) => {
    setSizePresets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const buildSizes = useCallback(() => {
    let sizes = sizePresets.length ? [...sizePresets] : ["original"];
    const cw = targetWidth.trim() ? parseInt(targetWidth, 10) : null;
    const ch = targetHeight.trim() ? parseInt(targetHeight, 10) : null;
    const hasCustom = (cw != null && !Number.isNaN(cw)) || (ch != null && !Number.isNaN(ch));
    if (hasCustom) {
      if (maintainAspectRatio) {
        if (cw != null && !Number.isNaN(cw)) sizes.push(`${cw}x`);
        else if (ch != null && !Number.isNaN(ch)) sizes.push(`x${ch}`);
      } else if (cw != null && ch != null && !Number.isNaN(cw) && !Number.isNaN(ch)) {
        sizes.push(`${cw}x${ch}`);
      } else if (cw != null && !Number.isNaN(cw)) sizes.push(`${cw}x`);
      else if (ch != null && !Number.isNaN(ch)) sizes.push(`x${ch}`);
    }
    return sizes;
  }, [sizePresets, targetWidth, targetHeight, maintainAspectRatio]);

  const startConversion = useCallback(async () => {
    if (!selectedFiles.length || !outputFormats.length) return;
    setLoading(true);
    setError(null);
    setBatch(null);
    setTasks([]);
    const opts = {
      sizes: buildSizes(),
      fillMode,
      fillColor: fillMode === "color" ? fillColor : undefined,
      sizeReductionPercent: sizeReductionPercent || undefined,
      stripMetadata,
      progressive,
      aggressiveCompression,
      zipFolderStructure: zipWhenDone && selectedFiles.length > 1 ? zipFolderStructure : undefined,
    };
    try {
      if (zipWhenDone && selectedFiles.length > 1) {
        const { batch_id } = await uploadBatch(
          selectedFiles,
          outputFormats,
          webOptimized,
          opts
        );
        setBatch({ batch_id, status: "processing", task_ids: [] });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const status = await getBatchStatus(batch_id);
            setBatch(status);
            if (status.status === "completed" || status.status === "failed") {
              if (status.status === "completed") refreshSessionData();
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } catch {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, POLL_INTERVAL_MS);
      } else {
        const { tasks: result } = await uploadMultiple(
          selectedFiles,
          outputFormats,
          webOptimized,
          opts
        );
        setTasks(result);
      }
      refreshSessionData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTasks([]);
      setBatch(null);
    } finally {
      setLoading(false);
    }
  }, [
    selectedFiles,
    outputFormats,
    webOptimized,
    refreshSessionData,
    buildSizes,
    fillMode,
    fillColor,
    sizeReductionPercent,
    stripMetadata,
    progressive,
    aggressiveCompression,
    zipWhenDone,
    zipFolderStructure,
  ]);

  const loadUrlPreview = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlPreviewLoading(true);
    setError(null);
    try {
      const data = await getUrlPreview(url);
      setUrlPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUrlPreview(null);
    } finally {
      setUrlPreviewLoading(false);
    }
  }, [urlInput]);

  const compressFromUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url || !outputFormats.length) return;
    setUrlLoading(true);
    setError(null);
    const opts = {
      sizes: buildSizes(),
      fillMode,
      fillColor: fillMode === "color" ? fillColor : undefined,
      sizeReductionPercent: sizeReductionPercent || undefined,
      stripMetadata,
      progressive,
      aggressiveCompression,
    };
    try {
      const { tasks: result } = await uploadFromUrl(url, outputFormats, webOptimized, opts);
      setTasks((prev) => [...prev, ...result]);
      refreshSessionData();
      setUrlInput("");
      setUrlPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUrlLoading(false);
    }
  }, [
    urlInput,
    outputFormats,
    webOptimized,
    refreshSessionData,
    buildSizes,
    fillMode,
    fillColor,
    sizeReductionPercent,
    stripMetadata,
    progressive,
    aggressiveCompression,
  ]);

  const downloadAllAsZip = useCallback(async (structure: ZipFolderStructure) => {
    if (!tasks.length) return;
    setZipDownloading(true);
    try {
      const blob = await createZipOutputs(tasks.map((t) => t.task_id), structure);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `converted-${structure}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipDownloading(false);
    }
  }, [tasks]);

  const onClearMyData = useCallback(async () => {
    setClearDataLoading(true);
    setError(null);
    try {
      await deleteSessionData();
      setTasks([]);
      setBatch(null);
      setPreviewFile(null);
      refreshSessionData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearDataLoading(false);
    }
  }, [refreshSessionData]);

  return (
    <Layout>
      <div className="p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Convert</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {mediaMode === "pictures"
                  ? "Convert images to WebP, JPEG, PNG, AVIF. Resize for social media, reduce file size, and download or zip."
                  : "Convert videos to WebM, MP4, or animated WebP. Reduce file size and download or zip."}
              </p>
            </div>
            <div className="flex rounded-lg border border-neutral-700 bg-neutral-800/50 p-1">
              <button
                type="button"
                onClick={() => setMediaModeAndReset("pictures")}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  mediaMode === "pictures"
                    ? "bg-neutral-700 text-neutral-100 shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Pictures
              </button>
              <button
                type="button"
                onClick={() => setMediaModeAndReset("videos")}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  mediaMode === "videos"
                    ? "bg-neutral-700 text-neutral-100 shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Videos
              </button>
            </div>
          </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:min-h-0">
          <CardHeader>
            <CardTitle>{mediaMode === "pictures" ? "Upload images" : "Upload videos"}</CardTitle>
            <p className="text-sm font-normal text-neutral-500">
              {mediaMode === "pictures"
                ? "Select one or more image files. Supported: JPG, PNG, GIF, WebP, AVIF, BMP, TIFF."
                : "Select one or more video files. Supported: MP4, WebM, MOV, AVI, MKV."}
              {limits && (
                <span className="block mt-1 text-neutral-500">
                  {mediaMode === "pictures"
                    ? `Max ${limits.max_images_per_upload} images, ${limits.max_image_size_mb} MB each.`
                    : `Max ${limits.max_videos_per_upload} video, ${limits.max_video_size_mb} MB.`}
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept={mediaMode === "pictures" ? ACCEPT_IMAGE : ACCEPT_VIDEO}
              multiple={mediaMode === "pictures"}
              onChange={onFileChange}
              className="block w-full text-sm text-neutral-400 file:mr-4 file:rounded file:border-0 file:bg-neutral-700 file:px-4 file:py-2 file:text-neutral-100"
            />
            {selectedFiles.length > 0 ? (
              <p className="text-sm text-neutral-400">
                {selectedFiles.length} file(s) selected
              </p>
            ) : (
              <p className="text-xs text-neutral-500">
                {mediaMode === "pictures"
                  ? "Tip: Select multiple images, set output formats and sizes, then click Convert."
                  : "Tip: Select multiple videos, set output format, then click Convert."}
              </p>
            )}
            <div className="border-t border-neutral-800 pt-4">
              <p className="text-sm font-medium text-neutral-400 mb-2">
                Or {mediaMode === "pictures" ? "load image" : "load video"} from URL
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder={mediaMode === "pictures" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"}
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlPreview(null);
                  }}
                  className="flex-1 min-w-0 rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!urlInput.trim() || urlPreviewLoading}
                    onClick={loadUrlPreview}
                  >
                    {urlPreviewLoading ? "Loading…" : "Load preview"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!urlInput.trim() || urlLoading || !outputFormats.length}
                    onClick={compressFromUrl}
                  >
                    {urlLoading ? "Compressing…" : "Compress from URL"}
                  </Button>
                </div>
              </div>
            </div>

            {(selectedFiles.length > 0 || urlPreview) && (
              <div className="border-t border-neutral-800 pt-4 space-y-3">
                <p className="text-sm font-medium text-neutral-400">Preview</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="rounded border border-neutral-700 overflow-hidden bg-neutral-900">
                      {file.type.startsWith("image/") && previewUrls[i] ? (
                        <img
                          src={previewUrls[i]}
                          alt={file.name}
                          className="w-full aspect-square object-cover"
                          onLoad={(e) => onImageLoad(i, e)}
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center text-neutral-500 text-sm">
                          Video
                        </div>
                      )}
                      <div className="p-2 space-y-1 border-t border-neutral-800">
                        <p className="text-xs text-neutral-300 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <dl className="text-[11px] text-neutral-500 space-y-0.5">
                          <div className="flex justify-between gap-2">
                            <span>Size</span>
                            <span>{formatBytes(file.size)}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Type</span>
                            <span>{formatMimeType(file.type)}</span>
                          </div>
                          {imageDimensions[i] && (
                            <div className="flex justify-between gap-2">
                              <span>Dimensions</span>
                              <span>{imageDimensions[i].w} × {imageDimensions[i].h}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-2">
                            <span>Modified</span>
                            <span>{formatDate(file.lastModified)}</span>
                          </div>
                        </dl>
                      </div>
                    </div>
                  ))}
                  {urlPreview && (
                    <div className="rounded border border-neutral-700 overflow-hidden bg-neutral-900">
                      {urlPreview.data_url ? (
                        <img
                          src={urlPreview.data_url}
                          alt={urlPreview.filename}
                          className="w-full aspect-square object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center text-neutral-500 text-sm">
                          Video
                        </div>
                      )}
                      <div className="p-2 space-y-1 border-t border-neutral-800">
                        <p className="text-xs text-neutral-300 truncate" title={urlPreview.filename}>
                          {urlPreview.filename}
                        </p>
                        <p className="text-[11px] text-neutral-500 italic">From URL</p>
                        <dl className="text-[11px] text-neutral-500 space-y-0.5">
                          <div className="flex justify-between gap-2">
                            <span>Size</span>
                            <span>{formatBytes(urlPreview.content_length)}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span>Type</span>
                            <span>{formatMimeType(urlPreview.content_type)}</span>
                          </div>
                          {urlPreview.width != null && urlPreview.height != null && (
                            <div className="flex justify-between gap-2">
                              <span>Dimensions</span>
                              <span>{urlPreview.width} × {urlPreview.height}</span>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(selectedFiles.length > 0 || urlInput.trim() !== "" || urlPreview) && (
          <OutputOptionsCard
            mediaMode={mediaMode}
            formats={formats}
            presets={presets}
            formatsLoading={formatsLoading}
            outputFormats={outputFormats}
            sizePresets={sizePresets}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            maintainAspectRatio={maintainAspectRatio}
            onTargetWidthChange={setTargetWidth}
            onTargetHeightChange={setTargetHeight}
            onMaintainAspectRatioChange={setMaintainAspectRatio}
            fillMode={fillMode}
            fillColor={fillColor}
            sizeReductionPercent={sizeReductionPercent}
            webOptimized={webOptimized}
            stripMetadata={stripMetadata}
            progressive={progressive}
            aggressiveCompression={aggressiveCompression}
            zipWhenDone={zipWhenDone}
            zipFolderStructure={zipFolderStructure}
            multipleFiles={selectedFiles.length > 1}
            loading={loading}
            onToggleFormat={toggleOutputFormat}
            onToggleSizePreset={toggleSizePreset}
            onFillModeChange={setFillMode}
            onFillColorChange={setFillColor}
            onSizeReductionChange={setSizeReductionPercent}
            onWebOptimizedChange={setWebOptimized}
            onStripMetadataChange={setStripMetadata}
            onProgressiveChange={setProgressive}
            onAggressiveCompressionChange={setAggressiveCompression}
            onZipWhenDoneChange={setZipWhenDone}
            onZipFolderStructureChange={setZipFolderStructure}
            onConvert={startConversion}
          />
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your activity</CardTitle>
            <p className="text-sm font-normal text-neutral-500">
              Session stats and recent conversions. Data is stored per browser session. Clear to remove your history and output files from the server.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionStatsLoading ? (
              <p className="text-sm text-neutral-500">Loading stats…</p>
            ) : sessionStats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                <div>
                  <p className="text-xs text-neutral-500">Images uploaded</p>
                  <p className="text-lg font-semibold text-neutral-200">{sessionStats.images_uploaded}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Output files</p>
                  <p className="text-lg font-semibold text-neutral-200">{sessionStats.images_output}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Compression</p>
                  <p className="text-lg font-semibold text-neutral-200">
                    {sessionStats.compression_percent > 0 ? `${sessionStats.compression_percent}% smaller` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Time in session</p>
                  <p className="text-lg font-semibold text-neutral-200">{formatDuration(sessionStats.time_spent_seconds)}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-500">
                No activity yet. Convert some files to see stats.
              </div>
            )}
            {sessionActivities.length > 0 && (
              <div>
                <p className="text-sm font-medium text-neutral-400 mb-2">Recent activity</p>
                <ul className="space-y-1 max-h-48 overflow-y-auto rounded border border-neutral-800 p-2 text-xs">
                  {sessionActivities.slice(0, 20).map((a, i) => (
                    <li key={`${a.task_id}-${i}`} className="flex justify-between gap-2 py-1 border-b border-neutral-800 last:border-0">
                      <span className="truncate text-neutral-300" title={a.filename ?? a.task_id}>{a.filename ?? a.task_id.slice(0, 8)}</span>
                      <span className="shrink-0 text-neutral-500">{a.status}</span>
                      <span className="shrink-0 text-neutral-500">{a.output_count} out</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={clearDataLoading}
              onClick={onClearMyData}
              className="border-neutral-600 text-neutral-400 hover:text-neutral-200"
            >
              {clearDataLoading ? "Clearing…" : "Clear my data"}
            </Button>
          </CardContent>
        </Card>

        </div>

        {selectedFiles.length === 0 && !urlPreview && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <p className="text-sm font-medium text-neutral-400">Quick start</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-500">
              {mediaMode === "pictures" ? (
                <>
                  <li>Switch to <strong className="text-neutral-400">Pictures</strong> or <strong className="text-neutral-400">Videos</strong> above, then choose file(s) or paste a URL.</li>
                  <li>For images: set output formats (e.g. WebP) and optionally output sizes (Instagram, etc.).</li>
                  <li>For videos: set output format (MP4, WebM). Use &quot;Zip when done&quot; for multiple files.</li>
                </>
              ) : (
                <>
                  <li>Choose video file(s) or paste a video URL and click &quot;Load preview&quot;.</li>
                  <li>Set output format (MP4, WebM, WebP) and click Convert. Use &quot;Zip when done&quot; for multiple files.</li>
                </>
              )}
              <li>Full steps are in the sidebar under &quot;How to use&quot;.</li>
            </ul>
          </div>
        )}

        {loading && (
          <ConversionProgress active={loading} />
        )}

        {error && (
          <ErrorAlert
            message={error}
            onDismiss={() => setError(null)}
            onRetry={
              formats === null && !selectedFiles.length && !urlInput.trim()
                ? () => {
                    setError(null);
                    setFormatsLoading(true);
                    getFormats()
                      .then((data) => {
                        setFormats(data);
                        setFormatsLoading(false);
                      })
                      .catch((e) => {
                        setError(e instanceof Error ? e.message : String(e));
                        setFormatsLoading(false);
                      });
                  }
                : undefined
            }
          />
        )}

        <div className={cn("grid gap-6", batch && tasks.length > 0 && "lg:grid-cols-2")}>
        {batch && (
          <Card>
            <CardHeader>
              <CardTitle>Batch (zip)</CardTitle>
              <p className="text-sm font-normal text-neutral-500">
                Conversion is running in the background. When status is &quot;completed&quot;, download the ZIP below.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-neutral-400">Status: {batch.status}</p>
              {batch.error && <p className="text-sm text-red-400">{batch.error}</p>}
              {batch.status === "completed" && batch.zip_filename && (
                <a
                  href={batchZipUrl(batch.batch_id)}
                  download={batch.zip_filename}
                  className="inline-block text-sm text-neutral-300 underline hover:text-white"
                >
                  Download ZIP
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {tasks.length > 0 && (
          <Card className={batch ? "lg:min-w-0" : ""}>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <p className="text-sm font-normal text-neutral-500">
                Download each converted file or use <strong className="text-neutral-400">Preview properties</strong> to see size, format, and a thumbnail. Export all as a ZIP with optional folder organization (by original file or by format).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                <span className="text-sm font-medium text-neutral-300">Download all as ZIP</span>
                <select
                  id="zip-structure"
                  className="rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200"
                  defaultValue="by_file"
                >
                  <option value="flat">Flat (all files in root)</option>
                  <option value="by_file">By original file (folder per source)</option>
                  <option value="by_format">By format (webp/, jpeg/, etc.)</option>
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={zipDownloading}
                  onClick={() => {
                    const sel = document.getElementById("zip-structure") as HTMLSelectElement;
                    downloadAllAsZip((sel?.value as ZipFolderStructure) || "by_file");
                  }}
                >
                  {zipDownloading ? "Creating ZIP…" : "Download ZIP"}
                </Button>
              </div>
              {tasks.map((task) => (
                <div
                  key={task.task_id}
                  className={cn(
                    "rounded-lg border p-4 space-y-2",
                    task.status === "failed"
                      ? "border-red-800 bg-red-950/20"
                      : "border-neutral-700 bg-neutral-900/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{task.filename}</span>
                    <span className="text-sm text-neutral-400">{task.status}</span>
                  </div>
                  {task.status === "converting" || task.status === "pending" ? (
                    <Progress value={task.progress} />
                  ) : null}
                  {task.error && (
                    <p className="text-sm text-red-400">{task.error}</p>
                  )}
                  {task.input_size != null && (
                    <p className="text-sm text-neutral-400">
                      Original: <strong className="text-neutral-200">{formatBytes(task.input_size)}</strong>
                    </p>
                  )}
                  {task.output_paths.length > 0 && (
                    <div className="pt-2 space-y-2">
                      {task.output_paths.map((name, idx) => {
                        const outSize = task.output_sizes?.[idx];
                        const diff =
                          task.input_size != null && outSize != null
                            ? formatSizeDiff(task.input_size, outSize)
                            : null;
                        return (
                          <div
                            key={name}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                          >
                            <a
                              href={downloadUrl(task.task_id, name)}
                              download={name}
                              className="text-neutral-300 underline hover:text-white"
                            >
                              Download {name}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewFile({
                                  taskId: task.task_id,
                                  filename: name,
                                  sizeBytes: outSize,
                                  originalSize: task.input_size ?? undefined,
                                })
                              }
                              className="text-neutral-500 underline hover:text-neutral-300"
                            >
                              Preview properties
                            </button>
                            {outSize != null && (
                              <>
                                <span className="text-neutral-500">
                                  {formatBytes(outSize)}
                                </span>
                                {diff && (
                                  <span
                                    className={cn(
                                      diff.includes("smaller")
                                        ? "text-green-400"
                                        : diff.includes("larger")
                                          ? "text-amber-400"
                                          : "text-neutral-500"
                                    )}
                                  >
                                    {diff}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        </div>

        {previewFile && (
          <FilePropertiesPreview
            open={!!previewFile}
            onOpenChange={(open) => !open && setPreviewFile(null)}
            taskId={previewFile.taskId}
            filename={previewFile.filename}
            sizeBytes={previewFile.sizeBytes}
            originalSize={previewFile.originalSize}
          />
        )}
        </div>
      </div>
    </Layout>
  );
}
