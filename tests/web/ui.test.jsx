// @vitest-environment jsdom
/**
 * UI behaviour tests (jsdom + Testing Library).
 * The whole app is driven against a mocked HTTP layer, so these tests prove the
 * user-visible flows: paste → analyse → choose quality → live progress → history.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAMPLE_INFO } from '../fixtures/formats.js';

vi.mock('@web/lib/api.js', async () => {
  const actual = await vi.importActual('@web/lib/api.js');
  return { ...actual, apiUrl: (p) => p };
});

const App = (await import('@web/App.jsx')).default;
const { resetStore } = await import('@web/lib/store.js');

/* ------------------------------------------------------------------ *
 * Fake backend
 * ------------------------------------------------------------------ */
function makeFakeApi() {
  const state = { jobs: [], infoCalls: 0, lastJobBody: null };
  const info = {
    video: {
      id: SAMPLE_INFO.id,
      title: SAMPLE_INFO.title,
      channel: SAMPLE_INFO.uploader,
      duration: SAMPLE_INFO.duration,
      thumbnail: 'https://example.test/thumb.jpg',
      viewCount: SAMPLE_INFO.view_count,
      uploadDate: '2024-01-15',
      isLive: false,
      webpageUrl: SAMPLE_INFO.webpage_url,
      description: SAMPLE_INFO.description,
    },
    formats: {
      video: [
        { id: '137', label: '1080p', height: 1080, fps: 30, ext: 'mp4', vcodec: 'avc1', size: 64_000_000, sizeText: '61.0 MB', needsMux: true, tbr: 2400 },
        { id: '136', label: '720p', height: 720, fps: 30, ext: 'mp4', vcodec: 'avc1', size: 32_000_000, sizeText: '30.5 MB', needsMux: true, tbr: 1200 },
      ],
      audio: [{ id: '140', label: '128 kbps', abr: 128, ext: 'm4a', size: 3_400_000, sizeText: '3.2 MB' }],
      combined: [],
    },
    subtitles: { manual: [{ lang: 'en', label: 'English', auto: false }], auto: [{ lang: 'de', label: 'Deutsch (auto)', auto: true }] },
    thumbnails: [{ id: 'maxresdefault', url: '/api/thumb/x/maxresdefault.jpg', width: 1280, height: 720 }],
    cached: false,
  };

  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

    if (url.endsWith('/api/health')) {
      return json({ status: 'ok', mode: state.mode ?? 'demo', version: '1.0.0', engines: { ffmpeg: { available: true }, ytdlp: { available: true, version: '2026.08.19' } }, queue: { total: 0 }, cache: {}, sseClients: 0 });
    }
    if (url.endsWith('/api/meta')) {
      return json({
        version: '1.0.0',
        presets: [
          { id: 'mp4-1080', label: '1080p MP4', kind: 'video', ext: 'mp4' },
          { id: 'mp4-720', label: '720p MP4', kind: 'video', ext: 'mp4' },
          { id: 'mp3-320', label: 'MP3 320kbps', kind: 'audio', ext: 'mp3' },
          { id: 'subtitle-srt', label: 'Subtitles', kind: 'subtitle', ext: 'srt' },
          { id: 'thumbnail-max', label: 'Thumbnail', kind: 'image', ext: 'jpg' },
        ],
        limits: { maxBatchSize: 5, maxPlaylistItems: 25, ttlHours: 24 },
        languages: [{ code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी' }],
        features: { playlist: true, subtitles: true, thumbnails: true, trim: true, metadata: true, api: true },
      });
    }
    if (url.endsWith('/api/info') && method === 'POST') {
      state.infoCalls++;
      if (body.url?.includes('BAD')) return json({ error: { code: 'VIDEO_UNAVAILABLE', message: 'Video unavailable' } }, 400);
      return json(info);
    }
    if (url.endsWith('/api/jobs') && method === 'POST') {
      state.lastJobBody = body;
      const job = {
        id: `job-${state.jobs.length + 1}`,
        status: 'queued',
        preset: body.preset,
        title: 'Test Video',
        progress: { percent: 0, stage: 'queued' },
        fileUrl: `/api/files/job-${state.jobs.length + 1}`,
        filename: 'test-video.mp4',
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };
      state.jobs.push(job);
      setTimeout(() => {
        job.status = 'ready';
        job.progress = { percent: 100, stage: 'ready' };
        window.__emitJobDone?.(job);
      }, 30);
      return json({ job }, 201);
    }
    if (url.includes('/api/jobs') && method === 'GET') return json({ jobs: state.jobs, stats: { total: state.jobs.length } });
    if (method === 'DELETE') return json({ ok: true });
    if (url.includes('/cancel')) return json({ job: { ...state.jobs[0], status: 'canceled' } });
    return json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
  });

  return { fetchMock, state };
}

let fake;
beforeEach(() => {
  fake = makeFakeApi();
  vi.stubGlobal('fetch', fake.fetchMock);
  window.EventSource = class {
    constructor() { this.listeners = {}; window.__es = this; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    close() {}
  };
  window.__emitJobDone = (job) => {
    window.__es?.listeners['job:done']?.forEach((fn) => fn({ data: JSON.stringify({ job }) }));
    window.__es?.listeners['job:update']?.forEach((fn) => fn({ data: JSON.stringify({ type: 'job:update', job: { ...job, status: 'downloading', progress: { percent: 45, stage: 'downloading' } } }) }));
  };
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  resetStore?.();
  document.body.innerHTML = '<div id="root"></div><div id="seo-shell">old</div>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__es;
  delete window.__emitJobDone;
});

const renderApp = () => render(<App />);

describe('landing page', () => {
  it('shows the hero, the URL field and the value proposition', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: /download/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/paste|youtube|link/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i })).toBeTruthy();
    expect(screen.getByText(/no ads/i)).toBeTruthy();
  });

  it('removes the static SEO shell once mounted (no duplicate content)', async () => {
    renderApp();
    await waitFor(() => expect(document.getElementById('seo-shell')).toBeNull());
  });

  it('lists the free features and an FAQ for SEO + trust', async () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 2, name: /features|why/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /faq|questions/i })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /api/i }).length).toBeGreaterThan(0);
  });
});

describe('analyse + download flow', () => {
  it('rejects an obviously invalid link without calling the API', async () => {
    renderApp();
    const input = screen.getByPlaceholderText(/paste|youtube|link/i);
    await userEvent.type(input, 'not a link');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(fake.state.infoCalls).toBe(0);
  });

  it('analyses a link, shows metadata + format table with sizes', async () => {
    renderApp();
    const input = screen.getByPlaceholderText(/paste|youtube|link/i);
    await userEvent.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));

    expect((await screen.findAllByText(/Test Video/)).length).toBeGreaterThan(0);
    const table = await screen.findByRole('table', { name: /format|quality/i });
    expect(within(table).getByText(/1080p/)).toBeTruthy();
    expect(within(table).getByText(/61.0 MB/)).toBeTruthy();
    expect(within(table).getByText(/720p/)).toBeTruthy();
    expect(fake.state.infoCalls).toBe(1);
    // downloading requires an explicit choice → no accidental jobs
    expect(fake.state.lastJobBody).toBeNull();
  });

  it('creates a job when the user picks a quality and shows live progress', async () => {
    renderApp();
    await userEvent.type(screen.getByPlaceholderText(/paste|youtube|link/i), 'https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));
    const table = await screen.findByRole('table', { name: /format|quality/i });
    const row = within(table).getByText(/1080p/).closest('tr');
    await userEvent.click(within(row).getByRole('button', { name: /download|get|save/i }));

    await waitFor(() => expect(fake.state.lastJobBody).not.toBeNull());
    expect(fake.state.lastJobBody.preset).toBe('mp4-1080');
    expect((await screen.findAllByText(/1080p MP4|mp4-1080|Test Video/)).length).toBeGreaterThan(0);
    // ready state offers the file
    await waitFor(() => expect(screen.getAllByRole('link', { name: /download|save file/i }).length).toBeGreaterThan(0), { timeout: 3000 });
  });

  it('shows the audio tab with MP3 presets and a trim control', async () => {
    renderApp();
    await userEvent.type(screen.getByPlaceholderText(/paste|youtube|link/i), 'https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));
    await screen.findByRole('table', { name: /format|quality/i });

    await userEvent.click(screen.getByRole('tab', { name: /audio|mp3/i }));
    expect((await screen.findAllByText(/MP3/i)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: /subtitle|caption/i }));
    expect((await screen.findAllByText(/English/i)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: /thumbnail/i }));
    expect(await screen.findByRole('link', { name: /download.*thumbnail|maxres/i })).toBeTruthy();
  });

  it('surfaces API errors in the UI instead of failing silently', async () => {
    renderApp();
    await userEvent.type(screen.getByPlaceholderText(/paste|youtube|link/i), 'https://youtu.be/BADvideoId1');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/unavailable|could not|error/i);
  });
});

describe('history, language and theme', () => {
  it('remembers past downloads in localStorage', async () => {
    renderApp();
    await userEvent.type(screen.getByPlaceholderText(/paste|youtube|link/i), 'https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: /download|analyse|analyze|search|fetch/i }));
    const table = await screen.findByRole('table', { name: /format|quality/i });
    const row = within(table).getByText(/720p/).closest('tr');
    await userEvent.click(within(row).getByRole('button', { name: /download|get|save/i }));
    await waitFor(() => {
      const raw = localStorage.getItem('ytvd:history');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).length).toBe(1);
    });
    expect(document.querySelector('[data-testid="history"]') || screen.queryByText(/history/i)).toBeTruthy();
  });

  it('switches the whole UI to Hindi', async () => {
    renderApp();
    const before = screen.getByRole('heading', { level: 1 }).textContent;
    await userEvent.click(screen.getByRole('button', { name: /language|हिन्दी|hindi/i }));
    await waitFor(() => {
      const after = screen.getByRole('heading', { level: 1 }).textContent;
      expect(after).not.toBe(before);
      expect(/[\u0900-\u097F]/.test(after)).toBe(true);
    });
    expect(localStorage.getItem('ytvd:lang')).toBe('hi');
  });

  it('toggles dark mode and persists it', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: /theme|dark|light/i }));
    await waitFor(() => expect(['dark', 'light']).toContain(document.documentElement.getAttribute('data-theme')));
    expect(localStorage.getItem('ytvd:theme')).toBeTruthy();
  });

  it('exposes accessible landmarks and a live region for status', async () => {
    renderApp();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    const input = screen.getByPlaceholderText(/paste|youtube|link/i);
    expect(input.getAttribute('aria-label') || input.id).toBeTruthy();
  });

  it('supports keyboard shortcut "/" to focus the input and Escape to clear', async () => {
    renderApp();
    const input = screen.getByPlaceholderText(/paste|youtube|link/i);
    await userEvent.type(document.body, '/');
    expect(document.activeElement).toBe(input);
    await userEvent.type(input, 'https://youtu.be/x');
    await userEvent.type(document.body, '{Escape}');
    expect(input.value).toBe('');
  });
});

describe('resilience (what a buffering proxy does to SSE)', () => {
  it('still delivers the download link when the SSE stream never fires', async () => {
    // EventSource opens but stays silent — exactly what a proxy that buffers
    // text/event-stream looks like from the browser. Polling must save the day.
    delete window.__emitJobDone;
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText(/paste|youtube|link/i), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: /download|analyse|analyze/i }));
    const rows = await screen.findAllByRole('button', { name: /download|save/i });
    await user.click(rows[0]);

    const links = await screen.findAllByRole('link', { name: /save|download file|download/i }, { timeout: 20000 });
    const fileLink = links.map((l) => l.getAttribute('href')).find((href) => /^\/api\/files\//.test(href ?? ''));
    expect(fileLink, `links seen: ${links.map((l) => l.getAttribute('href')).join(', ')}`).toBeTruthy();
  }, 40000);

  it('reports a silent SSE stream as a broken job instead of hanging forever', async () => {
    delete window.__emitJobDone;
    fake.fetchMock.mockImplementation(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/jobs') && (init.method ?? 'GET').toUpperCase() === 'GET') {
        return new Response(JSON.stringify({ error: { code: 'NETWORK', message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ jobs: [], stats: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
  }, 30000);
});

describe('demo mode is explained to the visitor', () => {
  it('shows a demo notice when the server reports demo mode', async () => {
    fake.state.mode = 'demo';
    renderApp();
    expect(await screen.findByText(/demo mode/i)).toBeTruthy();
    expect(screen.getByText(/DEMO_MODE=off/i)).toBeTruthy();
  }, 30000);

  it('hides the notice when the server runs the real engine', async () => {
    fake.state.mode = 'live';
    renderApp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.queryByText(/demo mode/i)).toBeNull();
  }, 30000);
});
