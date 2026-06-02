import { Library, Sparkles, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useView, type ViewId } from "@/components/view-context";

type NavItem = {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  { id: "convert", label: "Convert", icon: ArrowDownToLine },
  { id: "library", label: "Library", icon: Library },
  { id: "ai", label: "AI explain", icon: Sparkles },
];

export function AppSidebar({ className }: { className?: string }) {
  const { view, setView } = useView();
  return (
    <aside
      className={cn(
        "hidden w-56 shrink-0 flex-col border-r bg-card md:flex",
        className,
      )}
    >
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => {
          const active = item.id === view;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) setView(item.id);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                item.disabled && "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-muted-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
