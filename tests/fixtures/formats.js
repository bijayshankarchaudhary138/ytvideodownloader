/**
 * A realistic yt-dlp `--dump-single-json` payload (trimmed) used by unit tests.
 * This mirrors what YouTube returns for a 1080p video with subtitles.
 */
export const SAMPLE_INFO = {
  id: 'dQw4w9WgXcQ',
  title: 'Test Video 🎬 with émojis & "quotes" / slashes',
  uploader: 'Test Channel',
  channel_id: 'UCtestchannelid0000000',
  upload_date: '20240115',
  duration: 213,
  view_count: 1234567,
  like_count: 45678,
  description: 'A test description with <html> & "entities".',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  is_live: false,
  age_limit: 0,
  formats: [
    // combined (progressive) — 360p only these days
    { format_id: '18', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', width: 640, height: 360, fps: 30, tbr: 596, filesize: 15_000_000, protocol: 'https' },
    { format_id: '22', ext: 'mp4', vcodec: 'avc1.64001F', acodec: 'mp4a.40.2', width: 1280, height: 720, fps: 30, tbr: 1600, filesize: 42_000_000, protocol: 'https' },
    // video-only
    { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', width: 0, height: 0, tbr: 0 },
    { format_id: '394', ext: 'mp4', vcodec: 'av01.0.00M.08', acodec: 'none', width: 256, height: 144, fps: 15, tbr: 60, filesize: 1_600_000, protocol: 'https' },
    { format_id: '160', ext: 'mp4', vcodec: 'avc1.4d400c', acodec: 'none', width: 256, height: 144, fps: 15, tbr: 60, filesize: 1_600_000, protocol: 'https' },
    { format_id: '133', ext: 'mp4', vcodec: 'avc1.4d4015', acodec: 'none', width: 426, height: 240, fps: 30, tbr: 150, filesize: 4_000_000, protocol: 'https' },
    { format_id: '134', ext: 'mp4', vcodec: 'avc1.4d401e', acodec: 'none', width: 640, height: 360, fps: 30, tbr: 400, filesize: 10_600_000, protocol: 'https' },
    { format_id: '135', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', width: 854, height: 480, fps: 30, tbr: 700, filesize: 18_600_000, protocol: 'https' },
    { format_id: '136', ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', width: 1280, height: 720, fps: 30, tbr: 1200, filesize: 32_000_000, protocol: 'https' },
    { format_id: '137', ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', width: 1920, height: 1080, fps: 30, tbr: 2400, filesize: 64_000_000, protocol: 'https' },
    { format_id: '248', ext: 'webm', vcodec: 'vp9', acodec: 'none', width: 1920, height: 1080, fps: 30, tbr: 2000, filesize: 53_000_000, protocol: 'https' },
    { format_id: '271', ext: 'webm', vcodec: 'vp9', acodec: 'none', width: 2560, height: 1440, fps: 30, tbr: 4000, filesize: 106_000_000, protocol: 'https' },
    { format_id: '313', ext: 'webm', vcodec: 'vp9', acodec: 'none', width: 3840, height: 2160, fps: 30, tbr: 9000, filesize: 240_000_000, protocol: 'https' },
    // audio-only
    { format_id: '139', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.5', abr: 48, asr: 22050, filesize: 1_300_000, protocol: 'https' },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, asr: 44100, filesize: 3_400_000, protocol: 'https' },
    { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160, asr: 48000, filesize: 4_200_000, protocol: 'https' },
    // storyboard / no media — must be filtered out
    { format_id: 'sb1', ext: 'mhtml', vcodec: 'none', acodec: 'none', width: 48, height: 27, tbr: 1 },
  ],
  thumbnails: [
    { id: 'default', url: 'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/default.webp', width: 120, height: 90, preference: -1 },
    { id: 'mqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', width: 320, height: 180, preference: 1 },
    { id: 'hqdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480, height: 360, preference: 2 },
    { id: 'sddefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg', width: 640, height: 480, preference: 3 },
    { id: 'maxresdefault', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', width: 1280, height: 720, preference: 4 },
  ],
  subtitles: {
    en: [{ ext: 'vtt', url: 'https://example.invalid/sub/en.vtt', name: 'English' }],
    hi: [{ ext: 'vtt', url: 'https://example.invalid/sub/hi.vtt', name: 'हिन्दी' }],
  },
  automatic_captions: {
    en: [{ ext: 'vtt', url: 'https://example.invalid/auto/en.vtt', name: 'English (auto)' }],
    de: [{ ext: 'vtt', url: 'https://example.invalid/auto/de.vtt', name: 'Deutsch (auto)' }],
    'hi-Latn': [{ ext: 'vtt', url: 'https://example.invalid/auto/hi-latn.vtt', name: 'Hindi (Latin)' }],
  },
  chapters: [
    { start_time: 0, end_time: 30, title: 'Intro' },
    { start_time: 30, end_time: 213, title: 'Main part' },
  ],
};

export const PLAYLIST_INFO = {
  id: 'PLdemoPlaylist0001',
  title: 'Demo Playlist',
  _type: 'playlist',
  playlist_count: 3,
  entries: [1, 2, 3].map((n) => ({
    ...SAMPLE_INFO,
    id: `demoEntry000${n}`,
    title: `Playlist video ${n}`,
    webpage_url: `https://www.youtube.com/watch?v=demoEntry000${n}`,
    duration: 30 + n,
  })),
};
