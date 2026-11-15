# Cloudflare — "unlimited" ka sach, aur asli jugaad

**Date:** 2026-11-15 · Repo: `Mizanora-org/MIZANORA` @ `69ec816`

---

## 1. TL;DR

| Sawal | Jawab |
|-------|-------|
| Cloudflare par bandwidth waqai unlimited hai? | **Haan** — Workers/Pages par egress ka **koi charge nahi**. Storage aur CPU alag metered hain |
| Poora app Cloudflare Workers par chal sakta hai? | **Nahi** — 3 hard blockers (neeche numbers) |
| **Media relays** Workers par ja sakte hain? | **Haan — main ne bana kar test kar liya: 24/24 pass** |
| Kitna faida? | Aapki bandwidth ka **sabse bada hissa** origin se hat jata hai, **$0 me** |

**Asli jugaad:** poora app shift karne ki koshish na karein. Sirf **4 media relay routes** Cloudflare par le jayein (code ready hai), baqi app jahan hai wahan chalti rahe.

---

## 2. Bandwidth: kya waqai unlimited?

Haan — Cloudflare **egress bandwidth charge nahi karta**, Workers aur Pages dono par. Ye Vercel/AWS/Render ke bar-aks hai, jahan transfer hi bill karta hai.

Magar "unlimited" ka matlab sirf **bandwidth** hai:

| Cheez | Free | Paid $5/mo |
|-------|------|-----------|
| **Bandwidth (egress)** | **Unlimited, $0** | **Unlimited, $0** |
| Requests | 100,000/**din** | 10 million/mahina |
| CPU per request | **10 ms** | 30 s (5 min tak) |
| Memory | 128 MB | 128 MB |
| Bundle size | 64 MiB (uncompressed) | 64 MiB |
| Subrequests | 50 | 10,000 |

> Sept 2026 me Cloudflare ne 3 MB/10 MB wala compressed bundle cap **hata diya** — ab dono plans par 64 MiB uncompressed. Isi liye "bundle fit nahi hoga" wali purani baat ab **galat** hai. Maine dobara check kiya.

---

## 3. Poora app Workers par? — numbers ke saath

Maine aapke asli build par naapa (`.next/server` se):

| Cheez | Aapka app | Cloudflare | Nateeja |
|-------|-----------|------------|---------|
| **Bundle size** | 20.2 MB raw / **4.1 MB gzip** | 64 MiB uncompressed | ✅ **fit** |
| `node:crypto` | createHash, createHmac, randomBytes, randomUUID, timingSafeEqual | sab supported | ✅ |
| `node:net` | sirf `isIP`(10), `isIPv4/6`(4), `BlockList`(1) | polyfill | ⚠️ chhota patch |
| **`data/catalog` (42 MB)** | `fs.readFile` — har request par | **koi fs nahi**, RAM 128 MB | ❌ **hard** |
| **`firebase-admin`** | **33 API routes**, gRPC/TCP | **chalta hi nahi** | ❌ **hard** |
| **SSR CPU** | 11,297 products ke saath render | free 10 ms | ❌ |
| ISR (122 files) | `revalidate` | OpenNext + R2 se ✅ | ✅ |

**Faisla:**

| Option | Ho sakta hai? | Kharcha | Kaam |
|--------|---------------|---------|------|
| Workers Free | ❌ Nahi | $0 | — |
| Workers Paid | ❌ Bina rewrite nahi | $5/mo | 2–4 hafte |
| **Cloudflare Containers** | ✅ **Jaisa hai waisa** (Dockerfile ready hai) | **~$35–58/mo** | 1 din |
| **Media offload Worker** | ✅ **Aaj** | **$0** | 1–2 ghante |

Containers par dhyan dein: always-on container Cloudflare par **$35–58/mo** aata hai — ye kisi $7 VPS se **5–10x mehnga** hai. "Free" nahi.

---

## 4. Jo aaj kaam karta hai ⭐ — Media offload

### Kyun ye sahi hai

Aapki bandwidth **pages** nahi khaate — **relays** khaate hain:

| Route | Kya karta hai | Bandwidth |
|-------|---------------|-----------|
| `/api/img?u=` | product photos, banners, ads | **bhaari** |
| `/api/poster/<id>` | movie posters/backdrops | **bhaari** |
| `/api/songs/cdn?url=` | JioSaavn audio | **bhaari** |
| `/api/tv/p?u=` | live TV + VOD segments | **sabse bhaari** |

Maine chaaron ko parha: ye **pure HTTP proxies** hain — koi `fs` nahi, koi `firebase-admin` nahi (sirf TV ke channel allowlist ke liye Firebase). Yani Workers par **perfect fit**.

### Kya main ne banaya

`workers/media-proxy/` — asli Worker, main ne **24 tests** chalaye:

```
[1] /api/songs/cdn    ✅ saavn 200 · ✅ content-type · ✅ Range pass-through · ✅ evil host 400
[2] /api/img          ✅ private IP 400 · ✅ image 200 · ✅ cache header · ✅ non-image 415
[3] /api/poster       ✅ metahub fallback · ✅ image/jpeg · ✅ bad id 400
[4] /api/tv/p         ✅ bad signature 403 · ✅ good signature 200 · ✅ video/mp2t
[5] playlist rewrite  ✅ m3u8 · ✅ segments rewritten · ✅ KEY URI bhi · ✅ SAARI signatures valid
[6] misc              ✅ POST 405 · ✅ 404 · ✅ healthz · ✅ relay-off 503
=========== 24 pass, 0 fail ===========
```

**Sabse ahem test:** Worker ka HMAC signature aapke `lib/tvProxy.js` ke signature se **bilkul match** karta hai (4/4 URLs, byte-for-byte). Yani TV relay ki signed playlists tootengi nahi.

---

## 5. Setup — domain ke saath (app me ZERO code change)

1. Apna domain Cloudflare par add karein (free plan) → nameservers badal dein
2. `cd workers/media-proxy && npx wrangler deploy`
3. `npx wrangler secret put TV_PROXY_SECRET` — **wahi value** jo app ke env me hai
4. Cloudflare dashboard → Workers → `mizanora-media` → **Settings → Routes** — ye 4 add karein:

```
shop.example.com/api/img*        → mizanora-media
shop.example.com/api/poster*     → mizanora-media
shop.example.com/api/songs/cdn*  → mizanora-media
shop.example.com/api/tv/p*       → mizanora-media
```

Bas. Ab ye requests **Cloudflare par rukti hain** aur origin (Vercel/host) unhe **kabhi nahi dekhta** → media ka transfer bill **zero**.

> **Domain chahiye:** `mizanora.vercel.app` aapka nahi hai, us par Cloudflare route nahi lag sakta. Domain ~PKR 3–4k/saal — ye is jugaad ka ticket hai. (Shop ke liye domain waise bhi chahiye, `vercel.app` SEO/brand ke liye nuqsan hai.)

---

## 6. Setup — bina domain (`workers.dev`)

Worker alag URL par chalega: `https://mizanora-media.<subdomain>.workers.dev`

Tab app me relay URLs badalne padenge — sirf **4 jagah**:

| File | Line | Kya badalna hai |
|------|------|-----------------|
| `lib/imgFallback.js` | 111 | `` return `/api/img?u=${...}` `` → base URL prefix |
| `lib/songs.js` | 150 | `` return `/api/songs/cdn?url=${...}` `` |
| `lib/movies.js` | 264–265 | `` `/api/poster/${imdbId}` `` (2 jagah) |
| `lib/liveTv.js` | 148 | `` `/api/tv/p?u=${...}` `` |

⚠️ **`lib/imgFallback.js` line 102** bhi dekhna padega — wo `startsWith('/api/img?')` check karta hai, jo prefixed URL par fail hoga.

Isi liye **domain wala tareeqa behtar** hai: zero code change, zero risk.

---

## 7. TV relay — ek zaroori sach

Live TV **segments** har 2–10 second me ek request hai. Free tier **100,000 requests/din**:

```
50 viewers × 1 segment / 4 sec × 3600 sec  =  45,000 requests/hour
```

Yani ~2 ghante me free quota khatam. **Isliye:**

| Relay | Free Worker par? |
|-------|------------------|
| Images, posters, songs | ✅ **Haan** — kam requests, edge cache |
| **Live TV segments** | ❌ Free par nahi · Paid $5 (10M/mo) par ✅ |

**Mera mashwara:**
- Images + posters + songs → Worker (free) → **bada faida, zero risk**
- Live TV → `NEXT_PUBLIC_TV_RELAY=off` rakhein (free), ya zaroori ho to Workers **Paid $5/mo**

---

## 8. Kitna bachat?

Aapke case me bandwidth ka **bara hissa media** hai (isi wajah se Vercel ke "Fast Origin Transfer" par pause hua).

| Scenario | Origin transfer |
|----------|-----------------|
| Aaj (sab relays origin par) | 100% |
| Media → Cloudflare Worker | **~5–20%** (sirf HTML/JS) |
| + `NEXT_PUBLIC_TV_RELAY=off` | **~5%** |

Yani **10–20x kam**. Yehi wo cheez hai jo aapko kisi bhi free host par bacha legi.

---

## 9. Bonus: Cloudflare poori site ke aage (Play A)

Domain aane ke baad aap Cloudflare ko **poori site ke aage** rakh sakte hain (orange cloud):

- HTML/JS/CSS edge par cache → origin transfer phir se gir jata hai
- Free WAF, DDoS, bot protection
- Zero code change

⚠️ **Cache Rules** me ye paths **bypass** karein, warna cart/admin/customer data cache ho jayega:

```
/admin*  /api*  /account*  /cart*  /checkout*  /track*  /worker*  /wishlist*
+ koi bhi request jisme Cookie ya Authorization header ho
```

--- 

## 10. Files add ki

| File | Kaam |
|------|------|
| `workers/media-proxy/index.js` | 4 relays ka Worker (tested, 24/24) |
| `workers/media-proxy/wrangler.toml` | Deploy config + routes ki hidayat |
| `docs/CLOUDFLARE-JUGAD.md` | Yehi document |

**Note:** main ne app ka koi code nahi badla. Worker deploy karna aur routes lagana aap ka kaam hai (Cloudflare account chahiye). Test maine Node me chalaye — `Request`/`Response`/`fetch`/`crypto.subtle` sab Workers jaisa hi hai, lekin **asli Workers runtime par pehli deploy par nazar rakhein**.

---

## 11. Faisla — 30 second

```
Domain hai / le sakte hain?
   │
   ├─ haan ──→ Media Worker + routes (ZERO code change)  ⭐  + TV relay off
   │           = 10–20x kam origin transfer, $0/mo
   │
   └─ nahi ──→ TV relay off + images ko Worker par (4 files patch)
               ya: poori site Node host par (Oracle/Render) rakh kar
                   Cloudflare sirf aage laga dein (Play A)
```
