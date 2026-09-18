import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildYtDlpArgs,
  parseYtdlpProgressLine,
  parseYtdlpError,
  detectStage,
  ytdlpVersion,
  ytdlpAvailable,
} from '@server/core/engine.js';

describe('yt-dlp argument builder (no shell, injection-proof)', () => {
  const base = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    outputTemplate: '/data/jobs/abc/video.%(ext)s',
    ffmpegLocation: '/repo/vendor/bin',
  };

  it('always builds an argv array of plain strings', () => {
    const args = buildYtDlpArgs({ ...base, format: '137+140', mergeFormat: 'mp4' });
    expect(Array.isArray(args)).toBe(true);
    expect(args.every((a) => typeof a === 'string')).toBe(true);
    expect(args.at(-1)).toBe(base.url);
  });

  it('includes the reliability flags that make downloads not fail silently', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best' });
    expect(args).toContain('--newline');
    expect(args).toContain('--no-colors');
    expect(args).toContain('--socket-timeout');
    expect(args).toContain('--retries');
    expect(args).toContain('--fragment-retries');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--ffmpeg-location');
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe(base.ffmpegLocation);
  });

  it('asks ffmpeg to merge only when the selection needs it', () => {
    const merge = buildYtDlpArgs({ ...base, format: '137+140', mergeFormat: 'mp4' });
    expect(merge).toContain('--merge-output-format');
    expect(merge[merge.indexOf('--merge-output-format') + 1]).toBe('mp4');

    const plain = buildYtDlpArgs({ ...base, format: '18' });
    expect(plain).not.toContain('--merge-output-format');
  });

  it('uses a progress template we can parse (percent/speed/eta/total)', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best' });
    const tmpl = args[args.indexOf('--progress-template') + 1];
    expect(tmpl).toContain('%(progress.downloaded_bytes)s');
    expect(tmpl).toContain('%(progress.total_bytes_estimate)s');
    expect(tmpl).toContain('%(progress.speed)s');
    expect(tmpl).toContain('%(progress.eta)s');
  });

  it('writes to the given template and keeps the id in a sidecar', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best', writeInfoJson: true });
    expect(args[args.indexOf('-o') + 1]).toBe(base.outputTemplate);
    expect(args).toContain('--write-info-json');
    expect(args).toContain('--no-clean-info-json');
  });

  it('handles audio extraction presets', () => {
    const args = buildYtDlpArgs({ ...base, format: '140', extractAudio: true, audioFormat: 'mp3', audioQuality: '320K' });
    expect(args).toContain('-x');
    expect(args[args.indexOf('--audio-format') + 1]).toBe('mp3');
    expect(args[args.indexOf('--audio-quality') + 1]).toBe('320K');
  });

  it('handles subtitles, thumbnails, metadata and playlist options', () => {
    const subs = buildYtDlpArgs({ ...base, format: 'best', writeSubs: true, subLangs: ['en', 'hi'], subFormat: 'srt' });
    expect(subs).toContain('--write-subs');
    expect(subs[subs.indexOf('--sub-langs') + 1]).toBe('en,hi');
    expect(subs[subs.indexOf('--convert-subs') + 1]).toBe('srt');

    const auto = buildYtDlpArgs({ ...base, format: 'best', writeAutoSubs: true, subLangs: ['en'] });
    expect(auto).toContain('--write-auto-subs');

    const thumb = buildYtDlpArgs({ ...base, format: 'best', writeThumbnail: true, embedThumbnail: true });
    expect(thumb).toContain('--write-thumbnail');
    expect(thumb).toContain('--embed-thumbnail');
    expect(thumb).toContain('--convert-thumbnails');
    expect(thumb[thumb.indexOf('--convert-thumbnails') + 1]).toBe('jpg');
    expect(thumb).toContain('--embed-metadata');

    const playlist = buildYtDlpArgs({ ...base, url: 'https://www.youtube.com/playlist?list=PL1', format: 'best', playlist: true, playlistItems: '1-10' });
    expect(playlist).toContain('--yes-playlist');
    expect(playlist).not.toContain('--no-playlist');
    expect(playlist[playlist.indexOf('--playlist-items') + 1]).toBe('1-10');
    expect(playlist).toContain('--ignore-errors');
  });

  it('handles trimming via sections (fast, keyframe-forced)', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best', trim: { start: 5, end: 12.5 } });
    expect(args[args.indexOf('--download-sections') + 1]).toBe('*00:00:05.000-00:00:12.500');
    expect(args).toContain('--force-keyframes-at-cuts');
  });

  it('passes a cookies file and rate limit when configured, never as raw shell text', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best', cookiesFile: '/secrets/cookies.txt', rateLimit: '5M', concurrentFragments: 4 });
    expect(args[args.indexOf('--cookies') + 1]).toBe('/secrets/cookies.txt');
    expect(args[args.indexOf('--limit-rate') + 1]).toBe('5M');
    expect(args[args.indexOf('--concurrent-fragments') + 1]).toBe('4');
    expect(args.join(' ')).not.toContain('$( ');
    expect(args.join(' ')).not.toContain('`');
  });

  it('never forwards unknown/unsafe extra args', () => {
    const args = buildYtDlpArgs({ ...base, format: 'best', extraArgs: ['--exec', 'rm -rf /', 'not-a-flag', '--output', '/etc/x'] });
    expect(args).not.toContain('--exec');
    expect(args).not.toContain('rm -rf /');
    expect(args).not.toContain('not-a-flag');
  });
});

describe('yt-dlp output parsing', () => {
  it('parses newline progress lines', () => {
    const p = parseYtdlpProgressLine('[download]  45.3% of 10.00MiB at 1.20MiB/s ETA 00:05');
    expect(p).toMatchObject({ percent: 45.3, speed: '1.20MiB/s' });
    expect(p.eta).toBeGreaterThan(0);
    expect(p.totalBytes).toBe(Math.round(10 * 1024 * 1024));
  });

  it('parses the JSON progress template lines', () => {
    const json = JSON.stringify({ status: 'downloading', downloaded_bytes: 500000, total_bytes_estimate: 1000000, speed: 250000, eta: 2 });
    const p = parseYtdlpProgressLine(`__PROGRESS__${json}`);
    expect(p.percent).toBe(50);
    expect(p.downloaded).toBe(500000);
    expect(p.speedBytesPerSec).toBe(250000);
    expect(p.eta).toBe(2);
  });

  it('clamps nonsense percentages', () => {
    expect(parseYtdlpProgressLine('[download] 130% of 1MiB').percent).toBe(100);
    expect(parseYtdlpProgressLine('[download] -3% of 1MiB').percent).toBe(0);
    expect(parseYtdlpProgressLine('random noise')).toBe(null);
  });

  it('detects the pipeline stage for the UI', () => {
    expect(detectStage('[download] Destination: /x/video.f137.mp4')).toBe('downloading');
    expect(detectStage('[Merger] Merging formats into "/x/video.mp4"')).toBe('merging');
    expect(detectStage('[ExtractAudio] Destination: /x/a.mp3')).toBe('converting');
    expect(detectStage('Deleting original file /x/v.f137.mp4')).toBe('finalizing');
    expect(detectStage('nothing here')).toBe(null);
  });

  it('maps raw yt-dlp failures to friendly typed errors', () => {
    expect(parseYtdlpError('ERROR: Video unavailable')).toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(parseYtdlpError('ERROR: Private video. Sign in if you have been granted access')).toMatchObject({ code: 'PRIVATE_VIDEO' });
    expect(parseYtdlpError('ERROR: Sign in to confirm you are not a bot')).toMatchObject({ code: 'BOT_CHECK' });
    expect(parseYtdlpError('ERROR: This video is not available in your country')).toMatchObject({ code: 'GEO_BLOCKED' });
    expect(parseYtdlpError('ERROR: Requested format is not available')).toMatchObject({ code: 'FORMAT_UNAVAILABLE' });
    expect(parseYtdlpError('ERROR: HTTP Error 429: Too Many Requests')).toMatchObject({ code: 'RATE_LIMITED' });
    expect(parseYtdlpError('ERROR: Unsupported URL: https://foo')).toMatchObject({ code: 'UNSUPPORTED_URL' });
    const generic = parseYtdlpError('ERROR: something exploded');
    expect(generic.code).toBe('DOWNLOAD_FAILED');
    expect(generic.message.length).toBeGreaterThan(3);
    // never leak absolute paths or python tracebacks to the user
    const leaky = parseYtdlpError('ERROR: [Errno 2] No such file or directory: /home/user/secret.txt');
    expect(leaky.message).not.toContain('/home/user');
  });
});

describe('engine availability', () => {
  beforeAll(() => {
    process.env.VENDOR_DIR = process.env.VENDOR_DIR || `${process.cwd()}/vendor`;
  });

  it('finds the vendored yt-dlp and reports its version', async () => {
    expect(await ytdlpAvailable()).toBe(true);
    const v = await ytdlpVersion();
    expect(v).toMatch(/^\d{4}\.\d{1,2}\.\d{1,2}/);
  });
});
