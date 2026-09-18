# Self-hostable runner for ytvideodownloader.
#
#   docker build -t ytvideodownloader .
#   docker run -p 8080:8080 -v ytvd-data:/app/data ytvideodownloader
#
# yt-dlp needs python3; ffmpeg/ffprobe are fetched by `npm run setup` into
# vendor/ (a static ffmpeg + a small ffprobe shim), so no other system
# dependencies are required.
FROM node:20-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/app/data \
    LOG_LEVEL=info

WORKDIR /app

# python3 is the only system package yt-dlp needs; ca-certificates for TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies first so the layer is cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Vendored media engine (yt-dlp + ffmpeg) and the built frontend.
COPY . .
RUN npm run setup && npm run build

ENV DEMO_MODE=off

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/src/index.js"]
