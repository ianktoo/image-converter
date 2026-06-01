import { createContext, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionContextValue = {
  openItems: string[];
  toggle: (value: string) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("Accordion components must be used within Accordion");
  return ctx;
}

type AccordionProps = {
  defaultValue?: string[];
  className?: string;
  children: React.ReactNode;
};

export function Accordion({ defaultValue = [], className, children }: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultValue);

  const toggle = (value: string) => {
    setOpenItems((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={cn("space-y-1", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

type AccordionItemProps = {
  value: string;
  className?: string;
  children: React.ReactNode;
};

export function AccordionItem({ value, className, children }: AccordionItemProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border", className)}
      data-value={value}
    >
      {children}
    </div>
  );
}

type AccordionTriggerProps = {
  value: string;
  className?: string;
  children: React.ReactNode;
};

export function AccordionTrigger({ value, className, children }: AccordionTriggerProps) {
  const ctx = useAccordion();
  const isOpen = ctx.openItems.includes(value);

  return (
    <button
      type="button"
      onClick={() => ctx.toggle(value)}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      aria-expanded={isOpen}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180",
        )}
        aria-hidden
      />
    </button>
  );
}

type AccordionContentProps = {
  value: string;
  className?: string;
  children: React.ReactNode;
};

export function AccordionContent({ value, className, children }: AccordionContentProps) {
  const ctx = useAccordion();
  if (!ctx.openItems.includes(value)) return null;

  return (
    <div className={cn("border-t px-4 py-3 text-sm", className)}>
      {children}
    </div>
  );
}
