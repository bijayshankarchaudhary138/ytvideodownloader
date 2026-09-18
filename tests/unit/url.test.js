import { describe, it, expect } from 'vitest';
import {
  parseVideoUrl,
  extractUrls,
  parseTimestamp,
  formatTimestamp,
  canonicalWatchUrl,
  isYouTubeHost,
  isBlockedHost,
} from '@server/core/url.js';

describe('parseVideoUrl — every URL shape a user can paste', () => {
  const videoCases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/v/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ];

  it.each(videoCases)('parses %s', (input, expectedId) => {
    const parsed = parseVideoUrl(input);
    expect(parsed.ok).toBe(true);
    expect(parsed.videoId).toBe(expectedId);
    expect(parsed.type).toBe('video');
    expect(['youtube', 'youtube-music']).toContain(parsed.source);
  });

  it('detects shorts / live / embed as their own kinds but still video type', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/abcdefghijk').kind).toBe('shorts');
    expect(parseVideoUrl('https://www.youtube.com/live/abcdefghijk').kind).toBe('live');
    expect(parseVideoUrl('https://youtu.be/abcdefghijk').kind).toBe('short-link');
  });

  it('parses timestamps in every notation', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=90').startSeconds).toBe(90);
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s').startSeconds).toBe(3723);
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s').startSeconds).toBe(90);
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=15').startSeconds).toBe(15);
  });

  it('parses playlists', () => {
    const p = parseVideoUrl('https://www.youtube.com/playlist?list=PLabc123XYZ_-');
    expect(p.ok).toBe(true);
    expect(p.type).toBe('playlist');
    expect(p.playlistId).toBe('PLabc123XYZ_-');
  });

  it('parses watch URLs that also carry a playlist as video+playlist', () => {
    const p = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=3');
    expect(p.type).toBe('video');
    expect(p.playlistId).toBe('PLabc123');
    expect(p.videoId).toBe('dQw4w9WgXcQ');
  });

  it('accepts other (non-YouTube) sites as generic', () => {
    const p = parseVideoUrl('https://vimeo.com/123456789');
    expect(p.ok).toBe(true);
    expect(p.type).toBe('generic');
    expect(p.source).toBe('generic');
  });

  it('returns a bare "list" query as playlist', () => {
    expect(parseVideoUrl('https://www.youtube.com/playlist?list=PLxyz').type).toBe('playlist');
  });

  describe('rejects bad input without throwing', () => {
    const bad = [
      ['', 'INVALID_URL'],
      ['   ', 'INVALID_URL'],
      ['not a url', 'INVALID_URL'],
      ['dQw4w9WgXcQ', 'INVALID_URL'],
      ['javascript:alert(1)', 'INVALID_URL'],
      ['file:///etc/passwd', 'INVALID_URL'],
      ['ftp://youtube.com/watch?v=x', 'INVALID_URL'],
      ['data:text/html,<h1>x', 'INVALID_URL'],
      ['http://localhost:8000/watch?v=x', 'BLOCKED_HOST'],
      ['http://127.0.0.1/watch?v=x', 'BLOCKED_HOST'],
      ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_HOST'],
      ['http://10.0.0.5/video', 'BLOCKED_HOST'],
      ['http://192.168.1.1/admin', 'BLOCKED_HOST'],
      ['http://[::1]/x', 'BLOCKED_HOST'],
      ['https://youtube.com/watch?v=tooshort', 'INVALID_VIDEO_ID'],
      ['https://www.youtube.com/playlist', 'INVALID_URL'],
      [null, 'INVALID_URL'],
      [42, 'INVALID_URL'],
    ];
    it.each(bad)('rejects %s', (input, code) => {
      const parsed = parseVideoUrl(input);
      expect(parsed.ok).toBe(false);
      expect(parsed.code).toBe(code);
      expect(typeof parsed.error).toBe('string');
      expect(parsed.error.length).toBeGreaterThan(3);
    });
  });

  it('never lets a hostile host through the allow-list check', () => {
    expect(isYouTubeHost('www.youtube.com')).toBe(true);
    expect(isYouTubeHost('youtu.be')).toBe(true);
    expect(isYouTubeHost('youtube.com.evil.tld')).toBe(false);
    expect(isYouTubeHost('evil-youtube.com')).toBe(false);
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('metadata.google.internal')).toBe(true);
    expect(isBlockedHost('0.0.0.0')).toBe(true);
    expect(isBlockedHost('youtube.com')).toBe(false);
  });
});

describe('extractUrls — clipboard / bulk text handling', () => {
  it('pulls multiple unique urls out of messy text', () => {
    const text = `Check these out:
      https://youtu.be/dQw4w9WgXcQ, and https://www.youtube.com/watch?v=abcdefghijk
      also https://youtu.be/dQw4w9WgXcQ (duplicate)`;
    const urls = extractUrls(text);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('dQw4w9WgXcQ');
    expect(urls[1]).toContain('abcdefghijk');
  });

  it('strips trailing punctuation', () => {
    const urls = extractUrls('see https://youtu.be/dQw4w9WgXcQ.');
    expect(urls[0]).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('caps the number of urls it returns', () => {
    const text = Array.from({ length: 80 }, (_, i) => `https://youtu.be/abcdefghij${String(i).padStart(2, '0')}`).join(' ');
    expect(extractUrls(text, { max: 10 })).toHaveLength(10);
  });

  it('returns [] for empty input', () => {
    expect(extractUrls('')).toEqual([]);
    expect(extractUrls(null)).toEqual([]);
  });
});

describe('timestamps + canonical urls', () => {
  it('parseTimestamp handles strings and numbers', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp(90)).toBe(90);
    expect(parseTimestamp('1h2m3s')).toBe(3723);
    expect(parseTimestamp('2m')).toBe(120);
    expect(parseTimestamp('1:30')).toBe(90);
    expect(parseTimestamp('01:02:03')).toBe(3723);
    expect(parseTimestamp('garbage')).toBe(0);
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp('-5')).toBe(0);
  });

  it('formatTimestamp renders short human values', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(59)).toBe('0:59');
    expect(formatTimestamp(60)).toBe('1:00');
    expect(formatTimestamp(3723)).toBe('1:02:03');
  });

  it('canonicalWatchUrl', () => {
    expect(canonicalWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
