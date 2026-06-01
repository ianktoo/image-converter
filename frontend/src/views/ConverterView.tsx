import { useCallback, useEffect, useRef, useState } from "react";
import { ConversionProgress } from "@/components/ConversionProgress";
import { ErrorAlert } from "@/components/ErrorAlert";
import { FilePropertiesPreview } from "@/components/FilePropertiesPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const ACCEPT_IMAGE = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp,image/tiff,image/heic,image/heif,.heic,.heif";
const ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska";

const POLL_INTERVAL_MS = 1500;

export type MediaMode = "pictures" | "videos";

export function ConverterView() {
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
  const [saveToLibrary, setSaveToLibrary] = useState(false);
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
    const sizes = sizePresets.length ? [...sizePresets] : ["original"];
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
      saveToLibrary: saveToLibrary || undefined,
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
    saveToLibrary,
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
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Convert</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mediaMode === "pictures"
                ? "Convert images to WebP, JPEG, PNG, AVIF. Resize for social media, reduce file size, and download or zip."
                : "Convert videos to WebM, MP4, or animated WebP. Reduce file size and download or zip."}
            </p>
          </div>
          <Tabs
            value={mediaMode}
            onValueChange={(v) => setMediaModeAndReset(v as MediaMode)}
          >
            <TabsList>
              <TabsTrigger value="pictures">Pictures</TabsTrigger>
              <TabsTrigger value="videos">Videos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="lg:min-h-0">
            <CardHeader>
              <CardTitle>{mediaMode === "pictures" ? "Upload images" : "Upload videos"}</CardTitle>
              <CardDescription>
                {mediaMode === "pictures"
                  ? "Select one or more image files. Supported: JPG, PNG, GIF, WebP, AVIF, BMP, TIFF."
                  : "Select one or more video files. Supported: MP4, WebM, MOV, AVI, MKV."}
                {limits && (
                  <span className="mt-1 block">
                    {mediaMode === "pictures"
                      ? `Max ${limits.max_images_per_upload} images, ${limits.max_image_size_mb} MB each.`
                      : `Max ${limits.max_videos_per_upload} video, ${limits.max_video_size_mb} MB.`}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="file"
                accept={mediaMode === "pictures" ? ACCEPT_IMAGE : ACCEPT_VIDEO}
                multiple={mediaMode === "pictures"}
                onChange={onFileChange}
                className="cursor-pointer file:mr-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground hover:file:bg-secondary/80"
              />
              {mediaMode === "pictures" && selectedFiles.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/30 p-3">
                  <Checkbox
                    checked={saveToLibrary}
                    onCheckedChange={(v) => setSaveToLibrary(v === true)}
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <Label className="cursor-pointer">Save originals to library</Label>
                    <span className="block text-xs text-muted-foreground">
                      Keep the source files in your Media library to organize and re-convert later.
                      {zipWhenDone && selectedFiles.length > 1 && " (Not applied when zipping multiple files.)"}
                    </span>
                  </span>
                </label>
              )}
              {selectedFiles.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length} file(s) selected
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mediaMode === "pictures"
                    ? "Tip: Select multiple images, set output formats and sizes, then click Convert."
                    : "Tip: Select multiple videos, set output format, then click Convert."}
                </p>
              )}
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">
                  Or {mediaMode === "pictures" ? "load image" : "load video"} from URL
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="url"
                    placeholder={mediaMode === "pictures" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"}
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setUrlPreview(null);
                    }}
                    className="min-w-0 flex-1"
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
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">Preview</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="overflow-hidden rounded-lg border bg-muted/30">
                        {file.type.startsWith("image/") && previewUrls[i] ? (
                          <img
                            src={previewUrls[i]}
                            alt={file.name}
                            className="aspect-square w-full object-cover"
                            onLoad={(e) => onImageLoad(i, e)}
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground">
                            Video
                          </div>
                        )}
                        <div className="space-y-1 border-t p-2">
                          <p className="truncate text-xs font-medium" title={file.name}>
                            {file.name}
                          </p>
                          <dl className="space-y-0.5 text-[11px] text-muted-foreground">
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
                      <div className="overflow-hidden rounded-lg border bg-muted/30">
                        {urlPreview.data_url ? (
                          <img
                            src={urlPreview.data_url}
                            alt={urlPreview.filename}
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground">
                            Video
                          </div>
                        )}
                        <div className="space-y-1 border-t p-2">
                          <p className="truncate text-xs font-medium" title={urlPreview.filename}>
                            {urlPreview.filename}
                          </p>
                          <p className="text-[11px] italic text-muted-foreground">From URL</p>
                          <dl className="space-y-0.5 text-[11px] text-muted-foreground">
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
              <CardDescription>
                Session stats and recent conversions. Data is stored per browser session. Clear to remove your history and output files from the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sessionStatsLoading ? (
                <p className="text-sm text-muted-foreground">Loading stats…</p>
              ) : sessionStats ? (
                <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Images uploaded</p>
                    <p className="text-lg font-semibold">{sessionStats.images_uploaded}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Output files</p>
                    <p className="text-lg font-semibold">{sessionStats.images_output}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Compression</p>
                    <p className="text-lg font-semibold">
                      {sessionStats.compression_percent > 0 ? `${sessionStats.compression_percent}% smaller` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Time in session</p>
                    <p className="text-lg font-semibold">{formatDuration(sessionStats.time_spent_seconds)}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No activity yet. Convert some files to see stats.
                </div>
              )}
              {sessionActivities.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Recent activity</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
                    {sessionActivities.slice(0, 20).map((a, i) => (
                      <li key={`${a.task_id}-${i}`} className="flex justify-between gap-2 border-b py-1 last:border-0">
                        <span className="truncate" title={a.filename ?? a.task_id}>{a.filename ?? a.task_id.slice(0, 8)}</span>
                        <span className="shrink-0 text-muted-foreground">{a.status}</span>
                        <span className="shrink-0 text-muted-foreground">{a.output_count} out</span>
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
              >
                {clearDataLoading ? "Clearing…" : "Clear my data"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {selectedFiles.length === 0 && !urlPreview && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">Quick start</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {mediaMode === "pictures" ? (
                <>
                  <li>Switch to <strong className="text-foreground">Pictures</strong> or <strong className="text-foreground">Videos</strong> above, then choose file(s) or paste a URL.</li>
                  <li>For images: set output formats (e.g. WebP) and optionally output sizes (Instagram, etc.).</li>
                  <li>For videos: set output format (MP4, WebM). Use &quot;Zip when done&quot; for multiple files.</li>
                </>
              ) : (
                <>
                  <li>Choose video file(s) or paste a video URL and click &quot;Load preview&quot;.</li>
                  <li>Set output format (MP4, WebM, WebP) and click Convert. Use &quot;Zip when done&quot; for multiple files.</li>
                </>
              )}
              <li>Visit <strong className="text-foreground">Media</strong>, <strong className="text-foreground">Projects</strong>, <strong className="text-foreground">Tags</strong>, or <strong className="text-foreground">Gallery</strong> in the sidebar to organize and browse what you&apos;ve converted.</li>
            </ul>
          </div>
        )}

        {loading && <ConversionProgress active={loading} />}

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
                <CardDescription>
                  Conversion is running in the background. When status is &quot;completed&quot;, download the ZIP below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">Status: <span className="font-medium">{batch.status}</span></p>
                {batch.error && <p className="text-sm text-destructive">{batch.error}</p>}
                {batch.status === "completed" && batch.zip_filename && (
                  <Button asChild variant="link" className="h-auto p-0">
                    <a href={batchZipUrl(batch.batch_id)} download={batch.zip_filename}>
                      Download ZIP
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card className={batch ? "lg:min-w-0" : ""}>
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  Download each converted file or use <strong className="text-foreground">Preview properties</strong> to see size, format, and a thumbnail. Export all as a ZIP with optional folder organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  <span className="text-sm font-medium">Download all as ZIP</span>
                  <Select
                    defaultValue="by_file"
                    onValueChange={(v) => {
                      (document.getElementById("zip-structure-value") as HTMLInputElement).value = v;
                    }}
                  >
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat (all files in root)</SelectItem>
                      <SelectItem value="by_file">By original file (folder per source)</SelectItem>
                      <SelectItem value="by_format">By format (webp/, jpeg/, etc.)</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" id="zip-structure-value" defaultValue="by_file" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={zipDownloading}
                    onClick={() => {
                      const v = (document.getElementById("zip-structure-value") as HTMLInputElement)?.value;
                      downloadAllAsZip((v as ZipFolderStructure) || "by_file");
                    }}
                  >
                    {zipDownloading ? "Creating ZIP…" : "Download ZIP"}
                  </Button>
                </div>
                {tasks.map((task) => (
                  <div
                    key={task.task_id}
                    className={cn(
                      "space-y-2 rounded-lg border p-4",
                      task.status === "failed"
                        ? "border-destructive/50 bg-destructive/5"
                        : "bg-muted/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{task.filename}</span>
                      <span className="text-sm text-muted-foreground">{task.status}</span>
                    </div>
                    {task.status === "converting" || task.status === "pending" ? (
                      <Progress value={task.progress} />
                    ) : null}
                    {task.error && (
                      <p className="text-sm text-destructive">{task.error}</p>
                    )}
                    {task.input_size != null && (
                      <p className="text-sm text-muted-foreground">
                        Original: <strong className="text-foreground">{formatBytes(task.input_size)}</strong>
                      </p>
                    )}
                    {task.output_paths.length > 0 && (
                      <div className="space-y-2 pt-2">
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
                              <Button asChild variant="link" className="h-auto p-0">
                                <a href={downloadUrl(task.task_id, name)} download={name}>
                                  Download {name}
                                </a>
                              </Button>
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
                                className="text-muted-foreground underline-offset-4 hover:underline"
                              >
                                Preview properties
                              </button>
                              {outSize != null && (
                                <>
                                  <span className="text-muted-foreground">
                                    {formatBytes(outSize)}
                                  </span>
                                  {diff && (
                                    <span
                                      className={cn(
                                        diff.includes("smaller")
                                          ? "text-emerald-500 dark:text-emerald-400"
                                          : diff.includes("larger")
                                            ? "text-amber-500 dark:text-amber-400"
                                            : "text-muted-foreground",
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
  );
}
