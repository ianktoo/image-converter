import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  batchZipUrl,
  getBatchStatus,
  libraryConvert,
  type LibraryConvertScope,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { IMAGE_FORMATS, VIDEO_FORMATS } from "./constants";

type Phase = "idle" | "running" | "done" | "error";

/** Convert every saved original in a scope (selection / project / folder) and produce
 * one ZIP. Polls the batch like the upload flow. */
export function ConvertAllDialog({
  scope,
  title,
  convertibleCount,
  skippedCount,
  kind,
  onClose,
  onConverted,
}: {
  scope: LibraryConvertScope | null;
  title: string;
  convertibleCount: number;
  skippedCount: number;
  kind: "image" | "video" | "mixed";
  onClose: () => void;
  onConverted: () => void;
}) {
  const [formats, setFormats] = useState<string[]>(["webp"]);
  const [webOptimized, setWebOptimized] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll the batch while running.
  useEffect(() => {
    if (phase !== "running" || !batchId) return;
    let active = true;
    const tick = async () => {
      try {
        const st = await getBatchStatus(batchId);
        if (!active) return;
        if (st.status === "completed") {
          setPhase("done");
          onConverted();
        } else if (st.status === "failed") {
          setError(st.error ?? "Conversion failed");
          setPhase("error");
        } else {
          setTimeout(tick, 1000);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    };
    const id = setTimeout(tick, 800);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [phase, batchId, onConverted]);

  if (!scope) return null;

  const formatChoices = kind === "video" ? VIDEO_FORMATS : IMAGE_FORMATS;
  const toggleFormat = (f: string) =>
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const start = async () => {
    if (!formats.length) {
      toast.error("Pick at least one output format");
      return;
    }
    setPhase("running");
    setError(null);
    try {
      const { batch_id } = await libraryConvert(scope, formats, { webOptimized });
      setBatchId(batch_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convert all — {title}</DialogTitle>
          <DialogDescription>
            {convertibleCount} item{convertibleCount === 1 ? "" : "s"} with a saved original will be converted.
            {skippedCount > 0 && ` ${skippedCount} without an original will be skipped.`}
          </DialogDescription>
        </DialogHeader>

        {phase === "done" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">Done. Your outputs are attached to each item and bundled into a ZIP.</p>
            {batchId && (
              <Button asChild className="w-full">
                <a href={batchZipUrl(batchId)} download>
                  <Download className="mr-2 h-4 w-4" /> Download ZIP
                </a>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Output formats</Label>
              <div className="flex flex-wrap gap-1.5">
                {formatChoices.map((f) => {
                  const active = formats.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      disabled={phase === "running"}
                      onClick={() => toggleFormat(f)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs uppercase transition-colors disabled:opacity-50",
                        active ? "border-foreground bg-accent" : "bg-card text-muted-foreground hover:border-accent-foreground/30",
                      )}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={webOptimized}
                disabled={phase === "running"}
                onChange={(e) => setWebOptimized(e.target.checked)}
              />
              Web-optimized (smaller files)
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {phase === "done" ? "Close" : "Cancel"}
          </Button>
          {phase !== "done" && (
            <Button type="button" onClick={start} disabled={phase === "running" || convertibleCount === 0}>
              {phase === "running" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converting…
                </>
              ) : (
                `Convert ${convertibleCount}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
