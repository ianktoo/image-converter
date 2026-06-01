import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadUrl } from "@/lib/api";
import { formatBytes } from "@/lib/format";

const IMAGE_EXTENSIONS = ["webp", "jpeg", "jpg", "png", "gif", "avif", "bmp"];

type FilePropertiesPreviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  filename: string;
  sizeBytes?: number;
  originalSize?: number;
};

export function FilePropertiesPreview({
  open,
  onOpenChange,
  taskId,
  filename,
  sizeBytes,
  originalSize,
}: FilePropertiesPreviewProps) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const previewUrl = isImage ? downloadUrl(taskId, filename) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File properties</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {previewUrl && (
            <div className="flex justify-center rounded-lg border bg-muted p-2">
              <img
                src={previewUrl}
                alt={filename}
                className="max-h-48 max-w-full rounded object-contain"
              />
            </div>
          )}
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Filename</dt>
              <dd className="truncate font-medium">{filename}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Format</dt>
              <dd className="uppercase">{ext || "—"}</dd>
            </div>
            {sizeBytes != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatBytes(sizeBytes)}</dd>
              </div>
            )}
            {originalSize != null && sizeBytes != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Original size</dt>
                <dd className="text-muted-foreground">{formatBytes(originalSize)}</dd>
              </div>
            )}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
