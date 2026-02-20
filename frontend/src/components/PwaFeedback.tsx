import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Button } from "@/components/ui/button";

/**
 * Registers the PWA service worker and shows user feedback per PWA best practices
 * (e.g. https://create-react-app.dev/docs/making-a-progressive-web-app/):
 * - "This web app works offline!" when caches are ready
 * - "New content is available" when an update is waiting (if using prompt reload)
 */
export function PwaFeedback() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    registerSW({
      immediate: true,
      onOfflineReady() {
        setOfflineReady(true);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisterError(error) {
        console.error("PWA service worker registration failed:", error);
      },
    });
  }, []);

  const show = (offlineReady || needRefresh) && !dismissed;
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-slate-600 bg-slate-900/95 p-4 text-slate-200 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-100">
            {needRefresh ? "New content available" : "Ready for offline use"}
          </p>
          <p className="mt-1 text-sm">
            {needRefresh
              ? "Reload the page to get the latest version."
              : "This web app works offline."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {needRefresh && (
            <Button
              type="button"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
