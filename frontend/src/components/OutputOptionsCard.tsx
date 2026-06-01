import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input bg-background accent-primary"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

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
          <CardDescription>
            {isPictures
              ? "Pick output formats and sizes. Use the size reduction slider and web optimization to balance quality and file size."
              : "Pick output format. Use web optimization to reduce file size."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Accordion defaultValue={["formats", "resize", "quality"]}>
            <AccordionItem value="formats">
              <AccordionTrigger value="formats">Formats &amp; sizes</AccordionTrigger>
              <AccordionContent value="formats" className="space-y-4">
                <section className="space-y-2">
                  <Label>Output format{isPictures ? "s" : ""}</Label>
                  <p className="text-xs text-muted-foreground">
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
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:border-accent-foreground/30 hover:text-foreground",
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
                      <Label>Output sizes</Label>
                      <p className="text-xs text-muted-foreground">Optional. Add presets (e.g. Instagram, Facebook) to get multiple dimensions per file. &quot;Original&quot; keeps the source size.</p>
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
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                                {sizePresets.length} selected
                              </span>
                            )}
                          </Button>
                          {sizePresets.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {sizePresets.map((k) => k.replace(/_/g, " ")).join(", ")}
                            </span>
                          )}
                        </div>
                      )}
                    </section>
                    <section className="space-y-2">
                      <Label>Target width or height</Label>
                      <p className="text-xs text-muted-foreground">Optional. Set width and/or height. With &quot;Maintain aspect ratio&quot;, only one dimension is applied and the other is computed.</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={4096}
                            placeholder="Width"
                            value={targetWidth}
                            onChange={(e) => onTargetWidthChange(e.target.value)}
                            className="w-24"
                          />
                          <span className="text-xs text-muted-foreground">×</span>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={4096}
                          placeholder="Height"
                          value={targetHeight}
                          onChange={(e) => onTargetHeightChange(e.target.value)}
                          className="w-24"
                        />
                        <CheckboxRow
                          checked={maintainAspectRatio}
                          onChange={onMaintainAspectRatioChange}
                          label="Maintain aspect ratio"
                        />
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
                    <Label>Resize behavior</Label>
                    <p className="text-xs text-muted-foreground">When using size presets: <strong className="text-foreground">Crop</strong> = center-crop to fit; <strong className="text-foreground">Fill with color/blur</strong> = letterbox with a background.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Select
                        value={fillMode}
                        onValueChange={(v) => onFillModeChange(v as "crop" | "color" | "blur")}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="crop">Crop (center)</SelectItem>
                          <SelectItem value="color">Fill with color</SelectItem>
                          <SelectItem value="blur">Fill with blur</SelectItem>
                        </SelectContent>
                      </Select>
                      {fillMode === "color" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={fillColor}
                            onChange={(e) => onFillColorChange(e.target.value)}
                            className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                          />
                          <span className="text-xs text-muted-foreground">{fillColor}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}
                <section className="space-y-2">
                  <Label>Target size reduction</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={sizeReductionPercent}
                      onChange={(e) => onSizeReductionChange(Number(e.target.value))}
                      className="h-2 w-40 max-w-xs flex-1 accent-primary"
                    />
                    <span className="w-10 text-sm tabular-nums text-muted-foreground">
                      {sizeReductionPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{isPictures ? "Lower quality for smaller files (0 = keep quality)" : "Lower bitrate for smaller files"}</p>
                </section>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="advanced">
              <AccordionTrigger value="advanced">Advanced</AccordionTrigger>
              <AccordionContent value="advanced" className="space-y-4">
                <section className="space-y-2">
                  <Label>Web optimization</Label>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <CheckboxRow checked={webOptimized} onChange={onWebOptimizedChange} label="Web-optimized" />
                    {isPictures && (
                      <>
                        <CheckboxRow checked={stripMetadata} onChange={onStripMetadataChange} label="Strip metadata" />
                        <CheckboxRow checked={progressive} onChange={onProgressiveChange} label="Progressive (JPEG)" />
                        <CheckboxRow checked={aggressiveCompression} onChange={onAggressiveCompressionChange} label="Aggressive compression" />
                      </>
                    )}
                    {multipleFiles && (
                      <>
                        <CheckboxRow checked={zipWhenDone} onChange={onZipWhenDoneChange} label="Zip when done" />
                        {zipWhenDone && (
                          <div className="flex items-center gap-2">
                            <Label className="shrink-0 text-xs text-muted-foreground">ZIP folders:</Label>
                            <Select
                              value={zipFolderStructure}
                              onValueChange={(v) => onZipFolderStructureChange(v as "flat" | "by_file" | "by_format")}
                            >
                              <SelectTrigger className="h-8 w-[220px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="flat">Flat (all in root)</SelectItem>
                                <SelectItem value="by_file">By original file</SelectItem>
                                <SelectItem value="by_format">By format (webp/, jpeg/)</SelectItem>
                              </SelectContent>
                            </Select>
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

      <Dialog open={sizesModalOpen} onOpenChange={setSizesModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Output sizes</DialogTitle>
          </DialogHeader>
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
                        ? "border-primary bg-accent"
                        : "hover:border-accent-foreground/30 hover:bg-accent/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={sizePresets.includes(key)}
                      onChange={() => onToggleSizePreset(key)}
                      className="h-4 w-4 shrink-0 rounded border-input bg-background accent-primary"
                    />
                    <div
                      className="shrink-0 rounded border bg-muted"
                      style={{
                        width: Math.round(width),
                        height: Math.round(height),
                        minWidth: 24,
                        minHeight: 24,
                      }}
                      title={dims ? `${dims[0]} × ${dims[1]}` : "Original"}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dims ? `${dims[0]} × ${dims[1]}` : "Original dimensions"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end border-t pt-4">
            <Button type="button" variant="secondary" onClick={() => setSizesModalOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
