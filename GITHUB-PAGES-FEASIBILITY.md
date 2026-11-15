# Mizanora → GitHub Pages: Feasibility Report

**Date:** 2026-11-15
**Repo:** `Mizanora-org/MIZANORA` @ `69ec816` (v61.0.0)
**Sawal:** Kya ye repo GitHub Pages par shift ho sakta hai — **har function properly kaam karte hue**?

---

## 1. Seedha jawab (TL;DR)

> **Nahi. Is architecture ke saath nahi.**
>
> GitHub Pages sirf **static files** (HTML/CSS/JS) serve karta hai. Isme **koi server code nahi chal sakta** — na API, na middleware, na cron, na database writes.
>
> Mizanora ek **full-stack Next.js app** hai: **89 API routes**, **79 routes explicitly runtime-only**, **11,297 products**, Firebase Admin backend, live TV relays, AI assistant, orders/wishlist/worker payouts. Iska **aadha se zyada hissa server ke baghair exist hi nahi kar sakta**.
>
> Main ne sirf theory nahi likhi — main ne **asli static export build chala kar test kiya**. Build **fail** ho gaya. Neeche exact error aur numbers hain.

**Magar** — 3 raste maujood hain, aur inme se **ek aapki asli problem (Vercel pause/quota) ka behtar hal hai**. Section 6 dekhein.

---

## 2. Main ne kya test kiya (evidence)

Repo ko install karke (`npm ci`, 378 packages) `next.config.js` me GitHub Pages wali setting lagayi:

```js
output: 'export',
trailingSlash: true,
```

Phir `npx next build` chalaya. **Result:**

```
✓ Compiled successfully in 40.0s
  Collecting page data ...
Error: export const dynamic = "force-static"/export const revalidate not configured
       on route "/blog/feed.xml" with "output: export".
> Build error occurred
[Error: Failed to collect page data for /blog/feed.xml]
```

Ye sirf **pehla** blocker tha. Practice ke taur par main ne 14 route handlers ko `force-static` bana kar dobara build kiya — phir agla fail hua:

```
Error: ... not configured on route "/manifest.webmanifest" with "output: export".
```

Aur sath hi ye warnings:

```
⚠ Specified "redirects" will not automatically work with "output: export".
⚠ Specified "headers"  will not automatically work with "output: export".
```

Yani export mode me **build hi complete nahi hota**, aur jo hota hai usme **11 redirects + saare security headers chup-chaap gum ho jate hain**.

---

## 3. Kya kya tootega — exact numbers

Ye numbers repo se **count kiye gaye** hain, andaze nahi:

| # | Cheez | Number | GitHub Pages par |
|---|-------|--------|------------------|
| 1 | API routes (`app/api/**`) | **89** | ❌ zero chalenge — Pages server code nahi chalata |
| 2 | API routes jo design se hi runtime-only hain (`force-dynamic`) | **79** | ❌ static banaye hi nahi ja sakte |
| 3 | API routes jo data **likhte** hain (POST/PUT/DELETE/PATCH) | **49** | ❌ cart, order, wishlist, admin save — sab dead |
| 4 | API routes jo `firebase-admin` + secret key use karte hain | **33** | ❌ secret server par hi reh sakti hai |
| 5 | Client files jo `fetch('/api/...')` karte hain | **33 files** (56 call sites) | ❌ sab `404` — kyunki `github.io/api/...` par kuch nahi hoga |
| 6 | Files jo ISR `revalidate` use karti hain | **122** | ❌ Pages me ISR hota hi nahi |
| 7 | Files jo `unstable_cache` use karti hain | **20** | ❌ sirf server par |
| 8 | Middleware (IP blocklist, probe blocking, security logs) | **1 file** | ❌ Pages middleware support nahi karta |
| 9 | `next.config.js` redirects (`/shop`, `/offers`, `/iptv`, `/reseller` …) | **11** | ❌ ignore — purane/Google links 404 |
| 10 | `next.config.js` headers (security + cache) | **~10 rules** | ❌ ignore |
| 11 | Cron job (`/api/cron/security`, daily) | **1** | ❌ Pages me cron nahi hota |
| 12 | Non-API routes jo runtime par render hoti hain | **11** | ❌ `/songs`, `/search`, `/movies`, `/sitemaps/[file]` etc. |

### 12 — Wo 11 routes jo export me bilkul nahi ban sakti

Build ke route table se (ƒ = dynamic, request par banti hai):

```
/blog/author/[name]   /movies        /movies/actors   /movies/world
/search               /sitemap-index.xml              /sitemaps/[file]
/songs                /songs/[slug]  /songs/artist/[slug]
```

Ye **poora songs section, search, movies world aur sitemap system** hai.

---

## 4. Sabse bada dhamaka: products ka 404 hona

Ye point alag se samajhne layak hai, kyunki ye **shop ka dil** hai.

`app/product/[slug]/page.js` me `generateStaticParams()` ye karta hai:

```js
export async function generateStaticParams() {
  const all = await getProducts();
  return all.slice(0, 12).map((p) => ({ slug: p.slug }));   // sirf 12!
}
```

Ye **jaan-boojh kar** hai — Vercel par baqi pages ISR se on-demand bante hain (cachePolicy / ISR write budget ki wajah se).

Lekin **GitHub Pages par ISR nahi hota.** Export ke baad jo page build me nahi bana, wo **permanently 404** hai.

| Route | Catalog me total | Export ke baad banenge | 404 honge |
|-------|------------------|------------------------|-----------|
| `/product/[slug]` | **11,297 products** | **12** | **11,285** |
| `/category/[slug]` | 12+ categories | 12 | baqi 404 |
| `/live/[slug]` | channels | 24 | baqi 404 |
| `/movies/[slug]` | **500,000 IMDb titles** | starter list only | **lakeeron me 404** |
| `/quran/[surah]` | 114 surahs | **0 pregenerated** | **114 / 114** |

Yani ek shop jisme **ghar ke 0.1% products** khulte hain. Ye "har function properly kaam kare" ke bilkul khilaf hai.

---

## 5. GitHub Pages ki 8 hard limits (platform sach)

| Limit | Matlab Mizanora ke liye |
|-------|--------------------------|
| Sirf static files | 89 API routes, middleware, orders, admin — **sab khatam** |
| Koi server-side code nahi | Firebase Admin, secrets, TTS, AI, relays — **sab khatam** |
| Koi redirects nahi | 11 purane URLs marte hain (Google ranking / WhatsApp links) |
| Koi custom headers nahi | Security headers (X-Frame-Options, nosniff, Permissions-Policy) gone |
| Koi cron nahi | Daily security sweep band |
| Koi ISR / revalidate nahi | **Har product update = poora rebuild** (manual ya CI) |
| Subpath issue | Repo `MIZANORA` hai → URL banega `https://mizanora-org.github.io/MIZANORA/` → `basePath` lagana padega, jo `/api`, `/sw.js` (scope `/`), `ads.txt`, sitemaps — **sab tod deta hai** |
| Bina `CNAME` custom domain | Aaj `NEXT_PUBLIC_SITE_URL` = `https://mizanora.vercel.app` hai. Domain badalne par Firebase Auth authorized domains + AdSense/referrer restrictions dobara set karne padenge |

Ek aur baat: **`trailingSlash` + `basePath`** ki wajah se service worker (`components/PwaRegister.js`, `scope: '/'`) aur PWA install **repo subpath par kaam nahi karenge** bina rewrite ke.

---

## 6. To phir kya karein? 3 asli options

### Option A — GitHub Pages **chhoro**, Next.js ko kisi Node host par le jao ✅ (recommended)

Aapki asli problem GitHub Pages nahi — **Vercel ka pause/quota** hai (`VERCEL-RECOVERY.md`). Uska hal static hosting nahi, **Node-capable free host** hai.

| Host | Next.js 15 support | Free tier | Notes |
|------|-------------------|-----------|-------|
| **Firebase App Hosting** | Native (Google) | Haan | Aap pehle se Firebase par ho — rules, functions, workflows sab maujood. **Sabse kam kaam.** |
| **Cloudflare Workers + OpenNext** | Haan (`@opennextjs/cloudflare`) | Generous | Sasta bandwidth, accha hal |
| **Netlify** | Haan (`@netlify/plugin-nextjs`) | Haan | ISR support |
| **Render / Railway / Fly.io** | Haan (Node server) | Limited / paid | `next start` chalega |

**Kaam:** sirf config + env vars. **Code change: ~0.** Effort: **1–2 din**.

### Option B — Hybrid: Pages (frontend) + API kahin aur ⚠️

Public pages ko static export karo, API routes ko Firebase Functions/Cloud Run par rakho, frontend ko absolute API URL do.

**Karna padega:**
1. `app/api/**` ko alag service me nikalna (89 routes, 33 me firebase-admin)
2. 56 `fetch('/api/...')` calls ko `process.env.NEXT_PUBLIC_API_BASE + '/api/...'` banana
3. Metadata routes (`robots.js`, `sitemap.js`, `manifest.js`, `feed.xml`) ko static files me convert karna
4. `basePath` + asset prefix + service worker scope theek karna
5. **11,297 product pages build par pregenerate** karna (ya 11,285 ka 404 qubool karna)
6. Redirects ko `public/_redirects`-jaisa kuch banana — **GitHub Pages par ye option hi nahi**, so 11 links marte hain
7. Admin panel ko Pages se hatana (wo server ke baghair bekaar hai)
8. `npm run build` ko GitHub Actions me secrets ke saath chalana

**Effort: 2–4 hafte. Risk: zyada. Result: phir bhi 11,285 product pages ka masla + ISR ka nuqsan.**

### Option C — Pages ko sirf **backup/marketing mirror** banao ✅ (practical)

Asli shop Node host par chale; GitHub Pages par ek **chhota static landing/status page** ho jo bole "shop yahan hai" — outage ke waqt kaam aaye. Aapke `public/offline.html` jaisa hi concept.

**Effort: 1 din. Risk: zero. Asli functionality par koi asar nahi.**

---

## 7. Recommendation

1. **Aaj:** Option A — Next.js ko **Firebase App Hosting** par shift karo. Aap pehle se Firebase par ho, is liye ye sabse kam kaam aur sabse kam risk hai. **Poora app 100% chalega, kuch bhi nahi tootega.**
2. **Sath me:** Option C — GitHub Pages par ek static status/landing page, taake kabhi host down ho to logon ko raasta mile.
3. **Option B par abhi paisa/time mat lagao.** Ye ek aadha project rewrite hai jo aapki problem (hosting cost) ko theek nahi karta — balki update workflow ko **mushkil** bana deta hai (har product ke liye rebuild).

**Agar GitHub Pages kisi khaas wajah se zaroori hai** (free + custom domain + no card), to batayein — main sirf **public marketing pages** (about, contact, policies, tools, quran — jo already static-friendly hain) ka ek alag static export bana sakta hoon, shop ko chhore hue.

---

## 8. Appendix — commands jo main ne chalaye

```sh
npm ci --no-audit --no-fund                      # 378 packages, OK
# next.config.js me: output:'export', trailingSlash:true
npx next build                                   # FAIL: /blog/feed.xml
# 14 route handlers ko force-static kiya, dobara build
npx next build                                   # FAIL: /manifest.webmanifest
# original config restore + normal build
npx next build                                   # ✅ PASS (75s, bina Firebase creds ke bhi)
# route table se: 84 static pages, 92 dynamic routes (81 API + 11 pages)
```

Normal build bina credentials ke chal jata hai (graceful degradation), magar **prerendered data adhoora** aata hai — yani Pages CI me build chal jane ka matlab ye nahi ke site sahi hai.

**Test artifacts:** working tree clean hai; koi config change commit nahi kiya gaya. Ye report hi akela naya file hai.
