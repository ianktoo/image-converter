import { Button } from "@/components/ui/button";

const FRIENDLY_MESSAGES: Record<string, string> = {
  "Failed to fetch":
    "Cannot reach the server. Check your internet connection and that the converter backend is running.",
  "NetworkError when attempting to fetch resource.":
    "Network error. Check your connection and try again.",
  "Load failed":
    "Request failed. The server may be unavailable.",
};

function getDisplayMessage(message: string): string {
  return FRIENDLY_MESSAGES[message] ?? message;
}

type ErrorAlertProps = {
  message: string;
  onDismiss: () => void;
  /** Optional retry (e.g. for initial load). */
  onRetry?: () => void;
};

export function ErrorAlert({ message, onDismiss, onRetry }: ErrorAlertProps) {
  const display = getDisplayMessage(message);
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-200 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-red-100">Something went wrong</p>
          <p className="mt-1 text-sm">{display}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-700 text-red-200 hover:bg-red-900/50"
              onClick={onRetry}
            >
              Retry
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-300 hover:bg-red-900/30 hover:text-red-100"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
