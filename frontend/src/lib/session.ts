const STORAGE_KEY = "converter_session_id";

export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
}

export function getSessionHeaders(): Record<string, string> {
  const sid = getSessionId();
  if (!sid) return {};
  return { "X-Session-ID": sid };
}
