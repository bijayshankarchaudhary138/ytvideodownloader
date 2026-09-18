import React, { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { Link } from './Layout.jsx';
import { FaqSection, HowToSection } from './Home.jsx';
import { openApi } from '../lib/api.js';

export function UseApi() {
  return (
    <>
      <HowToSection />
      <FaqSection />
    </>
  );
}

export function ApiDocsPage() {
  const { t } = useI18n();
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    openApi().then(setSpec).catch(() => setError(true));
  }, []);

  const endpoints = spec
    ? Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, definition]) => ({ path, method: method.toUpperCase(), summary: definition.summary ?? '' })))
    : [];

  return (
    <section className="page" aria-labelledby="api-title">
      <h1 id="api-title">{t('api.title')}</h1>
      <p>{t('api.body')}</p>
      <p>
        <a className="primary-btn" href="/api/openapi.json" target="_blank" rel="noreferrer">{t('api.docs')}</a>
      </p>

      <h2>Endpoints</h2>
      {error ? <p className="error" role="alert">Could not load the OpenAPI document.</p> : null}
      <div className="table-wrap">
        <table aria-label="API endpoints">
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Path</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {(endpoints.length ? endpoints : FALLBACK_ENDPOINTS).map((endpoint) => (
              <tr key={`${endpoint.method}-${endpoint.path}`}>
                <td><code>{endpoint.method}</code></td>
                <td><code>{endpoint.path}</code></td>
                <td className="muted">{endpoint.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Quick start</h2>
      <pre className="code-block">{QUICK_START}</pre>
      <p className="muted">
        Prefer a UI? <Link to="/">{t('nav.home')}</Link>
      </p>
    </section>
  );
}

const FALLBACK_ENDPOINTS = [
  { method: 'GET', path: '/api/health', summary: 'Service health and engine availability' },
  { method: 'GET', path: '/api/meta', summary: 'Presets, limits and languages' },
  { method: 'POST', path: '/api/info', summary: 'Resolve a video or playlist URL' },
  { method: 'POST', path: '/api/jobs', summary: 'Create a download job' },
  { method: 'GET', path: '/api/jobs/{id}', summary: 'Read one job' },
  { method: 'GET', path: '/api/jobs/{id}/status', summary: 'Lightweight polling endpoint' },
  { method: 'POST', path: '/api/jobs/{id}/cancel', summary: 'Cancel a job' },
  { method: 'POST', path: '/api/jobs/{id}/retry', summary: 'Retry a failed job' },
  { method: 'GET', path: '/api/files/{id}', summary: 'Download the finished file (Range supported)' },
  { method: 'POST', path: '/api/batch', summary: 'Queue a playlist or several URLs' },
  { method: 'GET', path: '/api/batch/{id}/zip', summary: 'Download everything as one ZIP' },
  { method: 'GET', path: '/api/events', summary: 'Server-Sent Events with live progress' },
];

const QUICK_START = `# 1. metadata + every available format
curl -s -X POST http://localhost:8080/api/info \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://www.youtube.com/watch?v=VIDEO_ID"}'

# 2. queue a 1080p download (video+audio are merged with ffmpeg)
curl -s -X POST http://localhost:8080/api/jobs \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://www.youtube.com/watch?v=VIDEO_ID","preset":"mp4-1080"}'

# 3. watch progress live
curl -N http://localhost:8080/api/events

# 4. save the file
curl -OJ http://localhost:8080/api/files/JOB_ID`;

export function LegalPage({ kind }) {
  const { t } = useI18n();
  const title = kind === 'privacy' ? t('privacy.title') : t('terms.title');
  const body = kind === 'privacy' ? t('privacy.body') : t('terms.body');
  return (
    <section className="page" aria-labelledby="legal-title">
      <h1 id="legal-title">{title}</h1>
      <p>{body}</p>
      <h2>{kind === 'privacy' ? 'What we never do' : 'Your responsibility'}</h2>
      <ul>
        <li>No advertising cookies, no third-party analytics, no user profiles.</li>
        <li>No storage of your downloads beyond the automatic expiry window.</li>
        <li>Download only content you own or are licensed to use.</li>
      </ul>
      <p className="muted">{t('footer.disclaimer')}</p>
    </section>
  );
}

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="page" aria-labelledby="nf-title">
      <h1 id="nf-title">{t('error.notFound')}</h1>
      <p>{t('error.title')}</p>
      <Link className="primary-btn" to="/">{t('nav.home')}</Link>
    </section>
  );
}
