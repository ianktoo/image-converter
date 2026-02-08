/**
 * Frontend config from environment (Vite: VITE_* in .env).
 * All config is optional; defaults work with dev proxy to backend.
 */

const getEnv = (key: string, fallback: string): string => {
  const v = import.meta.env[key];
  return typeof v === "string" ? v : fallback;
};

export const env = {
  /** API base URL (empty = same origin / use proxy). */
  apiBaseUrl: getEnv("VITE_API_BASE_URL", ""),
  /** App title for display. */
  appTitle: getEnv("VITE_APP_TITLE", "Image Converter"),
  /** Show debug hints in UI (e.g. raw error). */
  debug: getEnv("VITE_DEBUG", "false") === "true",
} as const;
