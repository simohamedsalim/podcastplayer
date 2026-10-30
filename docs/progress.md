# Rawi web – progress log

Legend: ✅ observed result · 🟡 written + type-checked, not exercised in a real browser · ⛔ blocked

## Environment (2026-10-29)
Sandbox Ubuntu 24.04, Node 22.22.2, npm reachable; no browser installed; outbound network limited (Apple endpoints, podcast CDNs, Vercel unreachable). So the UI could not be driven in a browser and discovery/feeds could not be fetched live.

## Decisions
- Next.js 16.4.3 App Router + Tailwind 4, client-side IndexedDB library, server route handlers only for what browsers cannot do (feed fetch, discovery, audio fallback).
- Audio: one HTMLAudioElement + Media Session API; queue/progress persisted in IndexedDB.
- Reused from the Android project: RSS parser (+tests), discovery mappers, countries, icon design.
- Supabase sync deferred for web. `maxDuration` 60 s so deployment is accepted on any plan.

## Verified
- ✅ `tsc --noEmit` strict: 0 errors.
- ✅ vitest 49/49 (RSS parser 7, OPML 3, SSRF + feed + audio proxy 36, IndexedDB library flow 3 via fake-indexeddb).
- ✅ `next build` succeeds (13 routes).
- ✅ `next start`: all pages 200; manifest, sw.js (no-cache), icons served; security headers present; SSRF attempts (metadata IP, localhost, file://, other port) return 400 over real HTTP; bad params return 400.

## Not verified (needs a real browser/network)
1. Audio playback, Media Session notification/lock screen, Bluetooth buttons, interruptions.
2. IndexedDB flows in a real browser (subscribe, queue, progress, downloads).
3. Apple discovery endpoints and real feeds through `/api/feed`.
4. Service worker install/offline shell, PWA install prompt.
5. Deployment on Vercel.

## Fix 2026-10-30
- Bug found by the new IndexedDB tests: inserting a new episode used `id: undefined`, which IndexedDB rejects (DataError), so every first subscription failed. Fixed (key omitted for new rows).
