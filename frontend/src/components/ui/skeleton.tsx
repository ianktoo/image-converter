import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Skeleton = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse rounded-md bg-neutral-800", className)}
    {...props}
  />
));
Skeleton.displayName = "Skeleton";

export { Skeleton };
