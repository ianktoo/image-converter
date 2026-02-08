import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50",
          {
            default:
              "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
            secondary: "bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
            outline:
              "border border-neutral-600 bg-transparent hover:bg-neutral-800",
            ghost: "hover:bg-neutral-800",
            destructive: "bg-red-600 text-white hover:bg-red-700",
          }[variant],
          {
            default: "h-9 px-4 py-2",
            sm: "h-8 rounded px-3 text-sm",
            lg: "h-10 rounded-md px-8",
          }[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
