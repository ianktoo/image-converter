import { env } from "./env";

/** FastAPI error body: { detail: string } or { detail: [{ msg: string }, ...] } */
type ApiErrorDetail = string | Array<{ msg?: string; loc?: unknown; type?: string }>;

/**
 * Parse API error response into a short, user-friendly message.
 * Handles FastAPI validation and HTTPException bodies.
 */
export async function getErrorMessage(response: Response, bodyText: string): Promise<string> {
  const status = response.status;

  // Try to parse JSON detail
  let detail: ApiErrorDetail | undefined;
  try {
    const json = JSON.parse(bodyText) as { detail?: ApiErrorDetail };
    detail = json.detail;
  } catch {
    // Not JSON – use body as message if it's short and readable
    if (bodyText.length <= 200 && /^[\x20-\x7e\s]+$/.test(bodyText)) {
      return bodyText;
    }
  }

  if (detail !== undefined) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      const msg = first?.msg ?? (typeof first === "string" ? first : null);
      if (msg) return msg;
    }
  }

  // Fallback by status
  const statusMessages: Record<number, string> = {
    400: "Invalid request. Check your input and try again.",
    401: "Please sign in and try again.",
    403: "You don’t have permission to do that.",
    404: "The requested item was not found.",
    413: "File or request is too large.",
    422: "The request was invalid. Check your input.",
    502: "The server couldn’t complete the request. Try again later.",
    503: "Service temporarily unavailable. Try again in a moment.",
  };
  const message = statusMessages[status] ?? `Something went wrong (${status}). Try again.`;
  if (env.debug && bodyText) return `${message} ${bodyText.slice(0, 100)}`;
  return message;
}

/**
 * Throw a user-friendly Error after parsing the response.
 */
export async function throwApiError(response: Response): Promise<never> {
  const bodyText = await response.text();
  const message = await getErrorMessage(response, bodyText);
  throw new Error(message);
}
