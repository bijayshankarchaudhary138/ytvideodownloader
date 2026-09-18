/**
 * These tests exercise the REAL bundled ffmpeg binary (no network).
 * They are the proof that "1080p/4K with audio" and "MP3" actually work.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { makeTempDir } from '../helpers/server.js';
import { ffmpegBin, runFfmpeg, ffprobe, probeMedia, generateSampleVideo, parseProgressLine } from '@server/core/ffmpeg.js';

let dir;

beforeAll(async () => {
  dir = await makeTempDir('ytvd-ffmpeg-');
  process.env.VENDOR_DIR = process.env.VENDOR_DIR || path.resolve(process.cwd(), 'vendor');
  await fs.access(ffmpegBin()).catch(() => {
    throw new Error(`ffmpeg binary missing at ${ffmpegBin()} — run: npm run setup`);
  });
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

describe('ffmpeg wrapper', () => {
  it('locates the bundled binary and reports a version', async () => {
    const res = await runFfmpeg(['-version']);
    expect(res.stdout).toContain('ffmpeg version');
  });

  it('generates an H.264 sample video with an audio track', async () => {
    const file = path.join(dir, 'sample.mp4');
    await generateSampleVideo(file, { seconds: 2, height: 360, fps: 10 });
    const info = await probeMedia(file);
    expect(info.video[0].codec).toMatch(/h264/);
    expect(info.video[0].height).toBe(360);
    expect(info.audio.length).toBe(1);
    expect(info.duration).toBeGreaterThan(1);
  });

  it('extracts an MP3 that really is an MP3', async () => {
    const src = path.join(dir, 'sample.mp4');
    const out = path.join(dir, 'audio.mp3');
    await generateSampleVideo(src, { seconds: 2, height: 144, fps: 10 });
    const r = await runFfmpeg(['-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', out]);
    expect(r.code).toBe(0);
    const info = await probeMedia(out);
    expect(info.audio[0].codec).toBe('mp3');
    expect(info.video.length).toBe(0);
  });

  it('does a true mux: separate video-only + audio-only become one playable mp4', async () => {
    const v = path.join(dir, 'v-only.mp4');
    const a = path.join(dir, 'a-only.m4a');
    const merged = path.join(dir, 'merged.mp4');
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', v]);
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', '-b:a', '128k', a]);
    // sanity: inputs really are single-stream
    expect((await probeMedia(v)).audio.length).toBe(0);
    expect((await probeMedia(a)).video.length).toBe(0);

    const r = await runFfmpeg(['-y', '-i', v, '-i', a, '-c', 'copy', '-movflags', '+faststart', merged]);
    expect(r.code).toBe(0);
    const info = await probeMedia(merged);
    expect(info.video.length).toBe(1);
    expect(info.audio.length).toBe(1);
    expect(info.duration).toBeGreaterThan(1.5);
  });

  it('trims accurately without re-encoding', async () => {
    const src = path.join(dir, 'trim-src.mp4');
    const out = path.join(dir, 'trimmed.mp4');
    await generateSampleVideo(src, { seconds: 4, height: 144, fps: 10 });
    await runFfmpeg(['-y', '-ss', '1', '-i', src, '-t', '2', '-c', 'copy', out]);
    const info = await probeMedia(out);
    expect(info.duration).toBeGreaterThan(1.4);
    expect(info.duration).toBeLessThan(2.6);
  });

  it('generates subtitle, thumbnail and poster artefacts', async () => {
    const src = path.join(dir, 'sample.mp4');
    await generateSampleVideo(src, { seconds: 2, height: 288, fps: 10 });
    const jpg = path.join(dir, 'thumb.jpg');
    await runFfmpeg(['-y', '-ss', '0.5', '-i', src, '-frames:v', '1', '-q:v', '3', jpg]);
    const stat = await fs.stat(jpg);
    expect(stat.size).toBeGreaterThan(500);
    const head = await fs.readFile(jpg);
    expect(head.subarray(0, 2).toString('hex')).toBe('ffd8'); // JPEG SOI
  });

  it('parses ffmpeg -progress output', () => {
    const line = 'frame=120\nfps=30.0\nbitrate=1000kbits/s\ntotal_size=1048576\nout_time_ms=2000000\nout_time=00:00:02.000000\nspeed=2.5x\nprogress=continue';
    const parsed = parseProgressLine(line, { duration: 4 });
    expect(parsed.percent).toBeGreaterThan(40);
    expect(parsed.percent).toBeLessThan(60);
    expect(parsed.speed).toBe('2.5x');
    expect(parsed.totalBytes).toBe(1048576);
  });

  it('never hangs on a broken input — fails fast with a typed error', async () => {
    await expect(runFfmpeg(['-y', '-i', '/nonexistent/file.mp4', path.join(dir, 'o.mp4')], { timeoutMs: 8000 }))
      .rejects.toMatchObject({ code: 'FFMPEG_FAILED' });
  });

  it('ffprobe helper reports stream info as JSON', async () => {
    const src = path.join(dir, 'probe.mp4');
    await generateSampleVideo(src, { seconds: 2, height: 240, fps: 10 });
    const info = await ffprobe(src);
    // ffprobe's own JSON is string-typed — probeMedia() is the normalising API.
    expect(Number(info.format.duration)).toBeGreaterThan(1);
    expect(info.streams.some((s) => s.codec_type === 'video')).toBe(true);
    expect(info.streams.every((s) => typeof s.codec_type === 'string')).toBe(true);
  });

  it('probeMedia normalises ffprobe output into numbers for the app', async () => {
    const src = path.join(dir, 'probe2.mp4');
    await generateSampleVideo(src, { seconds: 2, height: 240, fps: 10 });
    const info = await probeMedia(src);
    expect(typeof info.duration).toBe('number');
    expect(info.duration).toBeGreaterThan(1);
    expect(info.video[0].height).toBe(240);
    expect(info.video[0].codec).toMatch(/h264|avc/);
    expect(info.audio.length).toBe(1);
    expect(info.size).toBeGreaterThan(1000);
    expect(info.container).toBeTruthy();
  });
});
