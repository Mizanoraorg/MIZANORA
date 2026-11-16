# $0 plan — koi paisa nahi, koi card nahi, koi domain nahi

**Date:** 2026-11-15 · Repo: `Mizanora-org/MIZANORA` @ `69ec816`

---

## 1. Stack — sab kuch zero

| Hissa | Kya use hoga | Card? | Paisa? |
|-------|--------------|-------|--------|
| **App (Next.js server)** | **Render Free** (ya Netlify Free) | ❌ | **$0** |
| **Bhari media** (photos, posters, songs) | **Cloudflare Workers Free** (`*.workers.dev`) | ❌ | **$0** |
| **Data** (products, orders, users) | **Firebase Spark** (aapka maujood) | ❌ | **$0** |
| **Deploy + cron** | **GitHub Actions** (public repo = unlimited) | ❌ | **$0** |
| **Domain** | **Nahi chahiye** — `onrender.com` + `workers.dev` | ❌ | **$0** |
| **TV relay** | Band (`NEXT_PUBLIC_TV_RELAY=off`) | — | **$0** |

**Total: $0/mahina. Koi card nahi. Koi domain nahi. Koi token lazmi nahi.**

---

## 2. Pehla kaam: Vercel unpause try karein (free, 5 minute)

Vercel Hobby aapke paas **pehle se** hai — **100 GB bandwidth**, Node functions, ISR — Render/Netlify ke free tier se **behtar**.

To sabse pehla qadam naya host nahi, balki:

1. `.env` me ye 3 switches lagayein (bandwidth 10–50x kam):
   ```
   NEXT_PUBLIC_TV_RELAY=off
   NEXT_PUBLIC_IMAGE_RELAY=off
   NEXT_PUBLIC_SONGS_DIRECT=1
   ```
2. Redeploy karein
3. Vercel support se **fair-use unpause** request karein

Agar Vercel wapas chal pada → **aapko kuch aur nahi chahiye**. Neeche wala plan backup hai.

---

## 3. Code changes — main ne pehle hi kar diye

Aapko kuch code likhna nahi hai. Ye ho chuka hai:

| File | Kya hua |
|------|---------|
| `lib/mediaBase.js` | **Naya.** `NEXT_PUBLIC_MEDIA_BASE` set ho to media Cloudflare Worker se jaye |
| `lib/imgFallback.js` | `proxyImage()` ab `mediaUrl()` use karta hai |
| `lib/songs.js` | `cdnProxy()` ab `mediaUrl()` use karta hai |
| `lib/movies.js` | `posterSrc` / `backdropSrc` ab `mediaUrl()` use karte hain |
| `lib/config.js` | **Bug fix**: `absUrl()` absolute URLs ko prefix karna band kar diya |
| `.env.example` / `render.yaml` / `Dockerfile` / `docker-compose.yml` | `NEXT_PUBLIC_MEDIA_BASE` add |

> **Sabse ahem:** env var **khaali** ho to sab kuch **bilkul pehle jaisa** chalta hai. Main ne dono modes test kiye.
>
> **Bonus bug fix:** `absUrl('https://image.tmdb.org/x.jpg')` pehle `https://site.com/https://image...` bana raha tha — movie pages ka OG image isi wajah se toota hua tha. Ab theek hai.

---

## 4. Step-by-step ($0)

### Step 1 — Cloudflare Worker (dashboard se, bina token)

Sabse aasan tareeqa:

1. **dash.cloudflare.com** → sign up (free, no card)
2. **Workers & Pages** → **Create** → **Worker** → naam `mizanora-media`
3. **Edit code** → `workers/media-proxy/index.js` ka poora content paste karein
4. Right side **Settings → Variables** me:
   ```
   NEXT_PUBLIC_TV_RELAY = off
   ```
5. **Deploy**
6. Apna URL note karein: `https://mizanora-media.YOUR-SUBDOMAIN.workers.dev`
7. Test: `<URL>/healthz` → `ok` dikhna chahiye

**Token / GitHub Actions chahiye?** Sirf tab jab aap chahte hain ke `workers/` me change karne par khud deploy ho. Warna dashboard ka paste-deploy kaafi hai.

### Step 2 — Render par app (bina card)

1. **render.com** → sign up (no card)
2. **New → Blueprint** → repo `Mizanora-org/MIZANORA` → `render.yaml` khud parh lega
3. Dashboard me env vars bharein (jo `sync: false` hain):
   ```
   NEXT_PUBLIC_SITE_URL            = https://<app>.onrender.com
   NEXT_PUBLIC_MEDIA_BASE          = https://mizanora-media.YOUR-SUBDOMAIN.workers.dev
   NEXT_PUBLIC_TV_RELAY            = off
   NEXT_PUBLIC_IMAGE_RELAY         = off
   NEXT_PUBLIC_SONGS_DIRECT        = 1
   MOVIES_SITEMAP_LIMIT            = 20000
   NEXT_PUBLIC_FIREBASE_*          = (aapke Firebase web config values)
   FIREBASE_SERVICE_ACCOUNT        = (service account JSON)
   ```
4. **Deploy**

### Step 3 — Keepalive (app ko sota nahi)

Repo → Settings → Variables → Actions → `SITE_URL` = `https://<app>.onrender.com`

`.github/workflows/keepalive.yml` har 10 minute app ko jaga dega. (Maine ise `/robots.txt` par rakha hai, `/api/health` par **nahi** — wo Firestore me write karta hai aur aapka free quota kha jata hai.)

### Step 4 — Firebase

- **Authentication → Settings → Authorized domains** → `<app>.onrender.com` add karein
- Warna admin login `auth/unauthorized-domain` dega

---

## 5. Bandwidth ka hisaab (kyun 5 GB kaafi hai)

| Cheez | Kahan se | Kitna |
|-------|----------|-------|
| Homepage (gzip, measured) | Render | **102 KB** |
| + JS/CSS (pehli visit) | Render | ~150 KB |
| Photos, posters | **Cloudflare** | 0 |
| Songs | **Cloudflare** | 0 |
| TV | **band** | 0 |

**Render ka 5 GB ≈ 20,000 pehli visits/mahina** (~50,000 page views, cache ke baad).
Cloudflare ka egress **unlimited** hai, is liye media kabhi khatam nahi hoga.

---

## 6. Sacchai — jo kaam nahi karega

Kuch cheezein free plan par **nahi** milengi. Pehle se jaan lein:

| Cheez | Halat | Kyun |
|-------|-------|------|
| **Live TV relay** | ❌ band | Free Worker 100k req/din; 1 viewer ≈ 900 req/ghanta |
| Cold start | ⚠️ pehla visitor 30–60s | Render free 15 min baad sota hai (keepalive kam karta hai) |
| Media Cloudflare se | ✅ lekin URL `workers.dev` ka | Domain nahi hai (users ko nazar nahi aata) |
| `workers.dev` block | ⚠️ kabhi kabhi ISP block karta | Images na dikhein to `NEXT_PUBLIC_MEDIA_BASE` khaali kar dein |
| Admin panel / orders | ✅ chalega | Render par poora Node chalta hai |
| ISR | ⚠️ per-instance | Server restart par cache khaali |
| Firebase Spark | 50k reads/din | Zyada traffic par Blaze |

---

## 7. Aaj ka order (yehi tareeqa)

```
1. Vercel par relay switches lagayein + unpause request     (5 min, $0)
2. Cloudflare Worker dashboard se deploy karein             (10 min, $0)
3. Render par app chalayein + env vars                      (20 min, $0)
4. SITE_URL variable set karein (keepalive)                 (2 min, $0)
5. Firebase authorized domain add karein                    (2 min, $0)
6. Test: /api/health → totalProducts 11297
```

Agar step 1 kaam kar gaya (Vercel wapas aa gaya) → **2 aur 3 chhore dein**, baqi sab waisa hi.

---

## 8. Verification (main ne jo test kiya)

| Test | Nateeja |
|------|---------|
| `npm run check` (unka CI) | ✅ 0 problems |
| `next build` | ✅ Compiled successfully |
| `NEXT_PUBLIC_MEDIA_BASE` khaali | ✅ bilkul pehle jaisa |
| `NEXT_PUBLIC_MEDIA_BASE` set | ✅ sirf `/api/*` Cloudflare par, baqi nahi |
| `isProxyUrl()` self-detection | ✅ loops nahi |
| `absUrl()` absolute passthrough | ✅ bug fix verified |
| Worker (24 tests) | ✅ 24/24 |

**Note:** `scripts/test-v54.mjs` **pehle se fail** hai (original code par bhi) — wo `lib/cinemeta.js` ke extension-less import ki wajah se hai, is kaam se related nahi.

---

## 9. Files ki poori list

| File | Kaam |
|------|------|
| `lib/mediaBase.js` | media base (naya) |
| `lib/imgFallback.js` · `lib/songs.js` · `lib/movies.js` · `lib/config.js` | patched |
| `workers/media-proxy/index.js` + `wrangler.toml` | Cloudflare Worker |
| `render.yaml` | Render free blueprint |
| `Dockerfile` · `docker-compose.yml` · `deploy/Caddyfile` | agar VPS mile to |
| `.github/workflows/keepalive.yml` | Render sleep + 60-din trap |
| `.github/workflows/deploy-cloudflare.yml` | optional auto-deploy (token ho to) |
| `docs/FREE-ZERO-RUPEE-PLAN.md` | yehi document |

---

## 10. "Cloudflare + GitHub Actions" akela — 100% free ho sakta hai?

**Chhota jawab:** bandwidth, media, deploy, cron, images — **sab pehle se 100% free hai**. Magar **Next.js ka server** Cloudflare ke free plan par nahi chalta. Neeche exact numbers hain.

### Jo Cloudflare + Actions par pehle se 100% FREE hai

| Cheez | Free limit | Kaafi hai? |
|-------|-----------|-----------|
| **Static files ke requests** | **Free aur UNLIMITED** (100k cap me ginte bhi nahi) | ✅ |
| Static file size | 25 MiB / file | ✅ |
| Media (images/posters/songs) | egress $0, lekin 100k req/din | ✅ chhote shop ke liye |
| Deploy (GitHub Actions) | Public repo par unlimited minutes | ✅ |
| Cron | 5 triggers/account, min 5 min | ✅ |
| R2 (agar zaroorat pade) | 10 GB, **zero egress**, 10M reads/mo | ✅ |

### Jo free plan par NAHI ho sakta — 5 asli rukawatein

| # | Rukawat | Number | Nateeja |
|---|---------|--------|---------|
| 1 | **SSR ka CPU** | free = **10 ms** / request | 1.27 MB homepage render 10 ms me nahi hota → **koi server-rendered page nahi** |
| 2 | **Static file count** | free = **20,000 files** | aapke build me har page = **3 files** (`.html` + `.meta` + `.rsc`). 11,297 products × 3 = **33,891** → **limit cross** |
| 3 | `firebase-admin` | **33 API routes** (gRPC) | Workers par chalta hi nahi → Firestore REST me rewrite |
| 4 | `data/catalog` | **42 MB** disk se | koi `fs` nahi → R2 ya D1 |
| 5 | Requests | **100,000 / din** | API + media share karte hain. 10 API calls/visit = 10,000 visits/din |

> **Rukawat #2 sabse ahem hai** — ye sirf code ka masla nahi, platform ki limit hai. Isi liye "bas rewrite kar lo" wala hal beech me atak jata hai.

### 100% free ke do raste

**Route A — ek aur free host (aaj, zero rewrite)** ⭐ *recommended*

```
GitHub Actions (build)  →  Render Free (Next.js server, $0, no card)
                        →  Cloudflare Worker (media, $0, unlimited egress)
                        →  Firebase Spark (data, $0)
```
- **Kharcha: $0** · **Kaam: 30 min** · **Rewrite: zero**
- Wajah: Cloudflare akela server nahi de sakta — Render de deta hai, muft.

**Route B — poora Cloudflare (3–6 hafte ka rewrite)**

Limits ke hisaab se ye **mumkin** hai, magar kaam bara hai:

| Karna padega | Kyun |
|---|---|
| Saare pages **pre-render** (build par), R2 me rakhein | 20k file limit + 10 ms CPU |
| Patla Worker jo R2 se page serve kare | R2 par file-count limit nahi; 100k req/din kaafi hai |
| 33 routes ko `firebase-admin` → **Firestore REST** | gRPC Workers par nahi chalta |
| 42 MB catalog → **R2 / D1** | koi `fs` nahi |
| Songs/movies/search ko **client-side** karein | SSR possible nahi |

Feasible hai — lekin **ye ek naya project hai**, config change nahi.

### Faisla

| Chahte hain | Rasta | Kharcha | Waqt |
|---|---|---|---|
| **$0, aaj, sab kuch chalta hua** | **Route A** (Render + Cloudflare) | **$0** | 30 min |
| $0, sab Cloudflare par | Route B (rewrite) | $0 | 3–6 hafte |
| $5/mo, sab Cloudflare par | Workers Paid + OpenNext | $5 | 2–4 hafte |

---

## 11. Platform scorecard — "ye free hai na?"

Har platform ke liye ek hi sawal: **kya ye Next.js ka server muft chala sakta hai?**
(nov 2026 ke official docs se verify kiya)

| Platform | Server (Node) muft? | Static? | Verdict |
|----------|--------------------|---------|---------|
| **Render Free** | ✅ haan (512 MB, 5 GB bandwidth, sleeps 15 min) | ✅ | ⭐ **iste kaam chal jata hai** |
| **Vercel Hobby** | ✅ haan (100 GB) — aapka account paused hai | ✅ | ⭐ best agar unpause ho |
| **Netlify Free** | ✅ haan (300 credits ≈ 15 GB) | ✅ | thik |
| **Cloudflare Workers Free** | ❌ (10 ms CPU, koi `fs` nahi) | ✅ **unlimited, $0** | media ke liye ⭐ |
| **Oracle Always Free** | ✅ haan (24 GB RAM, 10 TB) | ✅ | card chahiye (verify) |
| **GitHub Pages** | ❌ static only | ✅ 100 GB | ❌ 89 APIs mar jayengi |
| **Hugging Face Spaces** | ❌ **Docker Space = PRO $9/mo** | ✅ static free | ❌ neeche tafseel |

### Hugging Face Spaces — 2026 me kya badla

Official Hub docs (2026) ke alfaaz:

> "Static Spaces are free for everyone. **Gradio and Docker Spaces run on compute and require a paid plan to create**: PRO for personal accounts, Team or Enterprise for organizations."
>
> "Free personal accounts in good standing can still host up to **2 Gradio Spaces** running on ZeroGPU."

Yani Spaces ki "Create new Space" wali screen par jo SDK options dikhte hain, unka matlab:

| SDK | Kya karta hai | Mizanora ke liye |
|-----|---------------|------------------|
| **Static** | static files (build command bhi chal sakta hai — React/Svelte/Vue) | ❌ build ho jayega, magar **89 API routes mar jayengi** |
| **Gradio** | Python ML demo | ❌ bilkul fit nahi |
| **Docker** | koi bhi server — `next start` chal jata | ✅ chalega, **magar create karne ke liye PRO ($9/mo)** |

### Docker free hota bhi, to bhi 5 masle

| Masla | Asar |
|-------|------|
| **48 ghante** inactivity par sleep | pehli visit 30–90s |
| Disk **ephemeral** (50 GB) | restart par likha hua data **gum** |
| Space repo (git) ~**1 GB** | 42 MB data fit hai, magar bara nahi ho sakta |
| **Custom domain** = PRO | sirf `*.hf.space` |
| Free tier **public** by default | source + app sabko nazar |
| Platform **ML demos** ke liye bana hai | production shop ke liye nahi |

**Nateeja:** HF Spaces static-only hai (GitHub Pages jaisa), aur jo cheez kaam karegi (Docker) wo **$9/mo** hai. Ye aapke "sab $0" wale maqsad ke **khilaf** hai.

### Ek achi baat

Aapko HF ki zaroorat hi nahi — **media ka kaam Cloudflare Worker pehle se kar raha hai, $0 me**. HF sirf us jagah aata hai jahan Node server chahiye, aur wahan Render muft hai.
