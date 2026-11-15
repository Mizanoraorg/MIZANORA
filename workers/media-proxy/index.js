/**
 * MIZANORA media proxy — Cloudflare Worker
 *
 * Kyun: aapki site ka 90%+ bandwidth ye 4 relay khaate hain, pages nahi.
 * Cloudflare Workers par **egress bandwidth ka koi charge nahi** — is liye
 * inhe yahan le aane se Vercel/host ka transfer bill lagbhag zero ho jata hai.
 *
 * Ye Worker origin ke chaar routes ka hi kaam karta hai:
 *   /api/img?u=<url>            → image relay (8 MB cap)
 *   /api/songs/cdn?url=<url>    → JioSaavn CDN proxy (Range support)
 *   /api/poster/<imdbId>?k=…    → poster/backdrop (metahub → TMDB fallback)
 *   /api/tv/p?u=<url>&s=<sig>   → TV stream relay (HMAC-signed)
 *
 * Origin app me koi code change NAHI chahiye — Worker ko usi domain par
 * `mizanora.com/api/*` route se baandh dein, aur wo origin se pehle jawab dega.
 * (Bina custom domain ke `*.workers.dev` par chalega — tab app me base URL
 *  badalna padega, tafseel docs/CLOUDFLARE-JUGAD.md me.)
 */

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const IMG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const text = (msg, status = 400, extra = {}) =>
  new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

/* ---------------------------------------------------------------- helpers */

const list = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function hostAllowed(host, allow) {
  if (!allow.length) return true;
  host = host.toLowerCase();
  return allow.some((d) => host === d || host.endsWith(`.${d}`));
}

/** SSRF ki dasar rok: private/local/metadata addresses. */
function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0' || h === '169.254.169.254') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function safeTarget(raw, { httpsOnly = true, allow = [] } = {}) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (httpsOnly && u.protocol !== 'https:') return null;
  if (!httpsOnly && !/^https?:$/.test(u.protocol)) return null;
  if (isPrivateHost(u.hostname) || !hostAllowed(u.hostname, allow)) return null;
  return u;
}

const b64url = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Origin (lib/tvProxy.js) se bilkul match: HMAC-SHA256 → base64url → pehle 22 chars. */
async function signUrl(u, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(u)));
  return b64url(mac).slice(0, 22);
}

async function checkSig(u, sig, secret) {
  const want = await signUrl(u, secret);
  const got = String(sig || '');
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** Upstream se aane wale sirf zaroori headers aage bhejna. */
function forwardedHeaders(res, { cache, type } = {}) {
  const h = new Headers();
  h.set('Content-Type', type || res.headers.get('content-type') || 'application/octet-stream');
  if (cache) h.set('Cache-Control', cache);
  for (const k of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = res.headers.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

const isPlaylist = (url, type) => /mpegurl|m3u/i.test(type || '') || /\.m3u8?(\?|$)/i.test(url);
const mediaTypeOk = (type) => !type || /^(video|audio)\//i.test(type) || /(mpegurl|m3u|octet-stream|mp2t|mp4|mpeg|aac|binary)/i.test(type) || /^text\/plain/i.test(type);

/** Passthrough version — sirf tab jab secret na ho (signing ke baghair relay karna bekaar hai). */
export function rewriteM3U(txt, baseUrl, toRelay = (a) => `/api/tv/p?u=${encodeURIComponent(a)}`) {
  const abs = (v) => { try { return new URL(v, baseUrl).href; } catch { return ''; } };
  return String(txt).split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/gi, (m, v) => { const a = abs(v); return a && /^https?:/i.test(a) ? `URI="${toRelay(a)}"` : m; });
    const a = abs(t);
    return a && /^https?:/i.test(a) ? toRelay(a) : line;
  }).join('\n');
}

/**
 * Asli rewrite: har address ke liye ASYNC signature.
 * (Pehle PENDING placeholder daal kar string surgery karna off-by-one ka shikaar tha —
 *  `&s=PENDING` 10 characters hai, 9 nahi. Ab seedha await.)
 */
export async function rewriteM3USigned(txt, baseUrl, secret) {
  const abs = (v) => { try { return new URL(v, baseUrl).href; } catch { return ''; } };
  const relay = async (a) => `/api/tv/p?u=${encodeURIComponent(a)}&s=${await signUrl(a, secret)}`;
  const lines = String(txt).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { out.push(line); continue; }
    if (t.startsWith('#')) {
      // #EXT-X-KEY:URI="...", #EXT-X-MAP:URI="..." — inhe bhi relay karna lazmi hai
      const pieces = line.split(/(URI="[^"]+")/i);
      let rebuilt = '';
      for (const piece of pieces) {
        const m = piece.match(/^URI="([^"]+)"$/i);
        if (!m) { rebuilt += piece; continue; }
        const a = abs(m[1]);
        rebuilt += a && /^https?:/i.test(a) ? `URI="${await relay(a)}"` : piece;
      }
      out.push(rebuilt);
      continue;
    }
    const a = abs(t);
    out.push(a && /^https?:/i.test(a) ? await relay(a) : line);
  }
  return out.join('\n');
}

/* ---------------------------------------------------------------- routes  */

async function handleImage(request, url, env) {
  const target = safeTarget(url.searchParams.get('u') || url.searchParams.get('url'), {
    allow: list(env.NEXT_IMAGE_PROXY_HOSTS || env.ALLOWED_IMAGE_HOSTS),
  });
  if (!target) return text('bad image link', 400);

  const res = await fetch(target.href, {
    headers: { 'user-agent': IMG_UA, accept: 'image/*,*/*' },
    cf: { cacheEverything: true, cacheTtl: 2592000 },
  });
  if (!res.ok) return text(`upstream ${res.status}`, 502);

  const type = res.headers.get('content-type') || '';
  if (!/^image\//i.test(type)) { try { res.body?.cancel(); } catch { /* ignore */ } return text('not an image', 415); }
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_IMAGE_BYTES) { try { res.body?.cancel(); } catch { /* ignore */ } return text('too large', 413); }

  return new Response(res.body, {
    status: 200,
    headers: forwardedHeaders(res, { cache: 'public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=604800', type }),
  });
}

async function handleSong(request, url) {
  // Origin ki tarah host-locked: ye aam open proxy NAHI hai.
  const target = safeTarget(url.searchParams.get('url') || url.searchParams.get('u'), {
    allow: ['saavncdn.com', 'jiosaavn.com', 'saavn.com'],
  });
  if (!target) return text('bad or disallowed url', 400);

  const range = request.headers.get('range');
  const res = await fetch(target.href, {
    headers: { 'user-agent': IMG_UA, accept: '*/*', ...(range ? { range } : {}) },
    cf: { cacheEverything: true, cacheTtl: 31536000 },
  });
  if (!res.ok && res.status !== 206) { try { res.body?.cancel(); } catch { /* ignore */ } return text(`upstream ${res.status}`, 502); }

  return new Response(res.body, {
    status: res.status,
    headers: forwardedHeaders(res, { cache: 'public, max-age=604800, s-maxage=31536000, immutable' }),
  });
}

async function handlePoster(url, env) {
  const id = (url.pathname.split('/').filter(Boolean).pop() || '').trim().toLowerCase();
  if (!/^tt\d{6,10}$/.test(id)) return text('bad id', 400, { 'Cache-Control': 'public, max-age=300' });

  const kind = String(url.searchParams.get('k') || 'poster').toLowerCase() === 'backdrop' ? 'background' : 'poster';
  const candidates = ['medium', 'small', 'large'].map((s) => `https://images.metahub.space/${kind}/${s}/${id}/img`);

  for (const c of candidates) {
    try {
      const res = await fetch(c, { headers: { 'user-agent': IMG_UA, accept: 'image/*' }, cf: { cacheEverything: true, cacheTtl: 2592000 } });
      if (res.ok && /^image\//i.test(res.headers.get('content-type') || '')) {
        return new Response(res.body, {
          status: 200,
          headers: forwardedHeaders(res, { cache: 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800' }),
        });
      }
      try { res.body?.cancel(); } catch { /* ignore */ }
    } catch { /* agla candidate */ }
  }
  return text('no poster', 404, { 'Cache-Control': 'public, max-age=300' });
}

async function handleTv(request, url, env) {
  if (String(env.NEXT_PUBLIC_TV_RELAY || '').toLowerCase() === 'off') return text('The stream relay is switched off on this shop.', 503);

  const target = safeTarget(url.searchParams.get('u'), { httpsOnly: false });
  if (!target) return text('Bad address', 400);

  const sig = url.searchParams.get('s');
  if (sig) {
    const secret = env.TV_PROXY_SECRET;
    if (!secret) return text('Relay secret not configured', 500);
    if (!(await checkSig(target.href, sig, secret))) return text('Bad signature', 403);
  } else if (env.ORIGIN) {
    // Bina signature wali request = channel ka pehla address. Uske liye admin ki
    // saved channel list chahiye (Firebase) — wo yahan nahi hai, is liye origin
    // se poochte hain. Signature wali (asli media) requests yahan hi rukti hain.
    return fetch(new URL(url.pathname + url.search, env.ORIGIN), request);
  } else {
    return text('Set TV_PROXY_SECRET / ORIGIN', 500);
  }

  const range = request.headers.get('range');
  const res = await fetch(target.href, {
    headers: { 'user-agent': UA, accept: '*/*', ...(range ? { range } : {}) },
    redirect: 'follow',
  });
  if (!res.ok && res.status !== 206) { try { res.body?.cancel(); } catch { /* ignore */ } return text(`Stream server answered ${res.status}`, res.status === 404 ? 404 : 502); }

  const type = res.headers.get('content-type') || '';
  if (!mediaTypeOk(type)) { try { res.body?.cancel(); } catch { /* ignore */ } return text('Not a media stream', 415); }

  if (isPlaylist(res.url || target.href, type)) {
    const body = await res.text();
    if (!/^#EXTM3U/.test(body.trimStart())) return text('Not a playlist', 415);
    const secret = env.TV_PROXY_SECRET;
    if (!secret) return text('Relay secret not configured', 500);
    const base = new URL(res.url || target.href).href;
    // Playlist har kuch second badalti hai — sirf browser me cache, edge par nahi.
    const out = await rewriteM3USigned(body, base, secret);
    return new Response(out, { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, max-age=2' } });
  }

  const immutable = /^(video\/mp4|audio\/)/i.test(type) || /\.(mp4|m4a|mp3|aac|webm)(?:[?#]|$)/i.test(res.url || target.href);
  return new Response(res.body, {
    status: res.status,
    headers: forwardedHeaders(res, { cache: immutable ? 'public, max-age=86400, s-maxage=86400' : 'public, max-age=600, s-maxage=3600', type }),
  });
}

/* ---------------------------------------------------------------- router  */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range' } });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('method not allowed', 405);
    if (p === '/healthz') return text('ok', 200);

    try {
      if (p === '/api/img' || p === '/img') return await handleImage(request, url, env);
      if (p === '/api/songs/cdn') return await handleSong(request, url);
      if (p === '/api/poster' || p.startsWith('/api/poster/')) return await handlePoster(url, env);
      if (p === '/api/tv/p') return await handleTv(request, url, env);
    } catch (e) {
      return text(`relay error: ${String(e && e.message || e).slice(0, 140)}`, 502);
    }

    // Baqi sab kuch origin par (agar route sirf /api/* par laga hai to ye line
    // kabhi nahi chalti — Cloudflare khud origin par bhej deta hai).
    if (env.ORIGIN) return fetch(new URL(p + url.search, env.ORIGIN), request);
    return text('not found', 404);
  },
};

// Test ke liye (Node me import karne par bhi kaam kare).
export { signUrl, checkSig, safeTarget, isPrivateHost };
