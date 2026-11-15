# syntax=docker/dockerfile:1
#
# MIZANORA — ek hi image, har free host par chalti hai.
#
#   Oracle Cloud Always Free VM   → docker compose up -d
#   Koyeb / Northflank / Fly.io   → repo connect, bas
#   Google Cloud Run              → gcloud run deploy --source .
#   Apna VPS                      → docker run -p 80:3000
#
# Kyun Docker? Ye app `next start` par chalta hai (Node server), is liye
# APIs, middleware, ISR, firebase-admin, streaming — SAB kaam karte hain.
# Sirf `data/`, `content/`, `public/` image ke andar hona lazmi hai, kyunki
# app runtime par inse files parhti hai (catalog, blog, imdb seed).

########## 1. dependencies (build ke liye, devDeps ke sath) ##########
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

########## 2. build ##########
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ⚠️ AHEM: NEXT_PUBLIC_* values BUILD ke waqt JavaScript me "bake" hoti hain.
# Sirf runtime env dena kaafi NAHI hai — inhe build ARG ke taur par pass karein,
# warna browser wali Firebase config khaali aa jayegi aur admin/account login tootega.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WHATSAPP_NUMBER
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_ADMIN_EMAIL
ARG NEXT_PUBLIC_SHIPPING_FEE
ARG NEXT_PUBLIC_FREE_SHIPPING_OVER
ARG NEXT_PUBLIC_ANNOUNCEMENT
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_TV_RELAY
ARG NEXT_PUBLIC_IMAGE_RELAY
ARG NEXT_PUBLIC_IMAGE_RELAY_HOSTS
ARG NEXT_PUBLIC_SONGS_DIRECT
ARG NEXT_PUBLIC_MEDIA_BASE
ARG NEXT_PUBLIC_SEASON_THEME
ARG NEXT_PUBLIC_HIJRI_OFFSET
ARG NEXT_PUBLIC_PREPAID_PERCENT
ARG NEXT_PUBLIC_GSC_VERIFICATION

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_ADMIN_EMAIL=$NEXT_PUBLIC_ADMIN_EMAIL \
    NEXT_PUBLIC_SHIPPING_FEE=$NEXT_PUBLIC_SHIPPING_FEE \
    NEXT_PUBLIC_FREE_SHIPPING_OVER=$NEXT_PUBLIC_FREE_SHIPPING_OVER \
    NEXT_PUBLIC_ANNOUNCEMENT=$NEXT_PUBLIC_ANNOUNCEMENT \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_PUBLIC_TV_RELAY=$NEXT_PUBLIC_TV_RELAY \
    NEXT_PUBLIC_IMAGE_RELAY=$NEXT_PUBLIC_IMAGE_RELAY \
    NEXT_PUBLIC_IMAGE_RELAY_HOSTS=$NEXT_PUBLIC_IMAGE_RELAY_HOSTS \
    NEXT_PUBLIC_SONGS_DIRECT=$NEXT_PUBLIC_SONGS_DIRECT \
    NEXT_PUBLIC_MEDIA_BASE=$NEXT_PUBLIC_MEDIA_BASE \
    NEXT_PUBLIC_SEASON_THEME=$NEXT_PUBLIC_SEASON_THEME \
    NEXT_PUBLIC_HIJRI_OFFSET=$NEXT_PUBLIC_HIJRI_OFFSET \
    NEXT_PUBLIC_PREPAID_PERCENT=$NEXT_PUBLIC_PREPAID_PERCENT \
    NEXT_PUBLIC_GSC_VERIFICATION=$NEXT_PUBLIC_GSC_VERIFICATION

RUN npm run build

########## 3. sirf production dependencies (image chhoti rahe) ##########
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

########## 4. runner ##########
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder  --chown=nextjs:nodejs /app/.next       ./.next
COPY --from=builder  --chown=nextjs:nodejs /app/public      ./public
# Ye teen runtime par disk se parhe jate hain (fs.readFile) — inke baghair
# catalog khaali aayega aur /api/health me totalProducts 0 dikhega.
COPY --from=builder  --chown=nextjs:nodejs /app/data        ./data
COPY --from=builder  --chown=nextjs:nodejs /app/content     ./content
COPY --from=builder  --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder  --chown=nextjs:nodejs /app/next.config.js ./next.config.js
COPY --from=builder  --chown=nextjs:nodejs /app/jsconfig.json ./jsconfig.json

USER nextjs
EXPOSE 3000

# Platform khud health check karta hai (Render/Koyeb/Cloud Run par useful).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

# PORT ko host decide karta hai (Cloud Run 8080 bhejta hai, Render apna).
CMD ["sh", "-c", "npx next start -p ${PORT:-3000} -H 0.0.0.0"]
