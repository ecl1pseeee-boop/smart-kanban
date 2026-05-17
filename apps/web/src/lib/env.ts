// Vite exposes env via import.meta.env; we read once and pin the values.
//
// In dev the SPA leaves these empty and lets the Vite proxy forward `/api`
// and `/socket.io` to the local Fastify on :3001 — that way the SPA loads
// through *any* host (localhost, GitHub Codespaces / Gitpod forwarded URLs,
// LAN IPs) and the browser never tries to hit `localhost:3001` directly.
//
// In prod set `VITE_API_URL` / `VITE_WS_URL` to point at your API host.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '')
