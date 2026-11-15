# Sab kuch Cloudflare par — plan + API token guide

**Date:** 2026-11-15 · Repo: `Mizanora-org/MIZANORA` @ `69ec816`

---

## 1. Pehle ek zaroori baat (maine test ki)

Aap chahte hain ke **main sab kaam karoon**. Iske liye ek rukawat hai jo aap ko pata honi chahiye:

```
https://api.cloudflare.com/client/v4/   →  000  BLOCKED
https://dash.cloudflare.com/             →  000  BLOCKED
https://api.github.com/                  →  200  ✅
https://registry.npmjs.org/              →  200  ✅
```

**Mera sandbox Cloudflare tak pahunch hi nahi sakta.** Yani agar aap mujhe token dein bhi dein, main `wrangler deploy` **chala nahi sakta** — network hi band hai.

**Iska hal (aur ye behtar bhi hai):** deploy **GitHub Actions** se hoga.
- Token **GitHub ke secret** me rahega — chat me, code me, repo me **kabhi nahi**
- Actions ke paas poora internet hai, wo Cloudflare par deploy kar dega
- Main workflow likh deta hoon; aap sirf token paste karte hain (GitHub me)
- Push karte hi deploy khud chalta rahega — **permanent automation**

> ⚠️ **Token mujhe chat me kabhi na bhejein.** Na main use kar sakta hoon, na chat secret rakhne ki jagah hai. Sirf GitHub → Settings → Secrets me daalein.

---

## 2. API token kaise lein (step by step)

### 2.1 Token banayein

1. **dash.cloudflare.com** → login
2. Top-right profile icon → **My Profile**
3. Left menu → **API Tokens**
4. **Create Token**
5. Sabse aasan: **"Edit Cloudflare Workers"** template → **Use template**
   - (Ye Workers deploy, KV, aur routes ke liye kaafi hai)
6. Permissions check karein:

   | Scope | Permission | Kyun |
   |-------|-----------|------|
   | Account · **Workers Scripts** | **Edit** | Worker deploy karne ke liye |
   | Account · **Workers KV Storage** | Edit | Phase 3 (ISR cache) me |
   | Account · **Account Settings** | Read | Account verify |
   | Zone · **Workers Routes** | Edit | `/api/img*` routes jorne ke liye |
   | Zone · **Cache Rules** | Edit | Phase 2 (CDN) me |

7. **Zone Resources:** Include → **All zones** (ya sirf apna domain)
8. **Continue → Create Token**
9. Token **sirf ek dafa** dikhta hai — **kisi safe jagah copy** karein (password manager)

### 2.2 Account ID

- dash.cloudflare.com → **Workers & Pages** → right sidebar me **Account ID**
- Ya URL me: `dash.cloudflare.com/**<account-id>**/workers`

### 2.3 GitHub me daalein (yahan, chat me nahi)

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | (2.1 ka token) |
| `CLOUDFLARE_ACCOUNT_ID` | (2.2 ki id) |
| `TV_PROXY_SECRET` | *optional* — app ke `TV_PROXY_SECRET` jaisa hi (TV relay signatures ke liye) |

### 2.4 Deploy

Secrets daalne ke baad:
- Repo → **Actions** → **Deploy to Cloudflare** → **Run workflow**, ya
- `git push` (jab `workers/` me change ho)

Token na ho to workflow **fail nahi hota** — sirf skip hota hai.

---

## 3. "Sab Cloudflare par" — sach aur phases

Aap chahte hain sab pehle Cloudflare par. Ye **mumkin hai**, magar ek hi qadam me nahi. Aapke app me 3 cheezein Cloudflare ke raste me hain (numbers pichli report se):

| Rukawat | Kitni badi |
|---------|-----------|
| `data/catalog` **42 MB** disk se padha jata hai | Badi — koi fs nahi |
| `firebase-admin` **33 API routes** (gRPC) | Badi — Workers par chalta hi nahi |
| Free tier **10 ms CPU** (SSR ke liye kam) | Chhoti — $5 paid par hal |

### Phase 0 — Media Worker ⭐ (aaj mumkin, $0)

- 4 heavy relays Cloudflare par (images, posters, songs, TV)
- **Code ready + tested** — `workers/media-proxy/`, 24/24 pass
- Setup: secrets → workflow chala dein
- **Faida:** origin ka media transfer **zero**

### Phase 1 — Domain + routes (1 din, $0, ZERO code change)

- Domain Cloudflare par (nameservers)
- 4 routes jorein → media origin tak pahunchega hi nahi
- **Faida:** bandwidth bill ~zero, Vercel/host ka pause khatam

### Phase 2 — Poore site ke aage Cloudflare (2-3 din, $0)

- Orange cloud + Cache Rules
- `/admin*, /api*, /account*, /cart*, /checkout*, /track*, /worker*` bypass
- **Faida:** HTML/JS bhi edge se — origin transfer phir kam

### Phase 3 — API Workers par (2–4 hafte, $5/mo) — **asli kaam**

Har blocker ka Cloudflare-native hal:

| Ab | Karna padega |
|----|--------------|
| `firebase-admin` (33 routes) | **Firestore REST** + WebCrypto JWT verify. Aapke paas `lib/firestore-rest.js` **pehle se hai** |
| `data/catalog` 42 MB (fs) | **D1** (SQLite) ya R2 me daalein, query-based access |
| 165 blog `.md` (fs) | Bundle imports ya R2 |
| `node:net` (`isIP`, `BlockList`) | Chhota polyfill (maine count kiya: 15 calls) |
| ISR (122 files) | OpenNext + R2 incremental cache |
| 10 ms CPU | Workers **Paid** ($5) — 30 s default |

### Phase 4 — Poora Next app OpenNext par ($5/mo)

Phase 3 ke baad `@opennextjs/cloudflare` se poora app Workers par. Bundle **4.1 MB gzip** hai, 64 MiB limit me aaram se.

---

## 4. Shortcut chahiye? Cloudflare Containers

Agar aap **abhi, bina rewrite** poora app Cloudflare par chahte hain:

- **Cloudflare Containers** aapka `Dockerfile` jaisa hai waisa chalata hai (wo main bana chuka hoon)
- Workers **Paid $5/mo** lazmi
- App **1:1** chalega — APIs, admin, firebase-admin, ISR, sab
- **Magar:** container egress **$0.045/GB** hai (Workers par free hai) — is liye media **phir bhi** Worker par rakhein

| Setup | Kharcha | Kaam | App |
|-------|---------|------|-----|
| Phase 0+1+2 (ab) | **$0** | 1 din | Jahan hai wahan |
| + Containers | ~$8–20/mo | +1 din | **100% Cloudflare** |
| Phase 3+4 (rewrite) | **$5/mo** | 2–4 hafte | 100% Cloudflare, serverless |

**Mera mashwara:** Phase 0 → 1 → 2 aaj kar lein (free, bada faida). Phir faisla: Containers (paisa, foran) ya Phase 3+4 (waqt, sasta).

---

## 5. Mujhe kya chahiye (checklist)

| # | Cheez | Kahan |
|---|-------|-------|
| 1 | Cloudflare account | aap banayein |
| 2 | `CLOUDFLARE_API_TOKEN` | GitHub → Secrets |
| 3 | `CLOUDFLARE_ACCOUNT_ID` | GitHub → Secrets |
| 4 | `TV_PROXY_SECRET` (optional) | GitHub → Secrets |
| 5 | Domain (Phase 1 ke liye) | ~PKR 3–4k/saal |
| 6 | Workers Paid $5 (Phase 3/4 ya Containers) | Cloudflare billing |

**Baaki sab main likh doonga** — Worker (ho gaya), workflows, config, aur migration ke code changes.

---

## 6. Files jo is kaam ke liye add hui

| File | Kaam |
|------|------|
| `workers/media-proxy/index.js` | 4 relays ka Worker (24/24 tests pass) |
| `workers/media-proxy/wrangler.toml` | Deploy config + routes |
| `.github/workflows/deploy-cloudflare.yml` | **Actions se Cloudflare deploy** (token secret me) |
| `docs/CLOUDFLARE-JUGAD.md` | Cloudflare ke numbers aur faisla |
| `docs/CLOUDFLARE-MIGRATION-PLAN.md` | Yehi document |
| `Dockerfile` | Containers / VPS ke liye (app as-is) |

---

## 7. Ek imaandar warning

Maine Worker ko Node me **24 tests** se verify kiya (`Request`/`Response`/`fetch`/`crypto.subtle` bilkul Workers jaise). Magar **asli Workers runtime par deploy main nahi kar sakta** (network block). Pehli deploy par ye check karein:

```
https://mizanora-media.<subdomain>.workers.dev/healthz        → "ok"
https://mizanora-media.<subdomain>.workers.dev/api/poster/tt1375666  → poster image
```

Agar `healthz` chala to router theek hai; poster chala to outbound fetch theek hai.
