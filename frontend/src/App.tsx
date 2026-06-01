import { Layout } from "@/components/Layout";
import { useView } from "@/components/view-context";
import { AIExplainView } from "@/views/AIExplainView";
import { ConverterView } from "@/views/ConverterView";
import { GalleryView } from "@/views/GalleryView";
import { MediaView } from "@/views/MediaView";
import { ProjectsView } from "@/views/ProjectsView";
import { TagsView } from "@/views/TagsView";
import "./App.css";

export default function App() {
  const { view } = useView();
  return (
    <Layout>
      {view === "convert" && <ConverterView />}
      {view === "media" && <MediaView />}
      {view === "projects" && <ProjectsView />}
      {view === "tags" && <TagsView />}
      {view === "gallery" && <GalleryView />}
      {view === "ai" && <AIExplainView />}
    </Layout>
  );
}
