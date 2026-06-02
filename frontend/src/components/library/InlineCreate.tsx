import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiny inline "+ New X" affordance: a button that expands into an input + confirm.
 * Used to create projects / folders / tags at the point of use, so you never have to
 * leave the workspace to make one.
 */
export function InlineCreate({
  label,
  onCreate,
  className,
}: {
  label: string;
  onCreate: (name: string) => Promise<void> | void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onCreate(v);
      setName("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
          className,
        )}
      >
        <Plus className="h-3.5 w-3.5" /> New {label}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
        placeholder={`${label} name`}
        disabled={busy}
        className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      />
      <button type="button" onClick={submit} disabled={busy} className="rounded p-1 hover:bg-accent" aria-label="Confirm">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
