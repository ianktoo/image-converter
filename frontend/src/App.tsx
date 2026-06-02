import { Layout } from "@/components/Layout";
import { useView } from "@/components/view-context";
import { AIExplainView } from "@/views/AIExplainView";
import { ConverterView } from "@/views/ConverterView";
import { LibraryView } from "@/views/LibraryView";
import "./App.css";

export default function App() {
  const { view } = useView();
  return (
    <Layout>
      {view === "convert" && <ConverterView />}
      {view === "library" && <LibraryView />}
      {view === "ai" && <AIExplainView />}
    </Layout>
  );
}
