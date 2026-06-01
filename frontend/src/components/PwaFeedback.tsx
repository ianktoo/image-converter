import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { Button } from "@/components/ui/button";

/**
 * Registers the PWA service worker in production builds and shows user feedback
 * when an update is ready. In dev we deliberately do NOT register a service
 * worker — and we proactively unregister any service worker that a previous
 * session installed, otherwise it keeps serving stale bundles to the browser.
 */
export function PwaFeedback() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) {
      // Unregister any previously-installed SW from past runs and clear
      // its caches, so we never see stale assets while developing.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()))
          .catch(() => {});
      }
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }
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
      className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border bg-card p-4 text-card-foreground shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {needRefresh ? "New content available" : "Ready for offline use"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {needRefresh
              ? "Reload the page to get the latest version."
              : "This web app works offline."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {needRefresh && (
            <Button type="button" size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
