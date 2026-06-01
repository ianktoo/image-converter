import { AlertCircle } from "lucide-react";
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
  onRetry?: () => void;
};

export function ErrorAlert({ message, onDismiss, onRetry }: ErrorAlertProps) {
  const display = getDisplayMessage(message);
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive shadow-sm"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-sm opacity-90">{display}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
