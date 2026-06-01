import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bookmark, History, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPromptTemplate,
  deleteExplanation,
  deletePromptTemplate,
  downloadUrl,
  explainImage,
  getAIStatus,
  listExplanations,
  listMedia,
  listPromptTemplates,
  type AIStatus,
  type Explanation,
  type MediaItem,
  type PromptTemplate,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function AIExplainView() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(NONE);
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Explanation[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    getAIStatus().then(setStatus).catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshMedia = useCallback(() => {
    listMedia({ limit: 100 })
      .then((items) => {
        // Only images with at least one output (gallery-eligible).
        setMedia(items.filter((m) => m.kind === "image" && m.outputs.length > 0));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(refreshMedia, [refreshMedia]);

  const refreshTemplates = useCallback(() => {
    listPromptTemplates().then(setTemplates).catch(() => {});
  }, []);

  useEffect(refreshTemplates, [refreshTemplates]);

  const refreshHistory = useCallback(() => {
    if (!selectedTaskId) {
      setHistory([]);
      return;
    }
    listExplanations(selectedTaskId)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [selectedTaskId]);

  useEffect(refreshHistory, [refreshHistory]);

  const selectedMedia = useMemo(
    () => (media ?? []).find((m) => m.task_id === selectedTaskId) ?? null,
    [media, selectedTaskId],
  );

  // When user picks a template, hydrate the prompt fields.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === NONE) {
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setPrompt(tpl.body);
      setSystemPrompt(tpl.system_prompt ?? "");
    }
  };

  const onRun = async () => {
    if (!selectedTaskId || !prompt.trim()) return;
    setBusy(true);
    try {
      await explainImage({
        task_id: selectedTaskId,
        prompt: prompt.trim(),
        system_prompt: systemPrompt.trim() || undefined,
        template_id: templateId === NONE ? undefined : templateId,
      });
      toast.success("Explanation generated");
      refreshHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.configured) {
    return <NotConfigured model={status.model} />;
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Sparkles className="h-6 w-6 text-primary" /> AI explain
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask Claude about a converted image — describe it, suggest compression, write alt text, anything.
              {status && (
                <>
                  {" "}
                  <span className="ml-1 text-xs">model: <code className="rounded bg-muted px-1 py-0.5">{status.model}</code></span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1 — Pick an image</CardTitle>
                <CardDescription>Only converted images appear here.</CardDescription>
              </CardHeader>
              <CardContent>
                {media === null ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-20" />)}
                  </div>
                ) : media.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Convert some images on the Convert tab first, then come back.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {media.map((m) => {
                      const out = m.outputs[0];
                      const url = downloadUrl(m.task_id, out);
                      const active = m.task_id === selectedTaskId;
                      return (
                        <button
                          key={m.task_id}
                          type="button"
                          onClick={() => setSelectedTaskId(m.task_id)}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border transition-colors",
                            active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:border-accent-foreground/30",
                          )}
                          title={m.filename ?? out}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">2 — Write or pick a prompt</CardTitle>
                <CardDescription>Templates seed your prompt. Saved templates persist for this session.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={templateId} onValueChange={applyTemplate}>
                    <SelectTrigger className="w-full max-w-sm">
                      <SelectValue placeholder="Use a template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>(write a custom prompt)</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{t.is_default ? " · built-in" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSaveOpen(true)}
                    disabled={!prompt.trim()}
                    title="Save current prompt as a template"
                  >
                    <Bookmark className="mr-1 h-4 w-4" /> Save as template
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ai-system">System prompt (optional)</Label>
                  <Input
                    id="ai-system"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="e.g. You are a concise visual critic."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-prompt">Prompt</Label>
                  <textarea
                    id="ai-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Describe this image and suggest alt text."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    onClick={onRun}
                    disabled={busy || !selectedTaskId || !prompt.trim()}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Asking Claude…
                      </>
                    ) : (
                      <>
                        <Send className="mr-1 h-4 w-4" /> Send
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" /> Conversation
                </CardTitle>
                <CardDescription>
                  {selectedMedia
                    ? `Responses for ${selectedMedia.filename ?? selectedMedia.task_id.slice(0, 8)}`
                    : "Pick an image to see prior explanations."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!selectedTaskId ? (
                  <p className="text-sm text-muted-foreground">No image selected.</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No explanations yet for this image.</p>
                ) : (
                  history.map((h) => (
                    <ExplanationCard key={h.id} explanation={h} onDeleted={refreshHistory} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <TemplateSidebar templates={templates} onChanged={refreshTemplates} />
        </div>
      </div>

      <SaveTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        prompt={prompt}
        systemPrompt={systemPrompt}
        onSaved={() => {
          setSaveOpen(false);
          refreshTemplates();
        }}
      />
    </div>
  );
}

function NotConfigured({ model }: { model: string }) {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex gap-4 p-6">
            <AlertCircle className="h-8 w-8 shrink-0 text-amber-500" />
            <div className="space-y-2">
              <p className="font-medium">Claude API key not set</p>
              <p className="text-sm text-muted-foreground">
                Set <code className="rounded bg-muted px-1 py-0.5">ANTHROPIC_API_KEY</code> on the host
                before <code className="rounded bg-muted px-1 py-0.5">docker compose up</code>, or
                add it under the <code className="rounded bg-muted px-1 py-0.5">backend</code> service in
                <code className="rounded bg-muted px-1 py-0.5"> docker-compose.yml</code>.
                Configured model: <code className="rounded bg-muted px-1 py-0.5">{model}</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExplanationCard({ explanation, onDeleted }: { explanation: Explanation; onDeleted: () => void }) {
  const [removing, setRemoving] = useState(false);
  const remove = async () => {
    setRemoving(true);
    try {
      await deleteExplanation(explanation.id);
      toast.success("Removed");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  };
  const tokens =
    explanation.input_tokens != null && explanation.output_tokens != null
      ? `${explanation.input_tokens}→${explanation.output_tokens} tok`
      : null;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">prompt</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="font-mono font-normal">{explanation.model}</Badge>
          {tokens && <span>{tokens}</span>}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm">{explanation.prompt}</p>
      <div className="border-t pt-2">
        <p className="text-xs font-medium text-muted-foreground">response</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{explanation.response}</p>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" disabled={removing} onClick={remove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

function TemplateSidebar({ templates, onChanged }: { templates: PromptTemplate[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await deletePromptTemplate(id);
      toast.success("Template removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };
  const customs = templates.filter((t) => !t.is_default);
  const defaults = templates.filter((t) => t.is_default);
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Templates</CardTitle>
        <CardDescription>Saved prompts for this session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Your templates" items={customs} onRemove={remove} busyId={busyId} />
        <Section title="Built-in" items={defaults} />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  items,
  onRemove,
  busyId,
}: {
  title: string;
  items: PromptTemplate[];
  onRemove?: (id: string) => void;
  busyId?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="rounded-md border p-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium">{t.name}</p>
              {onRemove && (
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => onRemove(t.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  prompt,
  systemPrompt,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  systemPrompt: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createPromptTemplate({
        name: name.trim(),
        body: prompt,
        system_prompt: systemPrompt.trim() || undefined,
      });
      toast.success("Template saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save prompt as template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hero image alt text" autoFocus />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Body</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted-foreground">{prompt}</p>
            {systemPrompt.trim() && (
              <>
                <p className="mt-2 font-medium">System prompt</p>
                <p className="mt-1 line-clamp-2 text-muted-foreground">{systemPrompt}</p>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy || !name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
