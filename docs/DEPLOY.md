# Testing & going live

Everything you need to (1) find the running site, (2) test it, and (3) put it on
the real internet.

- [1. Where the website is](#1-where-the-website-is)
- [2. Test it locally](#2-test-it-locally)
- [3. Manual browser test (12 checks)](#3-manual-browser-test-12-checks)
- [4. Go live — option A: Docker](#4-go-live--option-a-docker-recommended)
- [5. Go live — option B: VPS + nginx + systemd](#5-go-live--option-b-vps--nginx--systemd)
- [6. Go live — option C: PaaS (Render / Railway / Fly)](#6-go-live--option-c-paas-render--railway--fly)
- [7. Production checklist](#7-production-checklist)
- [8. Troubleshooting](#8-troubleshooting)
- [9. Legal](#9-legal)

---

## 1. Where the website is

| Where | URL | What runs there |
| --- | --- | --- |
| This sandbox (preview panel) | port **5173** | `npm run dev`: Vite dev server + API, hot reload |
| This sandbox (preview panel) | port **8080** | Express server serving the **built** SPA + API (production-like) |
| Your machine, development | `http://localhost:5173` | `npm run dev` |
| Your machine, production-like | `http://localhost:8080` | `npm run build && npm start` |
| Real internet | `https://your-domain.com` | after [§4](#4-go-live--option-a-docker-recommended) or [§5](#5-go-live--option-b-vps--nginx--systemd) |

In the Arena preview panel you can switch between the two ports; **5173** is the
nicer one to click around in (instant reloads), **8080** shows what a real
deployment serves.

> The sandbox cannot reach youtube.com, so the preview runs with `DEMO_MODE=on`:
> the app renders its own sample clip with ffmpeg. Every button, progress bar and
> download works exactly the same — only the source video is synthetic. Set
> `DEMO_MODE=off` on a machine with internet access to hit real YouTube.

---

## 2. Test it locally

```bash
git clone https://github.com/bijayshankarchaudhary138/ytvideodownloader.git
cd ytvideodownloader

npm install          # app dependencies
npm run setup        # downloads yt-dlp + static ffmpeg into vendor/ (needs network once)
npm run build        # builds the frontend into web/dist

npm test             # the whole suite: 17 files / 251 tests (~40 s)
```

Individual suites:

| Command | What it runs | Runtime |
| --- | --- | --- |
| `npm run test:unit` | URL parsing, formats, ffmpeg, engine, job store, i18n (5 files) | ~5 s |
| `npm run test:api` | Every endpoint contract + hostile input + security (3 files) | ~15 s |
| `npm run test:e2e` | Real pipeline, playlist→ZIP, features, progress, perf, real yt-dlp, web build + UI (9 files) | ~35 s |
| `npm test` | All of the above | ~40 s |
| `npm run verify` | Boots a real server and runs a **17-check smoke test** with a pass/fail table | ~5 s |
| `npm run verify -- --demo` | Same, but sample media only (no network needed) | ~4 s |
| `npm run test:watch` | Vitest in watch mode while you develop | – |

`npm run verify` output looks like this:

```
✓ bundled ffmpeg responds (58 ms)  v7.0.2-static · vendor/bin/ffmpeg
✓ ffprobe responds (-print_format json) (101 ms)  ffprobe version 7.0.2-shim
✓ yt-dlp is importable (173 ms)  v2026.08.19
✓ boots and answers /api/health (24 ms)  mode=live · uptime=0s
✓ video job downloads and muxes audio (666 ms)  sample.mp4 · 465 KB · h264+aac · 854x480
✓ MP3 preset produces playable audio (924 ms)  sample.mp3 · 160 KB · mp3 320 kbps
...
17/17 checks passed in 4.1s
```

Start it yourself:

```bash
npm run dev                      # http://localhost:5173  (API on :8080)
npm run dev -- --demo            # force sample media (offline)
npm run dev -- --live            # force the real yt-dlp engine
npm run dev -- --port 9000 --web-port 4000

# production-style single process:
npm run build && npm start       # http://localhost:8080
```

API smoke test with curl (works against `http://localhost:8080`):

```bash
curl -s localhost:8080/api/health | head -c 200
curl -s -X POST localhost:8080/api/info -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=demoBukkTub"}'
curl -s -X POST localhost:8080/api/jobs -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=demoBukkTub","preset":"mp3-320"}'
curl -N localhost:8080/api/events            # live progress stream
curl -s localhost:8080/api/openapi.json | head -c 200
```

---

## 3. Manual browser test (12 checks)

Open the site (preview :5173, or `localhost:8080` after a build) and walk down
the list. Each line maps to an acceptance criterion from
[`COMPETITOR-ANALYSIS.md`](COMPETITOR-ANALYSIS.md).

1. **Hero loads** — h1, URL box, "Analyse" button, no console errors. *(A9)*
2. **Paste a link → Analyse** — a video card appears (title, channel, duration,
   thumbnail) plus a format table with size/codec per row. *(A1)*
3. **Video tab → Download 1080p** — progress bar moves with % + speed + ETA, then
   a green "Save file" link appears; the file plays with sound. *(A2, A4)*
4. **Audio tab → MP3 320** — download the MP3 and play it. *(A3)*
5. **Subtitles tab** — pick English, download the `.srt`; open it in a text
   editor (timestamps + text). *(A6)*
6. **Thumbnail tab** — download the max-res JPEG, it opens as an image. *(A6)*
7. **Trim** — set `start=1`, `end=3`, download; filename contains `trim`, clip is
   ~2 seconds. *(A6)*
8. **Playlist** — paste a playlist URL, press the batch button, wait for the ZIP,
   open it: one playable file per item. *(A5)*
9. **Cancel** — start a big download, hit Cancel: status becomes "canceled" and
   the download stops. *(A4)*
10. **Queue + history** — the queue panel lists jobs; the 🕘 History button shows
    past downloads after a reload (stored in `localStorage`). *(A2)*
11. **Hindi + dark mode** — 🌐 switches the whole UI to Devanagari, 🌙 toggles
    dark; both survive a reload. *(A9)*
12. **API docs page** (`/api-docs`) and `/api/openapi.json` — the documented API
    renders, and the JSON validates as OpenAPI 3.0.3. *(A7)*

Automated equivalents of all of the above live in `tests/` — the manual pass is
for feel (layout, wording, responsiveness), not for coverage.

---

## 4. Go live — option A: Docker (recommended)

Requires Docker on a server (a 2 vCPU / 2 GB VPS is enough to start). The image
contains Node, python3 (for yt-dlp), the vendored engines and the built frontend.

```bash
git clone https://github.com/bijayshankarchaudhary138/ytvideodownloader.git
cd ytvideodownloader

# optional: put your domain in compose/.env so canonical URLs are right
export SITE_URL=https://dl.example.com

docker compose up -d --build
docker compose logs -f          # watch startup
curl -fsS localhost:8080/api/health
```

The app listens on `:8080`. Put nginx (or Caddy) in front for TLS — see
[`deploy/nginx.conf`](../deploy/nginx.conf). Volumes keep your data:

- `ytvd-data` → `/app/data` (cached metadata + finished files)
- `ytvd-vendor` → `/app/vendor` (yt-dlp + ffmpeg, so restarts don't re-download)

Update to the newest yt-dlp (YouTube changes often — do this monthly, or automate
it with cron):

```bash
docker compose exec ytvideodownloader sh -c 'SKIP_FFMPEG=1 npm run setup'
```

---

## 5. Go live — option B: VPS + nginx + systemd

Tested on Ubuntu 22.04/24.04. Assume `/opt/ytvideodownloader` and domain
`dl.example.com`.

```bash
# 1. system packages
sudo apt update && sudo apt install -y nodejs npm python3 nginx certbot python3-certbot-nginx
node -v            # must be >= 18.17

# 2. dedicated user + code
sudo adduser --system --group --home /opt/ytvideodownloader ytvd
sudo -u ytvd git clone https://github.com/bijayshankarchaudhary138/ytvideodownloader.git /opt/ytvideodownloader
cd /opt/ytvideodownloader

# 3. install engines + build the SPA
sudo -u ytvd npm ci --omit=dev
sudo -u ytvd npm run setup
sudo -u ytvd npm run build

# 4. make it a service
sudo cp deploy/ytvideodownloader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ytvideodownloader
systemctl status ytvideodownloader --no-pager
curl -fsS localhost:8080/api/health

# 5. nginx + TLS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/ytvideodownloader
sudo ln -sf /etc/nginx/sites-available/ytvideodownloader /etc/nginx/sites-enabled/
sudo sed -i 's/dl.example.com/YOUR_DOMAIN/g' /etc/nginx/sites-available/ytvideodownloader
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN          # free HTTPS, auto-renewing
```

Update later:

```bash
cd /opt/ytvideodownloader
sudo -u ytvd git pull
sudo -u ytvd npm ci --omit=dev && sudo -u ytvd npm run setup && sudo -u ytvd npm run build
sudo systemctl restart ytvideodownloader
```

Keep yt-dlp fresh automatically (YouTube ships breaking changes constantly):

```bash
sudo crontab -u ytvd -e
# every day at 04:30, update the downloader engine only
30 4 * * * cd /opt/ytvideodownloader && SKIP_FFMPEG=1 npm run setup >> data/setup.log 2>&1
```

---

## 6. Go live — option C: PaaS (Render / Railway / Fly)

The repo ships a `Dockerfile`, so any container host works:

1. Create a new **Web Service** from this repository, choose **Docker**.
2. Port: `8080`. Health check path: `/api/health`.
3. **Add a persistent disk** mounted at `/app/data` (and ideally `/app/vendor`).
   Without it, finished files disappear on every deploy.
4. Environment variables (see [§7](#7-production-checklist)):
   `NODE_ENV=production`, `DEMO_MODE=off`, `SITE_URL=https://your-app.example`,
   `TRUST_PROXY=1`, `FILE_TTL_HOURS=6`, `CONCURRENCY=1` on small instances.

Heads-up: YouTube frequently challenges **datacenter IP ranges** (`BOT_CHECK`
errors). A PaaS instance often works, but a plain VPS with a clean IP — or a
`PROXY_URL` / `COOKIES_FILE` — is more reliable. Plan disk and memory for the
`FILE_TTL_HOURS` window: files are stored on disk until they expire.

---

## 7. Production checklist

| Item | Why |
| --- | --- |
| `NODE_ENV=production` | immutable asset caching, prod error handling |
| `DEMO_MODE=off` | serve real downloads instead of sample clips |
| `SITE_URL=https://your-domain` | canonical/hreflang/OG/sitemap get your real origin |
| `TRUST_PROXY=1` **only** behind a proxy | correct client IPs for rate limiting |
| `FILE_TTL_HOURS` sized to your disk | `size ≈ peak downloads × TTL` |
| `CONCURRENCY` ≤ vCPUs / 2 | each job runs yt-dlp + ffmpeg |
| `RATE_LIMIT_MAX`, `HEAVY_RATE_LIMIT_MAX` | stop one visitor from filling the queue |
| TLS via nginx/Caddy/certbot | downloads over plain HTTP are a bad idea |
| `proxy_buffering off` for `/api/events` | SSE must stream, not buffer (see [§8](#8-troubleshooting)) |
| Disk space + a cleanup cron | `data/` grows until files expire |
| yt-dlp update cron | YouTube breaks extractors regularly |
| Backups: not needed for `data/` | it is a cache — safe to delete |

Optional, for hard-to-reach networks:

```bash
COOKIES_FILE=/opt/ytvideodownloader/data/cookies.txt   # Netscape-format export
PROXY_URL=http://user:pass@proxy.example:3128          # or socks5://…
UPSTREAM_RATE_LIMIT=5M                                  # be polite to YouTube
```

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Progress stuck on "queued", download link never appears | The UI polls automatically now, but confirm `/api/jobs` shows progress. If not, nginx is buffering SSE: add `proxy_buffering off;` to the `/api/events` location (and disable proxy buffering in Cloudflare / any CDN in front). |
| `BOT_CHECK` on every download | YouTube is challenging the server IP. Use `PROXY_URL`, a `COOKIES_FILE` from a browser session, or move to a VPS with a residential-ish IP. |
| `GEO_BLOCKED` | The video is region-locked for the server's country — proxy in the right region. |
| "yt-dlp is not available" | Run `npm run setup` (or `SKIP_FFMPEG=1 npm run setup` for a quick engine refresh). |
| Audio conversion fails | `vendor/bin/ffprobe` missing → `npm run setup` reinstalls the shim; or set `FFPROBE_PATH`. |
| Downloads vanish after restart | You are on a PaaS without a persistent disk — mount a volume at `/app/data`. |
| Everything looks broken | `npm run verify` — it prints exactly which layer failed. |
| Slow first download | Cold ffmpeg muxing on a small VPS; raise `CONCURRENCY` only if you have CPU headroom. |

---

## 9. Legal

This software is a tool. Download only content you own, content that is licensed
for reuse (Creative Commons, public domain), or content you have permission to
download, and follow YouTube's Terms of Service and the copyright law that
applies to you. If you deploy it publicly, publish a terms/privacy page and
respect takedown requests — the app ships `/privacy` and `/terms` pages for that.
