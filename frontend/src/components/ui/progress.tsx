import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-neutral-800",
          className
        )}
        {...props}
      >
        <div
          className="h-full bg-neutral-100 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
