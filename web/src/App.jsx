import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { I18nProvider, useI18n, useT } from './lib/i18n.jsx';
import {
  getInfo, getMeta, getHealth, createJob, cancelJob, retryJob, deleteJob, subscribeEvents,
} from './lib/api.js';
import { addHistory, getState, setState, toast, upsertJob, useAppStore } from './lib/store.js';
import { Header, Footer, Toasts, LiveRegion } from './components/Layout.jsx';
import { Hero, UrlForm, FeatureGrid, HowToSection, FaqSection, HistoryPanel } from './components/Home.jsx';
import { VideoCard, errorKey } from './components/Result.jsx';
import { QueuePanel } from './components/Queue.jsx';
import { ApiDocsPage, LandingPage, LegalPage, NotFoundPage, UseApi } from './components/Pages.jsx';
import { SEO_PAGES } from '@server/seo/pages.js';

const ROUTES = {
  '/': 'home',
  '/how-to': 'howto',
  '/faq': 'faq',
  '/api-docs': 'api',
  '/privacy': 'privacy',
  '/terms': 'terms',
  // One landing route per keyword cluster, generated from the SEO catalogue.
  ...Object.fromEntries(SEO_PAGES.map((page) => [page.slug, 'landing'])),
};

function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

function useKeyboardShortcuts({ inputRef, setValue }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setValue('');
        inputRef.current?.blur?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [inputRef, setValue]);
}

function AppShell() {
  const { t, lang } = useI18n();
  const path = useRouter();
  const route = ROUTES[path] ?? 'notfound';
  const inputRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busyJob, setBusyJob] = useState(false);
  const [status, setStatus] = useState('');

  const info = useAppStore((s) => s.info);
  const loading = useAppStore((s) => s.loading);
  const error = useAppStore((s) => s.error);
  const meta = useAppStore((s) => s.meta);
  const tab = useAppStore((s) => s.tab);
  const trim = useAppStore((s) => s.trim);
  const subtitle = useAppStore((s) => s.subtitle);
  const historyOpen = useAppStore((s) => s.historyOpen);
  const infoUrl = useAppStore((s) => s.infoUrl);
  const health = useAppStore((s) => s.health);

  // The crawlable shell must disappear as soon as React renders.
  useLayoutEffect(() => {
    document.getElementById('seo-shell')?.remove();
  }, []);

  useEffect(() => {
    getMeta().then((data) => setState({ meta: data })).catch(() => { /* UI still works without meta */ });
    getHealth().then((data) => setState({ health: data })).catch(() => { /* banner is optional */ });
  }, []);

  const hasActiveJobs = useCallback(
    () => (getState().jobs ?? []).some((job) => ['queued', 'downloading', 'processing'].includes(job.status)),
    [],
  );

  useEffect(() => subscribeEvents({
    onUpdate: (job) => upsertJob(job),
    onProgress: ({ id, progress, job }) => upsertJob(job ?? { id, progress }),
    onDone: (job) => {
      upsertJob(job);
      if (job.status === 'ready') {
        setStatus(t('job.ready'));
        addHistory({
          id: job.id,
          title: job.title ?? job.filename,
          url: job.url ?? infoUrl,
          preset: job.preset,
          fileUrl: job.fileUrl,
          size: job.size ?? null,
        });
      }
    },
  }, { hasActiveJobs }), [infoUrl, t, hasActiveJobs]);

  useKeyboardShortcuts({ inputRef, setValue: setUrl });

  const analyse = useCallback(async (link) => {
    setState({ loading: true, error: null });
    setStatus(t('job.processing'));
    try {
      const data = await getInfo(link);
      setState({ info: data, infoUrl: link, loading: false, error: null, tab: 'video' });
      setStatus(data.video?.title ?? '');
    } catch (err) {
      setState({ loading: false, error: t(`error.${errorKey(err.code)}`), info: null });
    }
  }, [t]);

  const download = useCallback(async ({ preset, kind, trim: trimRange, subtitle: subtitleChoice, row }) => {
    if (!infoUrl) return;
    setBusyJob(true);
    try {
      const { job } = await createJob({
        url: infoUrl,
        preset,
        title: info?.video?.title ?? null,
        trim: trimRange ?? undefined,
        subtitle: subtitleChoice ?? undefined,
      });
      upsertJob(job);
      addHistory({
        id: job.id,
        title: job.title ?? info?.video?.title ?? row?.label ?? preset,
        url: infoUrl,
        preset,
        fileUrl: job.fileUrl ?? null,
      });
      setStatus(t('job.queued'));
    } catch (err) {
      const message = t(`error.${errorKey(err.code)}`);
      setState({ error: message });
      toast(message, 'error');
    } finally {
      setBusyJob(false);
    }
  }, [info, infoUrl, t]);

  const onCancel = useCallback(async (id) => {
    try { await cancelJob(id); } catch { /* the job may have finished already */ }
  }, []);
  const onRetry = useCallback(async (id) => {
    try {
      const { job } = await retryJob(id);
      upsertJob(job);
    } catch { toast(t('sfx.tryAgain'), 'error'); }
  }, [t]);
  const onRemove = useCallback(async (id) => {
    try { await deleteJob(id); } catch { /* ignore */ }
  }, []);

  return (
    <>
      <Header path={path} onOpenHistory={() => setState({ historyOpen: !historyOpen })} />

      <main id="main" className="shell">
        {route === 'home' ? (
          <>
            <Hero>
              <UrlForm
                onAnalyse={analyse}
                loading={loading}
                inputRef={inputRef}
                value={url}
                setValue={setUrl}
              />
            </Hero>

            {health?.mode === 'demo' ? (
              <p className="notice demo-notice" role="status">
                <strong>{t('demo.title')}</strong> {t('demo.body')}
              </p>
            ) : null}

            {error ? <p className="error banner-error" role="alert">{error}</p> : null}

            {info ? (
              <VideoCard
                info={info}
                meta={meta}
                tab={tab}
                setTab={(next) => setState({ tab: next })}
                trim={trim}
                setTrim={(next) => setState({ trim: next })}
                subtitle={subtitle}
                setSubtitle={(next) => setState({ subtitle: next })}
                onDownload={download}
                busyJob={busyJob}
              />
            ) : null}

            <QueuePanel onCancel={onCancel} onRetry={onRetry} onRemove={onRemove} />
            <HistoryPanel open={historyOpen} onClose={() => setState({ historyOpen: false })} />
            <FeatureGrid />
            <HowToSection />
            <FaqSection />
          </>
        ) : null}

        {route === 'howto' ? <UseApi /> : null}
        {route === 'faq' ? <FaqSection /> : null}
        {route === 'api' ? <ApiDocsPage /> : null}
        {route === 'privacy' ? <LegalPage kind="privacy" /> : null}
        {route === 'terms' ? <LegalPage kind="terms" /> : null}
        {route === 'landing' ? <LandingPage slug={path} /> : null}
        {route === 'notfound' ? <NotFoundPage /> : null}

        <LiveRegion message={status} />
      </main>

      <Footer />
      <Toasts />
    </>
  );
}

export default function App({ initialLang }) {
  return (
    <I18nProvider initialLang={initialLang}>
      <AppShell />
    </I18nProvider>
  );
}
