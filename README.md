# ytvideodownloader

**A YouTube downloader that is actually good: real 4K with audio merged, MP3 in any bitrate, playlists as one ZIP, subtitles, trims and live progress — with no ads, no popups, no sign-up, and a free documented API. Self-host it in one command.**

Cloud downloaders (y2mate, SaveFrom, YT1s, SSYouTube…) make you click through fake "Download" buttons, cap you at 720p, throttle you into a queue, and shut down the moment they get a takedown notice. Desktop apps cost money and won't run on your phone. This project is the third option: an open-source, self-hostable app that uses the same engine professionals use (`yt-dlp` + `ffmpeg`) and ships a real product around it.

> ⚖️ **Use it responsibly.** Download only content you own or that is licensed for reuse. Respect YouTube's Terms of Service and the copyright law that applies to you. This software is a tool; what you point it at is your call.

---

## Table of contents

- [Why this beats the competition](#why-this-beats-the-competition)
- [Feature tour](#feature-tour)
- [Quick start](#quick-start)
- [Docker / self-hosting](#docker--self-hosting)
- [REST API](#rest-api)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why this beats the competition

Full 11-competitor teardown with sources: [`docs/COMPETITOR-ANALYSIS.md`](docs/COMPETITOR-ANALYSIS.md). The short version:

| What people complain about | How this project fixes it |
| --- | --- |
| "1080p/4K downloads come out silent" | Separate video + audio streams are **muxed with ffmpeg** (`-c copy`), verified by ffprobe in the test-suite (A2). |
| "It only gives me 360p/720p" | Every available video-only, audio-only and pre-muxed format is listed with **real size, codec, fps and HDR flags**; 8K → 240p presets including VP9/AV1 sources. |
| "Ads, pop-ups, fake buttons, redirects" | Zero ads, zero trackers, zero third-party scripts. The only network calls are to the site itself and `i.ytimg.com` for thumbnails. |
| "The site went down / got taken over" | MIT licensed, self-hostable: `docker compose up -d`. No company can take it away from you. |
| "I can't see how far along it is, it just spins" | **Live SSE progress** with percent, download speed, ETA, bytes and the current stage (downloading → merging → converting). |
| "My playlist download needs 40 clicks" | Paste a playlist link → one **ZIP with every file**, plus per-item status and a skip note when the batch cap trims it. |
| "It's English-only" | Full **English + Hindi** UI (Devanagari, not transliteration), switchable and persisted. |
| "It needs an account / phone number" | No accounts at all. Nothing to sign up for, nothing stored about you beyond an IP rate-limit counter in memory. |
| "There's no API" | Free, documented **REST + SSE API** (`GET /api/openapi.json`), CORS-enabled, typed error envelopes, OpenAPI 3.0.3. |
| "It doesn't work on my phone" | Mobile-first PWA: installable, offline shell via service worker, works on a 360 px screen, dark mode follows the system. |

### The three technical gaps it closes

1. **Audio-less high-resolution downloads** — the classic failure mode of naive downloaders. Solved with explicit format selection + ffmpeg muxing, and asserted in tests.
2. **Opaque, inconsistent errors** — every failure is a typed code (`GEO_BLOCKED`, `BOT_CHECK`, `PRIVATE_VIDEO`, `FILE_EXPIRED`, …) with a human message and the right HTTP status.
3. **No observability** — jobs, batches, cache and SSE client counts are exposed at `/api/health` and `/api/stats`, and progress is a first-class stream, not a spinner.

---

## Feature tour

**Downloading**
- 8K / 4K / 1440p / 1080p / 720p / 480p / 360p / 240p MP4 (H.264, VP9, AV1 sources; muxed to MP4, MKV or WebM as needed)
- Audio-only: MP3 320/192/128, M4A (AAC), Opus, WAV, FLAC
- Extra artefacts: subtitles (SRT), max-resolution thumbnail (JPEG), full metadata (JSON)
- Trim any range (`start`/`end`) before downloading
- Resume-friendly: files are served with HTTP `Range` support (`206`) so browsers and download managers can continue a broken transfer
- Cancel a running job, retry a failed one, watch a queue with concurrency limits

**Experience**
- Live progress: percent, speed, ETA, downloaded/total bytes, stage — pushed over SSE, with an automatic polling fallback so a proxy that buffers `text/event-stream` can never leave the UI stuck on "queued"
- Job history in `localStorage` (nothing leaves your device)
- Playlist browser with per-entry status → batch ZIP
- Keyboard-first: `/` focuses the URL box, `Esc` clears it, visible focus rings, ARIA live region for status
- Light/dark themes, `prefers-reduced-motion` respected, print stylesheet
- SEO-complete static shell: canonical, hreflang (`en`/`hi`/`x-default`), Open Graph, Twitter cards, four JSON-LD blocks (WebApplication, HowTo, FAQPage, BreadcrumbList), `robots.txt` + `sitemap.xml` — every published URL is rewritten to your real origin per request (`SITE_URL` to pin it)
- PWA: manifest with maskable icons, install shortcuts, offline shell

**Server**
- Express API with zod-style validation, typed errors, per-IP rate limiting (separate budgets for cheap and heavy endpoints), queue limits and body limits
- Info caching (TTL + LRU) so repeat pastes are instant
- Text-file cache with automatic sweeping; `FILE_TTL_HOURS` controls expiry
- Cookies file, HTTP/SOCKS proxy and upstream rate limits supported for tricky networks
- Graceful shutdown, structured logs, no stack traces or filesystem paths in responses
- Demo mode: with `DEMO_MODE=on` the app generates its own sample media, so you can kick the tyres (and run the whole test-suite) with no network at all

---

## Quick start

Requirements: **Node.js ≥ 18.17** and **Python 3** (only yt-dlp uses it). ffmpeg is downloaded for you.

```bash
git clone https://github.com/bijayshankarchaudhary138/ytvideodownloader.git
cd ytvideodownloader

npm install          # app dependencies
npm run setup        # downloads yt-dlp + a static ffmpeg into vendor/
npm run build        # builds the React frontend into web/dist
npm start            # http://localhost:8080
```

Development (API + Vite HMR, `/api` proxied so the browser sees one origin):

```bash
npm run dev                # auto mode
npm run dev -- --live      # force the real yt-dlp engine
npm run dev -- --demo      # force the built-in sample media
```

Check that everything is wired up correctly:

```bash
npm run verify             # boots the app, runs a real download, prints 17 checks
npm run verify -- --demo   # same, using sample media (no network needed)
```

Production notes: run behind a reverse proxy with TLS, set `TRUST_PROXY=1`, and keep `data/` on a disk with room for your `FILE_TTL_HOURS` window. `npm start` serves both the API and the built SPA from one port.

---

## Docker / self-hosting

```bash
docker compose up -d --build     # then open http://localhost:8080
```

or manually:

```bash
docker build -t ytvideodownloader .
docker run -d -p 8080:8080 -v ytvd-data:/app/data --name ytvd ytvideodownloader
```

The image is a `node:20-slim` with python3, the vendored engines in `vendor/`, and the built frontend. `/app/data` holds cached metadata and finished files — mount it as a volume so restarts don't lose the queue's output.

---

## REST API

Everything the web UI does is available over HTTP. The full schema is served by the app itself at **`GET /api/openapi.json`** (works offline, always in sync with the code).

```bash
# 1. Metadata + format catalogue
curl -s -X POST http://localhost:8080/api/info \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# 2. Start a download (1080p MP4 with merged audio)
curl -s -X POST http://localhost:8080/api/jobs \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","preset":"mp4-1080"}'

# 3. Watch it live (SSE: job:update, job:progress, job:done)
curl -N http://localhost:8080/api/events

# 4. Download the result once the job is ready
curl -OJ http://localhost:8080/api/files/<jobId>?download=1

# Audio only, with a 30s trim
curl -s -X POST http://localhost:8080/api/jobs \
  -H 'content-type: application/json' \
  -d '{"url":"https://youtu.be/dQw4w9WgXcQ","preset":"mp3-320","trim":{"start":0,"end":30}}'
```

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, engine availability, queue/cache/SSE stats |
| `GET` | `/api/meta` | Presets, limits, languages, feature flags |
| `GET` | `/api/stats` | Job/batch/cache counters |
| `POST` | `/api/info` | Video or playlist metadata + format catalogue (`refresh:true` to bypass cache) |
| `POST` | `/api/jobs` | Create a download job (preset, optional trim/subtitle/title) |
| `GET` | `/api/jobs` | List jobs (`?status=ready,failed&limit=50`) |
| `GET` | `/api/jobs/{id}` | One job (public shape, no paths) |
| `GET` | `/api/jobs/{id}/status` | Lightweight poller for clients without SSE |
| `POST` | `/api/jobs/{id}/cancel` | Cancel a running/queued job (`409 JOB_FINISHED` if already done) |
| `POST` | `/api/jobs/{id}/retry` | Re-run a failed job |
| `DELETE` | `/api/jobs/{id}` | Forget a job and delete its file |
| `POST` | `/api/batch` | Playlist → N jobs → one ZIP |
| `GET` | `/api/batch/{id}` | Batch status + per-item details |
| `GET` | `/api/batch/{id}/zip` | Stream the ZIP (`409` until ready, `410` if nothing succeeded) |
| `GET` | `/api/files/{id}` | The finished file (`Range`, `HEAD`, `Content-Disposition`) |
| `GET` | `/api/thumb/{videoId}/{name}` | Thumbnail (`default`…`maxresdefault`) |
| `GET` | `/api/subs/{videoId}/{lang}` | WebVTT subtitles (demo mode; jobs produce `.srt` otherwise) |
| `POST` | `/api/extract-urls` | Pull every link out of pasted text |
| `GET` | `/api/events` | Server-sent events: `hello`, `job:update`, `job:progress`, `job:done`, `ping` |
| `GET` | `/api/openapi.json` | The OpenAPI 3.0.3 document |

Errors always look the same, and the status code matches the machine code:

```json
{ "error": { "code": "INVALID_PRESET", "message": "Unknown preset: nope", "details": { "presets": ["best", "mp4-4320", "…"] } } }
```

`400 INVALID_*` · `404 NOT_FOUND / JOB_NOT_FOUND` · `405 METHOD_NOT_ALLOWED` · `409 JOB_FINISHED / BATCH_NOT_READY` · `410 FILE_EXPIRED / NO_FILES` · `429 RATE_LIMITED / QUEUE_FULL` · `451 GEO_BLOCKED` · `503 BOT_CHECK` · `504 TIMEOUT`

---

## Configuration

Every knob works as an env var **and** as a config override (which is how the tests pin behaviour). The ones you are most likely to touch:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Where the server listens |
| `DATA_DIR` | `./data` | Cache, temp and finished files |
| `DEMO_MODE` | `auto` | `on` = sample media, `off` = always yt-dlp, `auto` = demo only if yt-dlp is missing |
| `FILE_TTL_HOURS` | `6` | How long finished files stay downloadable |
| `CONCURRENCY` | `2` | Simultaneous yt-dlp/ffmpeg jobs |
| `MAX_QUEUE_LENGTH` | `50` | Queued jobs before `429 QUEUE_FULL` |
| `MAX_BATCH_SIZE` | `5` | Playlist items per batch request (rest are skipped with a note) |
| `MAX_PLAYLIST_ITEMS` | `50` | Items read from a playlist |
| `MAX_DURATION_SECONDS` | `14400` | Refuse absurdly long videos |
| `MAX_FILESIZE_BYTES` | `4 GiB` | Refuse absurdly large downloads |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `60` / `60000` | General per-IP budget |
| `HEAVY_RATE_LIMIT_MAX` | `15` | Budget for expensive endpoints (`/api/info`, `/api/jobs`, `/api/batch`) |
| `BODY_LIMIT` | `64kb` | Max request body |
| `FFMPEG_PRESET` | `veryfast` | x264/x265 speed/quality trade-off |
| `CONCURRENT_FRAGMENTS` | `4` | yt-dlp parallel fragment downloads |
| `COOKIES_FILE` | – | Netscape cookie file for age-restricted/member content |
| `PROXY_URL` | – | HTTP/SOCKS proxy for yt-dlp |
| `UPSTREAM_RATE_LIMIT` | – | yt-dlp `--limit-rate`, e.g. `5M` |
| `TRUST_PROXY` | `true` | Honour `X-Forwarded-For` (set `0` if you are not behind a proxy) |
| `SITE_URL` | inferred | Public origin stamped into canonical/hreflang/og/JSON-LD/`sitemap.xml`. Defaults to the request's own origin, so a fresh deployment is never wrong — set it explicitly when you have several domains |
| `LOG_LEVEL` | `info` | `debug`…`silent` |

Presets: `best`, `mp4-4320`, `mp4-2160`, `mp4-1440`, `mp4-1080`, `mp4-720`, `mp4-480`, `mp4-360`, `mp4-240`, `mp3-320`, `mp3-192`, `mp3-128`, `m4a`, `opus`, `wav`, `flac`, `subtitle-srt`, `thumbnail-max`, `metadata-json`.

---

## How it works

```
browser ──/api/*──► Express  ──►  downloader service  ──►  yt-dlp (probe / download)
   ▲                   │                │                        │
   │                   │                └──► ffmpeg (mux, transcode, trim, thumbs)
   │                   ├── job store (queue, TTL, events) ──► SSE ──► browser
   └───────────────────┴── static SPA (web/dist) + SEO shell + service worker
```

- **Presets, not guesses.** `resolvePreset` turns `mp4-1080` into a concrete yt-dlp format string (`137+140`-style, with fallbacks) and knows whether muxing is required; `selectFormatForPreset` reports the honest result (`needsMux`, `qualityFallback`) when a source does not have the requested height.
- **Progress is parsed from the engine**, not faked: yt-dlp's progress lines and ffmpeg's `-progress` output are normalised into one shape (`percent`, `speed`, `eta`, `stage`) and pushed over SSE.
- **Everything is a job.** Trims, thumbnails, subtitles and metadata exports go through the same queue, so they get the same retry/cancel/TTL/progress semantics.
- **Two engines behind one interface.** The demo provider renders a real H.264+AAC clip with ffmpeg and implements the identical contract, which is what makes the test-suite hermetic and the app reviewable offline.

---

## Testing

The project was built test-first: the acceptance criteria in [`docs/COMPETITOR-ANALYSIS.md`](docs/COMPETITOR-ANALYSIS.md) were turned into failing specs, and the implementation was written until they passed.

```bash
npm test              # everything (~35 s): unit + api + e2e + web build/UI
npm run test:unit     # pure logic: url parsing, formats, ffmpeg, engine, job store
npm run test:e2e      # real pipeline with the real ffmpeg + real yt-dlp
npm run verify        # post-install smoke test against a live server
```

| Suite | What it proves |
| --- | --- |
| `tests/unit/*` | URL shapes (watch/shorts/live/embed/music/playlist/timestamps), format catalogue maths, size estimation, ffmpeg wrapper + probe, yt-dlp argument building, progress parsing, job store lifecycle, i18n parity |
| `tests/api/api.test.js` | Every endpoint contract, caching, headers, CORS, OpenAPI coverage, static/SEO routes |
| `tests/api/errors.test.js` | 25 hostile requests never 5xx, canonical envelope, 405 + `Allow`, `INVALID_PRESET` details, rate-limit `Retry-After`, `413`, expired-file `410` |
| `tests/api/security.test.js` | Traversal matrix, command-injection payloads (with a canary file), SSRF matrix, prototype pollution, header hygiene, no config/path leakage, zip-slip |
| `tests/e2e/pipeline.test.js` | 1080p+ MP4 really has video **and** audio after download, audio formats are valid, cancel/retry/resume |
| `tests/e2e/playlist.test.js` | Playlist → N jobs → one ZIP of playable files, batch caps + skip notes |
| `tests/e2e/features.test.js` | Subtitles (VTT + SRT), thumbnails (real JPEGs), metadata JSON, trim (duration asserted with ffprobe), job control, file lifecycle |
| `tests/e2e/progress.test.js` | SSE frames, monotonic percent, speed/ETA, heartbeat |
| `tests/e2e/perf.test.js` | Cold `health` < 500 ms, cached info < 250 ms, first download link < 45 s, 4 concurrent presets < 2 min, queue overflow → `429` |
| `tests/e2e/ytdlp.test.js` | The **real** engine: probe → download → mux → serve → probe again, plus typed errors with no stack traces |
| `tests/web/build.test.js` | Real `vite build`: bundle budgets, no hardcoded localhost API calls, SEO tags, JSON-LD, manifest, service worker, dark mode/reduced motion in the CSS |
| `tests/web/ui.test.jsx` | React flows in jsdom: analyse → format table → download → ready link, error surfacing, history, Hindi switch, theme toggle, a11y landmarks, keyboard shortcuts |

The e2e suites use a locally generated sample clip and a local HTTP origin, so they run in CI without hitting YouTube; `tests/e2e/ytdlp.test.js` still exercises the genuine yt-dlp binary end to end.

---

## Project layout

```
server/src
  config.js              every knob, env-var overridable
  core/                  logger, util, url parsing, formats/presets, ffmpeg, yt-dlp engine, job store, rate limiter, i18n
  services/              cache, downloader (provider switch), batch (playlist → ZIP)
  providers/             demo.js (self-generated media), ytdlp.js (real engine)
  http/                  app.js (routes, static, errors), sse.js, openapi.js
web
  index.html             SEO shell + JSON-LD + theme pre-paint
  src/components         Layout, Home, Result, Queue, Pages
  src/lib                api client, jobs store, i18n, theme, formatting
  public                 robots, sitemap, manifest, service worker, icons
scripts
  setup-binaries.mjs     downloads yt-dlp + static ffmpeg, installs the ffprobe shim
  ffprobe-shim.mjs       ffprobe CLI implemented over `ffmpeg -i`
  make-icons.mjs         dependency-free PNG generator for the PWA icons
  dev.mjs                API + Vite dev server on one origin
  verify.mjs             end-to-end smoke test with a pass/fail table
tests                    unit, api, e2e and web specs (see table above)
docs/COMPETITOR-ANALYSIS.md   the competitive research this project was built against
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `yt-dlp is not available` | `npm run setup` (needs network once). Or run `DEMO_MODE=on` to try the app anyway. |
| Downloads fail with `BOT_CHECK` | YouTube is challenging the datacentre IP. Use a `PROXY_URL`, or self-host nearer the user, or retry later. |
| Downloads fail with `GEO_BLOCKED` | The video is region-locked where the server runs — use a proxy/VPN in the right region. |
| Audio conversion fails | Check `vendor/bin/ffprobe` exists (`npm run setup` installs a shim); set `FFPROBE_PATH` to use a system ffprobe. |
| Playback has no sound | That means a video-only stream was fetched — should be impossible here (muxing is asserted in the test-suite); force reconstruction by choosing a `mp4-*` preset instead of `best`. |
| Progress stuck on "queued" / no download link appears | Fixed in the app itself (SSE + polling fallback), but check the browser console and `/api/jobs` — if the queue is empty, the POST never reached the server (`TRUST_PROXY=0` if you are behind a proxy that mangles headers). |
| Everything looks broken locally | `npm run verify` tells you exactly which layer is down. |

---

## License

[MIT](LICENSE) © ytvideodownloader contributors. Vendored binaries keep their own licenses: `yt-dlp` (Unlicense) and `ffmpeg` (LGPL/GPL build from the imageio-ffmpeg wheel).
