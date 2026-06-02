import { createContext, useContext, useState } from "react";

export type ViewId = "convert" | "library" | "ai";

type ViewContextValue = {
  view: ViewId;
  setView: (v: ViewId) => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<ViewId>("convert");
  return <ViewContext.Provider value={{ view, setView }}>{children}</ViewContext.Provider>;
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used inside ViewProvider");
  return ctx;
}
