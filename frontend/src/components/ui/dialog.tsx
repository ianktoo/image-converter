import { forwardRef, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const el = typeof document !== "undefined" ? document.body : null;
  if (!open || !el) return null;
  return createPortal(
    <DialogOverlay open={open} onOpenChange={onOpenChange} className={className}>
      {children}
    </DialogOverlay>,
    el
  );
}

function DialogOverlay({
  open,
  onOpenChange,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const DialogHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 border-b border-neutral-800 p-4", className)}
    {...props}
  />
));
DialogHeader.displayName = "DialogHeader";

const DialogTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("overflow-y-auto p-4", className)} {...props} />
));
DialogContent.displayName = "DialogContent";

function DialogClose({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={cn(
        "absolute right-3 top-3 rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100",
        className
      )}
      aria-label="Close"
    >
      {children ?? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}

export { DialogHeader, DialogTitle, DialogContent, DialogClose };
