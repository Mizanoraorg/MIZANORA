// v62 — BHARI MEDIA KAHAN SE SERVE HO.
//
// Masla: /api/img, /api/poster aur /api/songs/cdn se guzarnay wala har byte
// hosting ke transfer quota me ginta hai. Vercel ne 2026-11-08 ko isi wajah se
// poora shop pause kar diya tha.
//
// Hal: yahi teen routes ek Cloudflare Worker par bhi maujood hain
// (workers/media-proxy/). Cloudflare par **egress bandwidth free/unlimited** hai.
// Is env var ko Worker ke address par set kar dein:
//
//   NEXT_PUBLIC_MEDIA_BASE=https://mizanora-media.<subdomain>.workers.dev
//
// Khaali chhoren to sab kuch pehle jaisa — isi server se — chalta rahega.
// (NEXT_PUBLIC_ hai is liye browser bundle me build ke waqt bake hoti hai;
//  badalne ke baad rebuild zaroori hai.)
//
// AHEM: TV relay (/api/tv/p) jaan kar is me shamil NAHI hai. Uski playlists
// HMAC se sign hoti hain (lib/tvProxy.js) — base badalne se signatures
// verify nahi hoti. Free plan par TV relay band rakhein (NEXT_PUBLIC_TV_RELAY=off).

export const MEDIA_BASE = String(process.env.NEXT_PUBLIC_MEDIA_BASE || '')
  .trim()
  .replace(/\/+$/, '');

export const hasMediaBase = () => Boolean(MEDIA_BASE);

/** '/api/img?u=...' -> '<base>/api/img?u=...'  (base na ho to jaisa hai waisa) */
export const mediaUrl = (path) => {
  const p = String(path || '');
  if (!MEDIA_BASE) return p;
  if (!p.startsWith('/api/')) return p; // sirf relay routes, baqi kuch nahi
  return `${MEDIA_BASE}${p}`;
};
