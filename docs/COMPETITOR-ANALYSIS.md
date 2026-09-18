# Competitor Analysis — YouTube Downloader Market (2025/2026)

> **Goal:** build a website that beats every major competitor on **every axis that matters to a user**:
> quality, speed, features, trust, mobile UX, SEO and API access.
> This document is the *specification* that the implementation and the test-suite are derived from.

---

## 1. Who we are up against

| # | Competitor | Type | Notes |
|---|-----------|------|-------|
| 1 | **Y2Mate** | Web | Market leader, **shut down Oct 2025** (copyright violations). Ads, popups, malware-adjacent redirects. |
| 2 | **SaveFrom.net** | Web + extension | Huge multi-site support, **ad-heavy**, 1080p often broken, no merge-server. |
| 3 | **SSYouTube / ssyoutube** | URL shortcut | One-click, but 720p max, redirects, no audio extraction. |
| 4 | **YT1s / yt1s.com** | Web | Fast, but captcha walls, low quality options, no playlist. |
| 5 | **y2meta / ytmp3** | Web | MP3-focused, aggressive re-directs, fake "Download" buttons (ad traps). |
| 6 | **9xbuddy / ClipConverter** | Web | Multi-step converter, slow queues, breaks on new YouTube formats. |
| 7 | **SnapAny / SnapSave / SaveTube / VidsSave** | Web | Clean-ish, but 1080p+ merging often missing, no progress bar, no API. |
| 8 | **4K Video Downloader / ByClick / SnapDownloader / YTD** | Desktop apps | Powerful (8K, batch, playlists, subtitles, private videos) but **require install + license fee**, no mobile. |
| 9 | **NewPipe / Seal / VidMate** | Mobile apps | Android-only, must sideload, no web/desktop. |
| 10 | **cobalt.tools** | Web/API | Clean, dev-friendly, but minimal UI, no format table, rate limited. |
| 11 | **yt-dlp itself (CLI)** | OSS CLI | The engine everyone uses — **no GUI**, no progress web UI, no hosting. |

---

## 2. Feature matrix (what users actually compare)

Legend: ✅ full · 🟡 partial / unreliable · ❌ missing

| Feature | Y2Mate | SaveFrom | YT1s | SSYouTube | y2meta | 4K Video Downloader | cobalt | **OUR SITE** |
|---|---|---|---|---|---|---|---|---|
| Ads / popups / fake buttons | ❌ heavy | ❌ heavy | ❌ heavy | ⚠️ redirects | ❌ heavy | ✅ | ✅ | **✅ none** |
| Works with a pasted URL, no install | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | **✅** |
| **1080p / 1440p / 4K MP4 with audio merged** | 🟡 often 720p | 🟡 | ❌ | ❌ 720p | 🟡 | ✅ | 🟡 | **✅ server-side ffmpeg mux** |
| 8K / highest available | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 | **✅ (best format picker)** |
| MP3 320 kbps audio extraction | 🟡 128–320 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | **✅ + M4A/OPUS/WAV/FLAC** |
| **Full format table with real sizes/bitrates** | ❌ | ❌ | 🟡 | ❌ | ❌ | 🟡 | ❌ | **✅ per-format size + codec + fps** |
| Live progress (%, speed, ETA) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (app) | ❌ | **✅ SSE real-time** |
| Cancel / pause job | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **✅** |
| Download queue + history + re-download | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | **✅ (server + browser history)** |
| **Playlist / batch → ZIP** | ❌ | ❌ | 🟡 | ❌ | ❌ | ✅ (paid) | ❌ | **✅ free, select-all + ZIP** |
| Channel / bulk URLs (multi-paste) | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **✅** |
| Subtitles / closed captions (SRT/VTT, auto-gen) | ❌ | 🟡 | ❌ | ❌ | ❌ | ✅ (paid) | 🟡 | **✅ free, all langs** |
| Thumbnail download (all sizes) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | **✅ + cover-art embed** |
| **Trim / cut clip before download** | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 paid | ❌ | **✅ server-side, no re-encode when possible** |
| Metadata / description / JSON sidecar | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **✅** |
| Resume / HTTP Range support | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 | **✅** |
| Works on mobile browser | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | ✅ | **✅ PWA + installable** |
| Dark mode | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡 | **✅ (auto + manual)** |
| **Hindi / regional language UI** | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **✅ EN + हिन्दी** |
| Open REST API + OpenAPI docs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | **✅ free, documented** |
| Video preview before download | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **✅ inline player** |
| Privacy (no tracking, auto-delete) | ❌ trackers | ❌ | ❌ | ❌ | ❌ | 🟡 | ✅ | **✅ TTL auto-delete, no analytics** |
| Self-hostable / no vendor lock-in | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | **✅ MIT-style, 1-command setup** |
| Rate-limit / abuse protection | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ✅ | **✅ per-IP token bucket** |

---

## 3. The 3 real technical gaps every competitor has (and why we win)

### Gap 1 — "Only 360p/720p available" (the #1 user complaint)
YouTube serves **1080p+ as separate video-only and audio-only streams**. Merging them requires
**ffmpeg on the server**. Most web downloaders either don't run ffmpeg or run it without enough
resources, so they silently downgrade the user to the 360p/720p *combined* stream
(source: r/youtubedl — "If you're limited to 360p from YouTube, that usually means you don't have
ffmpeg installed", Dec 2025).
**Our fix:** ffmpeg is bundled + auto-installed by `scripts/setup-binaries.mjs`, every format is
muxed (`-c copy`, no quality loss, fast), and the API returns **which formats need muxing** so the
UI can show "1080p MP4 • audio merged" honestly.

### Gap 2 — No feedback: user clicks, page reloads, nothing happens
Competitors use blocking page-reload flows with **no progress, no ETA, no error message**.
**Our fix:** every download is a *job* with a state machine
(`queued → resolving → downloading → processing → ready → failed/canceled/expired`),
progress is streamed over **Server-Sent Events** (`/api/events`), with speed/ETA/percent,
plus cancel and retry.

### Gap 3 — Ad-hell + trust deficit
Y2Mate-class sites are the reason people look for alternatives: fake download buttons, pop-unders,
and in Y2Mate's case an outright shutdown in Oct 2025.
**Our fix:** zero ads, no third-party scripts, no cookies/trackers, files auto-deleted after TTL,
explicit legal notice, and a self-hostable codebase.

---

## 4. What "beating them" means — measurable acceptance criteria

These are enforced by the automated test-suite (`npm test`):

| # | Acceptance criterion | Test |
|---|---|---|
| A1 | Paste any YouTube URL shape (watch, youtu.be, shorts, live, embed, music, `&t=`/`&list=`, playlist) → parsed correctly | `tests/unit/url.test.js` |
| A2 | 1080p+/4K MP4 downloads are **merged & playable** (ffprobe: has both video+audio streams) | `tests/e2e/pipeline.test.js` |
| A3 | MP3/audio extraction produces a valid audio file with correct container | `tests/e2e/pipeline.test.js` |
| A4 | Progress events are emitted and monotonic 0→100 with speed/ETA | `tests/e2e/progress.test.js` |
| A5 | Playlist → N jobs → single ZIP with N playable files | `tests/e2e/playlist.test.js` |
| A6 | Subtitles, thumbnails, metadata, trim all actually work end-to-end | `tests/e2e/features.test.js` |
| A7 | API never 500s on garbage input; canonical error envelope; rate-limit → 429 | `tests/api/errors.test.js` |
| A8 | No path traversal, no command injection, no SSRF to internal hosts | `tests/api/security.test.js` |
| A9 | Frontend bundles with SEO tags, PWA manifest, i18n, a11y landmarks, zero `localhost` refs | `tests/web/build.test.js` |
| A10 | Cold start → first download link in **< 3 s** on demo data (competitors: 10–40 s queues) | `tests/e2e/perf.test.js` |

---

## 5. Positioning statement

> **"The downloader that doesn't lie to you."**
> Real 4K with audio, real progress bar, real format sizes, no ads, no popups, no fake buttons —
> in English and हिन्दी, installable as an app, with a free API.

**Primary differentiators to lead with on the landing page:** 4K+audio merge, live progress,
no ads, free API, Hindi UI, PWA.
