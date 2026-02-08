import { createContext, useContext, useState } from "react";
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
  /** Values of items that are open by default */
  defaultValue?: string[];
  className?: string;
  children: React.ReactNode;
};

export function Accordion({ defaultValue = [], className, children }: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultValue);

  const toggle = (value: string) => {
    setOpenItems((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
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
      className={cn("rounded-lg border border-neutral-800 overflow-hidden", className)}
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
        "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-200 hover:bg-neutral-800/50 transition-colors",
        className
      )}
      aria-expanded={isOpen}
    >
      {children}
      <span className="shrink-0 text-neutral-500" aria-hidden>
        {isOpen ? "−" : "+"}
      </span>
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
    <div className={cn("border-t border-neutral-800 px-4 py-3 text-neutral-300", className)}>
      {children}
    </div>
  );
}
