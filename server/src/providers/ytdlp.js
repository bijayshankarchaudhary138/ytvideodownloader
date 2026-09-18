/**
 * Live provider: the real thing, powered by yt-dlp.
 *
 * Handles metadata probing (`-J`), video/audio downloads (with the merge step
 * that makes 1080p+ possible), subtitles, thumbnails and metadata sidecars.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { buildYtDlpArgs, runYtDlp, findOutputFile, detectStage, parseYtdlpProgressLine } from '../core/engine.js';
import { ffmpegBin } from '../core/ffmpeg.js';

export function createYtDlpProvider({ config, logger }) {
  const ffmpegLocation = path.dirname(ffmpegBin());

  function commonArgs() {
    return {
      ffmpegLocation,
      cookiesFile: config.cookiesFile,
      rateLimit: config.rateLimitUpstream,
      concurrentFragments: config.concurrentFragments,
      proxyUrl: config.proxyUrl,
      ffmpegPreset: config.ffmpegPreset,
    };
  }

  function makeProgressHandler(onProgress) {
    let last = 0;
    return (line) => {
      const stage = detectStage(line);
      const parsed = parseYtdlpProgressLine(line);
      if (!parsed) return;
      const now = Date.now();
      if (now - last < 150 && parsed.percent !== 100) return;
      last = now;
      onProgress?.({
        percent: parsed.percent ?? null,
        speed: parsed.speed ?? null,
        eta: parsed.eta ?? null,
        downloaded: parsed.downloaded ?? null,
        total: parsed.totalBytes ?? parsed.total ?? null,
        stage: stage ?? parsed.stage ?? 'downloading',
      });
    };
  }

  async function probe(url, parsed, { signal } = {}) {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--ignore-config',
      '--socket-timeout', '20',
      '--retries', '3',
      ...(parsed.type === 'playlist' ? ['--flat-playlist', '--yes-playlist'] : ['--no-playlist']),
      ...(config.cookiesFile ? ['--cookies', config.cookiesFile] : []),
      url,
    ];
    const { stdout } = await runYtDlp(args, {
      timeoutMs: 120_000,
      signal,
      env: { PYTHONIOENCODING: 'utf-8' },
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) {
      throw Object.assign(new Error('could not read video information'), { code: 'EXTRACT_FAILED' });
    }
    return JSON.parse(stdout.slice(jsonStart));
  }

  async function download({ selection, job, dir, onProgress, signal }) {
    await fsp.mkdir(dir, { recursive: true });
    const outputTemplate = path.join(dir, 'media.%(ext)s');
    const kind = selection.preset.kind;
    const events = makeProgressHandler(onProgress);

    const base = {
      ...commonArgs(),
      url: job.url,
      outputTemplate,
      trim: job.trim ?? null,
    };

    let args;
    if (kind === 'video') {
      args = buildYtDlpArgs({
        ...base,
        format: selection.format,
        mergeFormat: selection.merge ? 'mp4' : null,
        writeInfoJson: false,
      });
    } else if (kind === 'audio') {
      args = buildYtDlpArgs({
        ...base,
        format: selection.format,
        extractAudio: true,
        audioFormat: selection.ext,
        audioQuality: selection.bitrate ?? '192K',
        embedThumbnail: true,
      });
    } else if (kind === 'subtitle') {
      const auto = Boolean(job.subtitle?.auto);
      args = buildYtDlpArgs({
        ...base,
        format: 'best',
        writeSubs: !auto,
        writeAutoSubs: auto,
        subLangs: [job.subtitle?.lang ?? 'en'],
        subFormat: 'srt',
        skipDownload: true,
      });
    } else if (kind === 'image') {
      args = buildYtDlpArgs({
        ...base,
        format: 'best',
        writeThumbnail: true,
        skipDownload: true,
      });
    } else {
      args = buildYtDlpArgs({
        ...base,
        format: 'best',
        writeInfoJson: true,
        skipDownload: true,
      });
    }

    await runYtDlp(args, {
      timeoutMs: config.jobTimeoutMs,
      signal,
      env: { PYTHONIOENCODING: 'utf-8' },
      onLine: (line) => {
        events(line);
        if (logger.debug) logger.debug(line);
      },
    });

    const wantedExt = kind === 'subtitle' ? ['srt', 'vtt']
      : kind === 'image' ? ['jpg', 'jpeg', 'png', 'webp']
        : kind === 'data' ? ['json']
          : ['mp4', 'mkv', 'webm', 'm4a', 'mp3', 'opus', 'wav', 'flac'];

    const found = await findOutputFile(dir, { extensions: wantedExt });
    if (!found) {
      throw Object.assign(new Error('the download produced no file'), { code: 'DOWNLOAD_FAILED' });
    }
    return {
      file: found.file,
      kind,
      ext: found.ext,
      size: found.size,
      needsMux: Boolean(selection.merge),
    };
  }

  return { id: 'yt-dlp', probe, download, ffmpegLocation };
}
