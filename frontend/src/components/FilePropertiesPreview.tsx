import {
  Dialog,
  DialogClose,
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
      <DialogHeader>
        <DialogTitle>File properties</DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          {previewUrl && (
            <div className="flex justify-center rounded-lg border border-neutral-700 bg-neutral-900 p-2">
              <img
                src={previewUrl}
                alt={filename}
                className="max-h-48 max-w-full rounded object-contain"
              />
            </div>
          )}
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Filename</dt>
              <dd className="truncate font-medium text-neutral-200">{filename}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Format</dt>
              <dd className="uppercase text-neutral-200">{ext || "—"}</dd>
            </div>
            {sizeBytes != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Size</dt>
                <dd className="text-neutral-200">{formatBytes(sizeBytes)}</dd>
              </div>
            )}
            {originalSize != null && sizeBytes != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Original size</dt>
                <dd className="text-neutral-400">{formatBytes(originalSize)}</dd>
              </div>
            )}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
