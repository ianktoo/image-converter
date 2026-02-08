import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        "h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-neutral-100 focus:ring-2 focus:ring-neutral-400",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
