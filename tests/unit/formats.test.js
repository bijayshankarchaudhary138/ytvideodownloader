import { describe, it, expect } from 'vitest';
import {
  buildFormatCatalog,
  selectFormatForPreset,
  PRESETS,
  resolvePreset,
  qualityLabel,
  estimateSize,
  humanBytes,
  humanDuration,
  humanCount,
  sortFormats,
  buildSubtitleList,
  sanitizeTrim,
} from '@server/core/formats.js';
import { SAMPLE_INFO } from '../fixtures/formats.js';

describe('buildFormatCatalog', () => {
  const catalog = buildFormatCatalog(SAMPLE_INFO);

  it('splits formats into video / audio / combined and hides storyboards', () => {
    expect(catalog.video.length).toBeGreaterThan(5);
    expect(catalog.audio.length).toBe(3);
    expect(catalog.combined.length).toBe(2);
    const ids = [...catalog.video, ...catalog.audio, ...catalog.combined].map((f) => f.id);
    expect(ids).not.toContain('sb0');
    expect(ids).not.toContain('sb1');
  });

  it('sorts video descending by height then bitrate', () => {
    const heights = catalog.video.map((f) => f.height);
    expect(heights[0]).toBe(2160);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
  });

  it('dedupes the same resolution, keeping the best bitrate', () => {
    const at1080 = catalog.video.filter((f) => f.height === 1080);
    expect(at1080).toHaveLength(1);
    expect(at1080[0].tbr).toBe(2400); // the avc1 1080p, not the weaker vp9 one
  });

  it('marks formats that need muxing', () => {
    expect(catalog.video.every((f) => f.needsMux === true)).toBe(true);
    expect(catalog.audio.every((f) => f.needsMux === false)).toBe(true);
    expect(catalog.combined.every((f) => f.needsMux === false)).toBe(true);
  });

  it('computes human labels and sizes', () => {
    const top = catalog.video[0];
    expect(top.label).toBe('4K');
    expect(top.heightLabel).toBe('2160p');
    expect(catalog.video.find((f) => f.height === 1080).label).toBe('1080p');
    expect(catalog.video.find((f) => f.height === 1440).label).toBe('1440p');
    expect(top.size).toBe(240_000_000);
    expect(top.sizeText).toMatch(/MB|GB/);
  });

  it('falls back to bitrate-based size estimation when filesize is missing', () => {
    const info = {
      ...SAMPLE_INFO,
      formats: [{ format_id: 'x', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 720, fps: 30, tbr: 1000, filesize: null }],
    };
    const c = buildFormatCatalog(info);
    // 1000 kbit/s * 213 s / 8 / 1000 = ~26.6 MB
    expect(c.video[0].size).toBeGreaterThan(25_000_000);
    expect(c.video[0].size).toBeLessThan(28_000_000);
    expect(c.video[0].sizeApprox).toBe(true);
  });

  it('exposes metadata, chapters, subtitles and thumbnails', () => {
    expect(catalog.meta.title).toContain('Test Video');
    expect(catalog.meta.channel).toBe('Test Channel');
    expect(catalog.meta.duration).toBe(213);
    expect(catalog.meta.uploadDate).toBe('2024-01-15');
    expect(catalog.meta.isLive).toBe(false);
    expect(catalog.chapters).toHaveLength(2);
    expect(catalog.subtitles.manual.map((s) => s.lang)).toEqual(['en', 'hi']);
    expect(catalog.subtitles.auto.length).toBe(3);
    expect(catalog.thumbnails.at(-1).id).toBe('maxresdefault');
  });

  it('survives an empty info object', () => {
    const c = buildFormatCatalog({});
    expect(c.video).toEqual([]);
    expect(c.audio).toEqual([]);
    expect(c.meta.duration).toBe(0);
    expect(c.subtitles.manual).toEqual([]);
  });
});

describe('PRESETS + selectFormatForPreset (the "real 4K" guarantee)', () => {
  const catalog = buildFormatCatalog(SAMPLE_INFO);

  it('ships the expected preset ids', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const need of ['best', 'mp4-2160', 'mp4-1440', 'mp4-1080', 'mp4-720', 'mp4-480', 'mp4-360', 'mp3-320', 'mp3-128', 'm4a', 'opus']) {
      expect(ids).toContain(need);
    }
    expect(PRESETS.every((p) => p.label && p.kind && p.id)).toBe(true);
  });

  it('1080p preset selects a video-only stream + best audio and asks ffmpeg to merge', () => {
    const sel = selectFormatForPreset(catalog, 'mp4-1080');
    expect(sel.merge).toBe(true);
    expect(sel.needsMux).toBe(true);
    expect(sel.ext).toBe('mp4');
    expect(sel.format).toContain('+');
    expect(sel.height).toBe(1080);
    expect(sel.quality).toBe('1080p');
    expect(sel.format).toMatch(/137/);
  });

  it('falls back to the next best resolution when 4K is unavailable', () => {
    const limited = buildFormatCatalog({
      ...SAMPLE_INFO,
      formats: SAMPLE_INFO.formats.filter((f) => !f.height || f.height <= 720),
    });
    const sel = selectFormatForPreset(limited, 'mp4-2160');
    expect(sel.height).toBe(720);
    expect(sel.fallbackFrom).toBe(2160);
  });

  it('uses the progressive stream when it is already the best available', () => {
    const only360 = buildFormatCatalog({
      ...SAMPLE_INFO,
      formats: SAMPLE_INFO.formats.filter((f) => f.format_id === '18'),
    });
    const sel = selectFormatForPreset(only360, 'mp4-360');
    expect(sel.needsMux).toBe(false);
    expect(sel.format).toBe('18');
    expect(sel.merge).toBe(false);
  });

  it('audio presets pick audio-only streams and transcode when asked', () => {
    const mp3 = selectFormatForPreset(catalog, 'mp3-320');
    expect(mp3.kind).toBe('audio');
    expect(mp3.ext).toBe('mp3');
    expect(mp3.audioOnly).toBe(true);
    expect(mp3.codec).toBe('mp3');
    expect(mp3.bitrate).toBe('320k');
    expect(mp3.format).toMatch(/140|251/); // best audio source

    const m4a = selectFormatForPreset(catalog, 'm4a');
    expect(m4a.ext).toBe('m4a');
    expect(m4a.audioOnly).toBe(true);
  });

  it('throws a typed error for an unknown preset', () => {
    expect(() => selectFormatForPreset(catalog, 'nope-1')).toThrowError(/INVALID_PRESET|unknown preset/i);
    expect(resolvePreset('mp4-1080').id).toBe('mp4-1080');
    expect(resolvePreset('nope-1')).toBe(null);
  });

  it('never asks yt-dlp for a format that would silently lose audio', () => {
    for (const preset of PRESETS.filter((p) => p.kind === 'video')) {
      const sel = selectFormatForPreset(catalog, preset.id);
      if (sel.needsMux) {
        expect(sel.format, preset.id).toContain('+');
        expect(sel.mergeOutputFormat || sel.ext).toBeTruthy();
      } else {
        expect(sel.format).not.toContain('+');
      }
    }
  });
});

describe('helpers', () => {
  it('qualityLabel', () => {
    expect(qualityLabel(4320)).toBe('8K');
    expect(qualityLabel(2160)).toBe('4K');
    expect(qualityLabel(1440)).toBe('1440p');
    expect(qualityLabel(1080)).toBe('1080p');
    expect(qualityLabel(0)).toBe('audio');
  });

  it('estimateSize prefers exact, then approx, then bitrate math', () => {
    expect(estimateSize({ filesize: 100 })).toBe(100);
    expect(estimateSize({ filesize_approx: 200 })).toBe(200);
    expect(estimateSize({ tbr: 800 }, 100)).toBe(10_000_000); // 800 kbit/s * 100s / 8
    expect(estimateSize({}, 100)).toBe(null);
  });

  it('humanBytes / humanDuration / humanCount', () => {
    expect(humanBytes(0)).toBe('—');
    expect(humanBytes(999)).toBe('999 B');
    expect(humanBytes(1500)).toBe('1.5 KB');
    expect(humanBytes(5_242_880)).toBe('5.0 MB');
    expect(humanBytes(2_147_483_648)).toBe('2.0 GB');
    expect(humanDuration(0)).toBe('0:00');
    expect(humanDuration(3725)).toBe('1:02:05');
    expect(humanDuration(45)).toBe('0:45');
    expect(humanCount(1234)).toBe('1.2K');
    expect(humanCount(1_500_000)).toBe('1.5M');
    expect(humanCount(42)).toBe('42');
  });

  it('sortFormats is stable and descending', () => {
    const list = [{ height: 360, tbr: 100 }, { height: 1080, tbr: 50 }, { height: 360, tbr: 500 }];
    const sorted = sortFormats(list);
    expect(sorted.map((f) => `${f.height}/${f.tbr}`)).toEqual(['1080/50', '360/500', '360/100']);
  });

  it('buildSubtitleList flattens manual + auto', () => {
    const list = buildSubtitleList(SAMPLE_INFO);
    expect(list.find((s) => s.lang === 'en' && s.auto === false)).toBeTruthy();
    expect(list.find((s) => s.lang === 'de' && s.auto === true)).toBeTruthy();
    expect(list.every((s) => typeof s.label === 'string' && s.label.length > 0)).toBe(true);
  });

  it('sanitizeTrim validates and clamps', () => {
    expect(sanitizeTrim({ start: 1.5, end: 5 }, 10)).toEqual({ start: 1.5, end: 5 });
    expect(sanitizeTrim({ start: -3, end: 100 }, 10)).toEqual({ start: 0, end: 10 });
    expect(sanitizeTrim({ start: 8, end: 4 }, 10)).toBe(null);
    expect(sanitizeTrim({ start: 'x', end: 'y' }, 10)).toBe(null);
    expect(sanitizeTrim(null, 10)).toBe(null);
    expect(sanitizeTrim({ start: 1, end: 1 }, 10)).toBe(null);
    expect(sanitizeTrim({ start: 0.5, end: 3.25 }, 10)).toEqual({ start: 0.5, end: 3.25 });
  });
});
