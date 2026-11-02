// In local dev, requests go through Vite's own proxy (see vite.config.ts), so a bare "/api/..."
// path is correct and VITE_SERVER_URL is left unset. In a production static deploy (e.g. Vercel),
// there is no dev proxy — the frontend is served from a different origin than the backend, so
// every API call must be prefixed with the backend's real URL, read from this build-time env var.
const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/+$/, "");

/** Prefixes an "/api/..." path with the configured backend origin (a no-op in local dev). */
export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}
