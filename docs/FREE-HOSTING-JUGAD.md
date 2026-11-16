# Free hosting jugaad — aaj kya karein

**Date:** 2026-11-15 · Repo: `Mizanora-org/MIZANORA` @ `69ec816`

---

## 0. Pehle asli masla samajh lein

Aapko lagta hai masla "Vercel" hai. **Nahi.** Masla **bandwidth** hai.

Main ne aapka app as a plain Node server chala kar **asli** size measure kiye (gzip ke baad):

| Page | Size (gzip) |
|------|-------------|
| Homepage `/` | **102 KB** |
| `/products` | 35 KB |
| Product page | 18 KB |
| `/api/health` | 336 B |

Aur 2026 ke free tiers:

| Host | Bandwidth | Card? | Node app? | Sleep? |
|------|-----------|-------|-----------|--------|
| **Oracle Cloud Always Free** | **10 TB/mahina** | Verification ke liye | ✅ full | ❌ never |
| **Cloudflare Workers** | Unlimited | Nahi | ⚠️ code port chahiye | ❌ never |
| **GitHub Pages** | 100 GB | Nahi | ❌ static only | ❌ never |
| **Vercel Hobby** (aapka current) | 100 GB | Nahi | ✅ | ❌ never |
| **Netlify Free** | ~15 GB (300 credits) | Nahi | ✅ | ⚠️ |
| **Render Free** | **5 GB** | Nahi | ✅ | ✅ 15 min |

> **Ahem nateeja:** Render free ka 5 GB = sirf **~20,000 page views**. Netlify ka ~15 GB. Dono **Vercel Hobby ke 100 GB se kam** hain.
> Yani agar aap seedha Render/Netlify par chale gaye, to **halat behtar nahi, badtar** hogi.
>
> Isi liye **pehla qadam host badalna nahi — bandwidth kam karna hai.**

---

## 1. STEP 0 — Bandwidth ka ilaaj (5 minute, har plan me zaroori)

Aapke app me **pehle se switches maujood hain**. Ye media relays aapke origin se guzarte hain (`/api/tv/p`, `/api/img`, `/api/poster`, `/api/songs/cdn`) — aur **yahi aapka bandwidth khaate hain**, pages nahi.

Ye env vars set karein:

```env
NEXT_PUBLIC_TV_RELAY=off          # live TV relay band
NEXT_PUBLIC_IMAGE_RELAY=off       # image relay band (photos seedha source se)
NEXT_PUBLIC_SONGS_DIRECT=1        # songs seedha CDN se (default already 1)
MOVIES_SITEMAP_LIMIT=20000        # 500,000 titles ka sitemap chhota karein
```

**Asar:** bandwidth **10–50x kam**. Yehi switch Vercel ke apne `VERCEL-RECOVERY.md` me bhi emergency ke liye likha hua hai.

**Trade-off (sach):** jin streams ko relay lazmi chahiye wo nahi chalenge. Baqi sab chalta rahega.

### Agar aap Vercel par hi rehna chahein

Vercel Hobby ka **100 GB + Node functions + ISR + cron** — ye is app ke liye **free tier me sabse behtar** hai. Pause fair-use tha, permanent nahi.

1. Step 0 ke switches lagayein → usage 10-50x gir jayegi
2. Vercel dashboard → Usage se confirm karein
3. Support se unpause request karein (fair-use pause usually lift ho jata hai)

**Ye sabse sasta "jugaad" hai: $0, zero migration, zero risk.** Neeche wale plans tab chunein jab Vercel wakayi option na rahe.

---

## 2. PLAN A — Oracle Cloud Always Free ⭐ (best free, full app)

**Kyun yehi:** 4 ARM CPU, **24 GB RAM**, **10 TB egress/mahina**, hamesha on, koi sleep nahi, poora Node — yani **89 API routes, admin, firebase-admin, ISR, streaming — sab 100% chalega**. Koi code change nahi.

Ye **akela** free option hai jo aapke bandwidth ke qareeb bhi aata hai.

### Setup (~1–2 ghante)

1. **Account:** cloud.oracle.com → sign up → "Always Free" chunein.
   - Card **verification** ke liye maanga jata hai (~$1 hold, wapas). Always Free resources par charge **nahi** hota.
2. **VM banayein:** Compute → Instances → Create
   - Shape: **Ampere (ARM) · 2 OCPU · 12 GB** (Always Free allowance me)
   - Image: **Ubuntu 24.04**
   - SSH key download karein
3. **Ports kholein:** VCN → Security List → Ingress Rules → `80` aur `443` add karein
4. **Server par:**
   ```bash
   ssh ubuntu@<VM-IP>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker ubuntu && newgrp docker
   git clone https://github.com/Mizanora-org/MIZANORA.git && cd MIZANORA
   cp .env.example .env && nano .env          # asli values bharein + Step 0 switches
   DOMAIN=your-domain.com docker compose up -d --build
   ```
5. **HTTPS + domain:** DNS me `A` record VM IP par point karein. Caddy khud Let's Encrypt se certificate le lega — kuch nahi karna.
6. **Verify:** `https://your-domain.com/api/health` → `totalProducts: 11297` dikhna chahiye.

### Ahem warnings (sach)

- **Card chahiye** (verification). Card na ho to Plan B dekhein.
- ARM capacity kuch regions me "out of capacity" deti hai — dusra availability domain try karein.
- Oracle idle Always-Free instances ko reclaim kar sakta hai — traffic/usage natural rakhein.

### Auto-deploy (git push = live)

VM par ye script rakhein (`deploy.sh`) aur GitHub Actions se SSH karke chalayein:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/MIZANORA
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

Workflow snippet (`.github/workflows/deploy-vps.yml`) — SSH key ko repo secret `VPS_SSH_KEY` me rakhein:

```yaml
name: Deploy to VPS
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ubuntu
          key: ${{ secrets.VPS_SSH_KEY }}
          script: bash /home/ubuntu/MIZANORA/deploy.sh
```

---

## 3. PLAN B — Render Free (aaj, bina card, 5 minute)

**Kab chunein:** card nahi hai **aur** traffic kam hai (bandwidth ka masla nahi), ya sirf emergency mirror chahiye jab tak Vercel theek ho.

`render.yaml` repo me maujood hai — bas:
1. render.com → sign up (no card) → **New → Blueprint**
2. Repo `Mizanora-org/MIZANORA` chunein → Render `render.yaml` parh lega
3. `sync: false` wale env vars dashboard me bharein
4. Deploy

**Phir zaroor:** repo → Settings → Variables → `SITE_URL` = `https://<app>.onrender.com`
isse `.github/workflows/keepalive.yml` har 10 minute app ko jaga kar rakhega (warna 15 min me so jayega).

### Sacchai (ye zaroor janein)

| Limit | Aapke liye matlab |
|-------|-------------------|
| **5 GB bandwidth** | ~20,000 page views. Media relay **band karna lazmi** |
| 512 MB RAM | `next build` tight ho sakta hai — build fail ho to Docker runtime try karein |
| 15 min sleep | Pehla visitor 30-60s wait karega (keepalive ise kam karta hai) |
| 750 hours/mahina | Lagbhag poora mahina — theek hai |

---

## 4. PLAN C — Cloudflare (unlimited bandwidth, magar code kaam)

Cloudflare ka bandwidth free aur unlimited hai — **jahan tak bandwidth ka sawal hai, ye best hai**. Magar 2 rukawatein:

1. Workers free tier par **10 ms CPU per request** — 11,297 products wali SSR is limit me nahi aati
2. **`firebase-admin` Workers par chalta hi nahi** (gRPC/TCP aur Node `fs` support nahi). Aapke **33 API routes** isi par chalte hain, aur `data/catalog` disk se parhta hai

Iska matlab: 2–4 hafte ka port + `firestore-rest` par shift hona. **Aaj ka jugaad nahi hai.**

---

## 5. Environment variables — kaunsi BUILD par chahiye

Ye ghalti sabse zyada hoti hai. **`NEXT_PUBLIC_*` values build ke waqt JavaScript me bake ho jati hain.** Sirf runtime env dena kaafi nahi.

| Variable | Kab chahiye | Na ho to |
|----------|-------------|----------|
| `NEXT_PUBLIC_SITE_URL` | **BUILD** | Galat canonical/sitemap URLs |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_APP_ID` / `_DATABASE_URL` | **BUILD** | Admin login + account + wishlist sync **tootega** |
| `NEXT_PUBLIC_WHATSAPP_NUMBER`, `_SHIPPING_FEE`, `_ANNOUNCEMENT`, `_META_PIXEL_ID` | **BUILD** | Purani/default values bake ho jayengi |
| `NEXT_PUBLIC_TV_RELAY`, `_IMAGE_RELAY`, `_SONGS_DIRECT` | **BUILD** | Bandwidth switches kaam nahi karenge |
| `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | Runtime | Orders save nahi honge, admin API fail |
| `ADMIN_UID`, `IMGBB_API_KEY`, `GEMINI_API_KEY`, `META_CAPI_TOKEN`, `INDEXNOW_KEY` | Runtime | Wo features band |

`Dockerfile` me ye ARG/ENV ke taur par pehle se handle hain. Render native build me env vars build ke waqt khud maujood hote hain.

---

## 6. Domain badalne ke baad Firebase checklist

Naya domain aane par ye **bhoolna nahi**:

1. **Firebase Console → Authentication → Settings → Authorized domains** → naya domain add karein
   (warna admin login `auth/unauthorized-domain` dega)
2. Agar Google Cloud API key par **HTTP referrer restriction** hai → naya domain add karein
3. `NEXT_PUBLIC_SITE_URL` naye domain par set karein **aur rebuild** karein (build-time value hai)
4. AdSense / Meta Pixel / GSC verification dobara check karein

---

## 7. Deploy ke baad verify kaise karein

Main ne ye khud test kiya (local `next start` par):

```bash
curl -s https://<domain>/api/health
```

Sahi jawab aisa dikhna chahiye:

```json
{ "totalProducts": 11297, "productsVisibleOnSite": 11297, "ordersCanBeSaved": true }
```

- `totalProducts: 0` → `data/catalog` image ke andar nahi aaya (Dockerfile ka `COPY data`)
- `productsVisibleOnSite: 0` → Firebase web config build ke waqt nahi thi
- `ordersCanBeSaved: false` → `FIREBASE_SERVICE_ACCOUNT` / private key ka masla

Phir haath se test karein: **cart → checkout → order place → admin panel → product save**.

---

## 8. Jo files main ne add ki

| File | Kaam |
|------|------|
| `Dockerfile` | Ek image, har host par (Oracle, Koyeb, Cloud Run, VPS). `data/`, `content/`, `public/` included |
| `.dockerignore` | Image halki rakhta hai (`*.md` **jaan kar** exclude nahi — blog toot jata) |
| `docker-compose.yml` | App + Caddy (auto HTTPS) |
| `deploy/Caddyfile` | HTTPS, gzip, security headers |
| `render.yaml` | Render Blueprint (free, no card) |
| `.github/workflows/keepalive.yml` | Render sleep rokta hai + 60-din Actions trap |

**Note:** sandbox me Docker available nahi tha, is liye `Dockerfile` **build-test nahi hua**. App khud `next start` par test kiya — `/api/health` 200, `totalProducts: 11297`. Pehla `docker compose build` chalate waqt nazar rakhein.

---

## 9. Faisla — 30 second me

```
Card hai?  ── haan ──→  PLAN A: Oracle Always Free (10 TB, full app, 24/7)   ⭐
   │
   └─ nahi ──→  Traffic kam hai? ── haan ──→  PLAN B: Render free + keepalive
                        │
                        └─ nahi (media/blog heavy) ──→  Vercel par rahein,
                                                         Step 0 switches lagayein,
                                                         unpause request karein
```

**Sabse pehle:** Step 0 ke 4 env vars. Ye har surat me faida dete hain — chahe aap kisi bhi host par jayein.
