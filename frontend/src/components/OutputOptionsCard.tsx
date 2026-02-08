import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type PresetsResponse = Record<string, [number, number] | null>;

type FormatsResponse = {
  output_image?: string[];
  output_video?: string[];
};

export type MediaMode = "pictures" | "videos";

type OutputOptionsCardProps = {
  mediaMode: MediaMode;
  formats: FormatsResponse | null;
  presets: PresetsResponse | null;
  formatsLoading: boolean;
  outputFormats: string[];
  sizePresets: string[];
  targetWidth: string;
  targetHeight: string;
  maintainAspectRatio: boolean;
  onTargetWidthChange: (v: string) => void;
  onTargetHeightChange: (v: string) => void;
  onMaintainAspectRatioChange: (v: boolean) => void;
  fillMode: "crop" | "color" | "blur";
  fillColor: string;
  sizeReductionPercent: number;
  webOptimized: boolean;
  stripMetadata: boolean;
  progressive: boolean;
  aggressiveCompression: boolean;
  zipWhenDone: boolean;
  zipFolderStructure: "flat" | "by_file" | "by_format";
  multipleFiles: boolean;
  loading: boolean;
  onToggleFormat: (fmt: string) => void;
  onToggleSizePreset: (key: string) => void;
  onFillModeChange: (mode: "crop" | "color" | "blur") => void;
  onFillColorChange: (color: string) => void;
  onSizeReductionChange: (v: number) => void;
  onWebOptimizedChange: (v: boolean) => void;
  onStripMetadataChange: (v: boolean) => void;
  onProgressiveChange: (v: boolean) => void;
  onAggressiveCompressionChange: (v: boolean) => void;
  onZipWhenDoneChange: (v: boolean) => void;
  onZipFolderStructureChange: (v: "flat" | "by_file" | "by_format") => void;
  onConvert: () => void;
};

export function OutputOptionsCard({
  mediaMode,
  formats,
  presets,
  formatsLoading,
  outputFormats,
  sizePresets,
  targetWidth,
  targetHeight,
  maintainAspectRatio,
  onTargetWidthChange,
  onTargetHeightChange,
  onMaintainAspectRatioChange,
  fillMode,
  fillColor,
  sizeReductionPercent,
  webOptimized,
  stripMetadata,
  progressive,
  aggressiveCompression,
  zipWhenDone,
  zipFolderStructure,
  multipleFiles,
  loading,
  onToggleFormat,
  onToggleSizePreset,
  onFillModeChange,
  onFillColorChange,
  onSizeReductionChange,
  onWebOptimizedChange,
  onStripMetadataChange,
  onProgressiveChange,
  onAggressiveCompressionChange,
  onZipWhenDoneChange,
  onZipFolderStructureChange,
  onConvert,
}: OutputOptionsCardProps) {
  const [sizesModalOpen, setSizesModalOpen] = useState(false);
  const isPictures = mediaMode === "pictures";

  const presetEntries = presets ? Object.entries(presets) : [];
  const formatList = (() => {
    if (!formats) return isPictures ? ["webp", "jpeg", "png", "avif"] : ["webp", "mp4", "webm"];
    if (isPictures) return formats.output_image ?? ["webp", "jpeg", "png", "avif"];
    return formats.output_video ?? ["webp", "mp4", "webm"];
  })();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{isPictures ? "Image options" : "Video options"}</CardTitle>
          <p className="text-sm font-normal text-neutral-500">
            {isPictures
              ? "Pick output formats and sizes. Use the size reduction slider and web optimization to balance quality and file size."
              : "Pick output format. Use web optimization to reduce file size."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Accordion defaultValue={["formats", "resize", "quality"]}>
            <AccordionItem value="formats">
              <AccordionTrigger value="formats">Formats &amp; sizes</AccordionTrigger>
              <AccordionContent value="formats" className="space-y-4">
                <section className="space-y-2">
                  <Label className="text-neutral-400">Output format{isPictures ? "s" : ""}</Label>
                  <p className="text-xs text-neutral-500">
                    {isPictures ? "Select at least one. Each format is generated for every selected size." : "Select at least one output format."}
                  </p>
                  {formatsLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-8 w-16" />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {[...new Set(formatList)].map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => onToggleFormat(fmt)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                            outputFormats.includes(fmt)
                              ? "border-neutral-500 bg-neutral-700 text-neutral-100"
                              : "border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
                          )}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                {isPictures && (
                  <>
                    <section className="space-y-2">
                      <Label className="text-neutral-400">Output sizes</Label>
                      <p className="text-xs text-neutral-500">Optional. Add presets (e.g. Instagram, Facebook) to get multiple dimensions per file. &quot;Original&quot; keeps the source size.</p>
                      {!presets ? (
                        <Skeleton className="h-10 w-48" />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSizesModalOpen(true)}
                            className="gap-2"
                          >
                            Choose sizes
                            {sizePresets.length > 0 && (
                              <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs">
                                {sizePresets.length} selected
                              </span>
                            )}
                          </Button>
                          {sizePresets.length > 0 && (
                            <span className="text-xs text-neutral-500">
                              {sizePresets.map((k) => k.replace(/_/g, " ")).join(", ")}
                            </span>
                          )}
                        </div>
                      )}
                    </section>
                    <section className="space-y-2">
                      <Label className="text-neutral-400">Target width or height</Label>
                      <p className="text-xs text-neutral-500">Optional. Set width and/or height. With &quot;Maintain aspect ratio&quot;, only one dimension is applied and the other is computed.</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={4096}
                            placeholder="Width"
                            value={targetWidth}
                            onChange={(e) => onTargetWidthChange(e.target.value)}
                            className="w-24 rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500"
                          />
                          <span className="text-xs text-neutral-500">×</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={4096}
                            placeholder="Height"
                            value={targetHeight}
                            onChange={(e) => onTargetHeightChange(e.target.value)}
                            className="w-24 rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={maintainAspectRatio}
                            onChange={(e) => onMaintainAspectRatioChange(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                          />
                          <span className="text-sm text-neutral-300">Maintain aspect ratio</span>
                        </label>
                      </div>
                    </section>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="resize">
              <AccordionTrigger value="resize">Resize &amp; quality</AccordionTrigger>
              <AccordionContent value="resize" className="space-y-4">
                {isPictures && (
                  <section className="space-y-2">
                    <Label className="text-neutral-400">Resize behavior</Label>
                    <p className="text-xs text-neutral-500">When using size presets: <strong className="text-neutral-400">Crop</strong> = center-crop to fit; <strong className="text-neutral-400">Fill with color/blur</strong> = letterbox with a background.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={fillMode}
                        onChange={(e) => onFillModeChange(e.target.value as "crop" | "color" | "blur")}
                        className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
                      >
                        <option value="crop">Crop (center)</option>
                        <option value="color">Fill with color</option>
                        <option value="blur">Fill with blur</option>
                      </select>
                      {fillMode === "color" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={fillColor}
                            onChange={(e) => onFillColorChange(e.target.value)}
                            className="h-9 w-12 cursor-pointer rounded border border-neutral-600"
                          />
                          <span className="text-xs text-neutral-500">{fillColor}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}
                <section className="space-y-2">
                  <Label className="text-neutral-400">Target size reduction</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={sizeReductionPercent}
                      onChange={(e) => onSizeReductionChange(Number(e.target.value))}
                      className="h-2 w-40 flex-1 max-w-xs accent-neutral-400"
                    />
                    <span className="text-sm tabular-nums text-neutral-400 w-10">
                      {sizeReductionPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">{isPictures ? "Lower quality for smaller files (0 = keep quality)" : "Lower bitrate for smaller files"}</p>
                </section>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="advanced">
              <AccordionTrigger value="advanced">Advanced</AccordionTrigger>
              <AccordionContent value="advanced" className="space-y-4">
                <section className="space-y-2">
                  <Label className="text-neutral-400">Web optimization</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={webOptimized}
                        onChange={(e) => onWebOptimizedChange(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                      />
                      <span className="text-sm text-neutral-300">Web-optimized</span>
                    </label>
                    {isPictures && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={stripMetadata}
                            onChange={(e) => onStripMetadataChange(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                          />
                          <span className="text-sm text-neutral-300">Strip metadata</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={progressive}
                            onChange={(e) => onProgressiveChange(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                          />
                          <span className="text-sm text-neutral-300">Progressive (JPEG)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={aggressiveCompression}
                            onChange={(e) => onAggressiveCompressionChange(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                          />
                          <span className="text-sm text-neutral-300">Aggressive compression</span>
                        </label>
                      </>
                    )}
                    {multipleFiles && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zipWhenDone}
                            onChange={(e) => onZipWhenDoneChange(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                          />
                          <span className="text-sm text-neutral-300">Zip when done</span>
                        </label>
                        {zipWhenDone && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-neutral-500 shrink-0">ZIP folders:</Label>
                            <select
                              value={zipFolderStructure}
                              onChange={(e) => onZipFolderStructureChange(e.target.value as "flat" | "by_file" | "by_format")}
                              className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
                            >
                              <option value="flat">Flat (all in root)</option>
                              <option value="by_file">By original file</option>
                              <option value="by_format">By format (webp/, jpeg/)</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button
            onClick={onConvert}
            disabled={loading || outputFormats.length === 0}
            className="w-full sm:w-auto"
          >
            {loading ? "Converting…" : multipleFiles && zipWhenDone ? "Convert & zip" : "Convert"}
          </Button>
        </CardContent>
      </Card>

      {/* Sizes modal */}
      <Dialog open={sizesModalOpen} onOpenChange={setSizesModalOpen}>
        <DialogHeader>
          <DialogTitle>Output sizes</DialogTitle>
          <DialogClose onClose={() => setSizesModalOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {!presets ? (
            <div className="grid grid-cols-2 gap-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {presetEntries.map(([key, dims]) => {
                const [w, h] = dims ?? [1, 1];
                const ratio = dims ? w / h : 1;
                const maxSize = 44;
                const width = ratio >= 1 ? maxSize : maxSize * ratio;
                const height = ratio >= 1 ? maxSize / ratio : maxSize;
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                      sizePresets.includes(key)
                        ? "border-neutral-500 bg-neutral-800"
                        : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={sizePresets.includes(key)}
                      onChange={() => onToggleSizePreset(key)}
                      className="h-4 w-4 shrink-0 rounded border-neutral-600 bg-neutral-800 accent-neutral-100"
                    />
                    <div
                      className="shrink-0 rounded border border-neutral-600 bg-neutral-700/80"
                      style={{
                        width: Math.round(width),
                        height: Math.round(height),
                        minWidth: 24,
                        minHeight: 24,
                      }}
                      title={dims ? `${dims[0]} × ${dims[1]}` : "Original"}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium capitalize text-neutral-200">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {dims ? `${dims[0]} × ${dims[1]}` : "Original dimensions"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end border-t border-neutral-800 pt-4">
            <Button type="button" variant="secondary" onClick={() => setSizesModalOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
