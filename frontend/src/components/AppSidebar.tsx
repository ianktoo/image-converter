import { cn } from "@/lib/utils";

const navItems = [
  { id: "convert", label: "Convert", icon: IconConvert },
] as const;

function IconConvert({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function AppSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex w-56 flex-col border-r border-neutral-800 bg-neutral-900/80",
        className
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-700 text-neutral-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
        <span className="font-semibold text-neutral-100">Converter</span>
      </div>

      <nav className="shrink-0 space-y-0.5 p-2">
        {navItems.map((item) => (
          <span
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              item.id === "convert"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400"
            )}
          >
            <item.icon className="shrink-0 text-neutral-400" />
            {item.label}
          </span>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-800">
        <div className="p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            How to use
          </h3>
          <ol className="space-y-2 text-xs text-neutral-400">
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">1.</span>
              <span>Switch between <strong className="text-neutral-300">Pictures</strong> and <strong className="text-neutral-300">Videos</strong> at the top, then upload files or paste a URL.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">2.</span>
              <span><strong className="text-neutral-300">Pictures:</strong> pick output formats (WebP, JPEG, etc.) and optionally output sizes (Instagram, Facebook).</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">3.</span>
              <span><strong className="text-neutral-300">Videos:</strong> pick output format (MP4, WebM, WebP). Sizes and resize behavior apply only to images.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">4.</span>
              <span>Use <strong className="text-neutral-300">Target size reduction</strong> and <strong className="text-neutral-300">Web optimization</strong> to shrink file size.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">5.</span>
              <span>Click <strong className="text-neutral-300">Convert</strong> (or <strong className="text-neutral-300">Convert & zip</strong> for multiple files).</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-neutral-500">6.</span>
              <span>Download each file or use <strong className="text-neutral-300">Preview properties</strong> for details.</span>
            </li>
          </ol>
          <p className="mt-3 text-[11px] text-neutral-500">
            For many files, enable &quot;Zip when done&quot; to get a single ZIP when conversion finishes.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-800 p-3">
        <p className="text-xs text-neutral-500">Pictures & videos → WebP, JPEG, PNG, MP4, and more</p>
      </div>
    </aside>
  );
}
