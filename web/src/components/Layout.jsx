import React, { useEffect, useState } from 'react';
import { useI18n, LANGUAGES } from '../lib/i18n.jsx';
import { getInitialTheme, toggleTheme } from '../lib/theme.js';
import { useAppStore, setState } from '../lib/store.js';

const NAV = [
  { path: '/', key: 'nav.home' },
  { path: '/how-to', key: 'nav.howto' },
  { path: '/faq', key: 'nav.faq' },
  { path: '/api-docs', key: 'nav.api' },
  { path: '/privacy', key: 'nav.privacy' },
  { path: '/terms', key: 'nav.terms' },
];

export function navigate(path, { replace = false } = {}) {
  if (window.location.pathname === path) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Link({ to, children, ...rest }) {
  return (
    <a
      href={to}
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Header({ path, onOpenHistory }) {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

  return (
    <header className="site-header" role="banner">
      <div className="shell header-inner">
        <Link to="/" className="brand" aria-label="YouTube Video Downloader — home">
          <span className="brand-mark" aria-hidden="true">▶</span>
          <span className="brand-text">
            <strong>YT Downloader</strong>
            <small>Ad-free downloads</small>
          </span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">{t('nav.home')}</span>
        </button>

        <nav id="primary-nav" className="primary-nav" aria-label="Main" data-open={open ? 'true' : 'false'}>
          {NAV.map((item) => (
            <Link key={item.path} to={item.path} aria-current={path === item.path ? 'page' : undefined}>
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <button type="button" className="ghost-btn" onClick={onOpenHistory} aria-label={t('nav.history')}>
            <span aria-hidden="true">🕘</span>
            <span className="hide-sm">{t('nav.history')}</span>
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
            aria-label={`${t('a11y.language')} — ${lang === 'hi' ? 'English' : 'हिन्दी'}`}
            title={LANGUAGES.map((l) => l.label).join(' / ')}
          >
            <span aria-hidden="true">🌐</span>
            <span>{lang === 'hi' ? 'EN' : 'हिं'}</span>
          </button>
          <button
            type="button"
            className="ghost-btn"
            aria-label={t('a11y.theme')}
            title={t('a11y.theme')}
            onClick={() => setTheme(toggleTheme(theme))}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '🌙'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="shell footer-grid">
        <div>
          <h2 className="footer-title">YT Downloader</h2>
          <p>{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.links')}>
          <h3>{t('footer.links')}</h3>
          <ul>
            <li><Link to="/">{t('nav.home')}</Link></li>
            <li><Link to="/how-to">{t('nav.howto')}</Link></li>
            <li><Link to="/faq">{t('nav.faq')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.api')}>
          <h3>{t('footer.api')}</h3>
          <ul>
            <li><Link to="/api-docs">{t('api.title')}</Link></li>
            <li><a href="/api/openapi.json">OpenAPI</a></li>
            <li><a href="/robots.txt">robots.txt</a></li>
            <li><a href="/sitemap.xml">sitemap.xml</a></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.legal')}>
          <h3>{t('footer.legal')}</h3>
          <ul>
            <li><Link to="/privacy">{t('nav.privacy')}</Link></li>
            <li><Link to="/terms">{t('nav.terms')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="shell footer-bottom">
        <p>{t('footer.disclaimer')}</p>
        <p className="muted">MIT licensed · self-hostable · no tracking</p>
      </div>
    </footer>
  );
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.message}</div>
      ))}
    </div>
  );
}

export function LiveRegion({ message }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message}
    </p>
  );
}

export { setState };
