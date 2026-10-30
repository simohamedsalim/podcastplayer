# Rawi (web) – personal podcast player, installable as a PWA

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · IndexedDB (idb) · Zustand. No paid service required.

## Features
Subscribe by RSS URL · Discover: top podcasts for any country + search (Apple's free public endpoints, via server routes) · persistent Up-next queue · resume position · speed 0.8–3× · sleep timer · ±15/30 s · background playback with notification, lock-screen and headset/Bluetooth controls through the Media Session API · offline downloads (stored in the browser) · played/unplayed · OPML import/export (migrate from Pocket Casts) · installable PWA.

## Run
    npm install
    npm run dev          # http://localhost:3000
    npm test             # vitest (49 tests)
    npm run typecheck
    npm run build && npm start

## Deploy on Vercel (free Hobby plan, personal use)
1. Push this folder to a GitHub repo. 2. vercel.com → Add New Project → import it (framework auto-detected, no env vars). 3. Open the URL on your phone → browser menu → *Install app* / *Add to Home screen*.
Vercel's Hobby plan is for non-commercial use and has usage limits that can change; check current terms.

## Why server routes exist
Browsers cannot read most RSS feeds directly (CORS), so `/api/feed` fetches and parses them server-side (SSRF-guarded: public http(s) only, ports 80/443/8080/8443, every redirect re-validated, 20 MB cap). `/api/audio` is a streaming fallback used only when an enclosure cannot be played or downloaded directly (http on https, CORS). It uses your hosting bandwidth, so heavy use counts against free quotas, and a download through it is limited to 60 s of function time.

## Honest limits
- Library is stored per browser (IndexedDB). Clearing site data deletes it, so export OPML to back up. Cross-device sync (Supabase) is not in the web version yet.
- Browsers may evict storage under pressure; the app requests persistent storage but it is not guaranteed.
- iOS Safari: background/lock-screen behaviour is more restrictive than Android Chrome.
- Downloads are held in memory while in progress and stop if the tab is closed.
- No CSP header yet.
