import { AppSidebar } from "@/components/AppSidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
