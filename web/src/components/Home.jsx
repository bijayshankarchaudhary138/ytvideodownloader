import React, { useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { Link } from './Layout.jsx';
import { clearHistory, useAppStore, toast } from '../lib/store.js';
import { relativeTime } from '../lib/format.js';

export function UrlForm({ onAnalyse, loading, inputRef, value, setValue }) {
  const { t } = useI18n();
  const [localError, setLocalError] = useState(null);

  const looksLikeLink = (text) => /^https?:\/\/\S+\.\S+/.test(text.trim());

  const submit = (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) {
      setLocalError(t('error.invalidUrl'));
      return;
    }
    if (!looksLikeLink(text)) {
      setLocalError(t('error.invalidUrl'));
      return;
    }
    setLocalError(null);
    onAnalyse(text);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        setLocalError(null);
        toast(t('sfx.pasted'));
      }
    } catch {
      setLocalError(t('error.invalidUrl'));
    }
  };

  return (
    <form className="url-form" onSubmit={submit} noValidate>
      <label className="sr-only" htmlFor="video-url">{t('form.placeholder')}</label>
      <div className="url-row">
        <input
          id="video-url"
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck="false"
          name="url"
          placeholder={t('form.placeholder')}
          aria-label={t('form.placeholder')}
          aria-invalid={localError ? 'true' : 'false'}
          value={value}
          onChange={(event) => { setValue(event.target.value); if (localError) setLocalError(null); }}
        />
        <button type="button" className="ghost-btn paste-btn" onClick={paste}>{t('form.paste')}</button>
        <button type="submit" className="primary-btn" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {t('form.button')}
        </button>
      </div>
      <p className="hint">{t('form.hint')}</p>
      {localError ? <p className="error" role="alert">{localError}</p> : null}
    </form>
  );
}

export function Hero({ children }) {
  const { t } = useI18n();
  return (
    <section className="hero">
      <h1>{t('hero.title')}</h1>
      <p className="hero-lead">{t('hero.subtitle')}</p>
      {children}
      <ul className="hero-badges">
        <li>{t('hero.note')}</li>
        <li>4K · 1080p · MP3 320 kbps</li>
        <li>{t('features.f4.title')}</li>
        <li>{t('features.f5.title')}</li>
      </ul>
    </section>
  );
}

export function FeatureGrid() {
  const { t } = useI18n();
  const features = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`features.f${n}.title`),
    body: t(`features.f${n}.body`),
    icon: ['🎬', '⚡', '🚫', '🗂️', '💬', '🧩'][n - 1],
  }));
  return (
    <section className="features" aria-labelledby="features-title">
      <h2 id="features-title">{t('features.title')}</h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="feature-card">
            <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HowToSection() {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4].map((n) => t(`howto.step${n}`));
  return (
    <section className="how-to" aria-labelledby="howto-title">
      <h2 id="howto-title">{t('howto.title')}</h2>
      <ol className="steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="muted">
        <Link to="/api-docs">{t('api.body')}</Link>
      </p>
    </section>
  );
}

export function FaqSection() {
  const { t } = useI18n();
  const items = [1, 2, 3, 4, 5, 6].map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`) }));
  return (
    <section className="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">{t('faq.title')}</h2>
      <div className="faq-list">
        {items.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function HistoryPanel({ open, onClose }) {
  const { t } = useI18n();
  const history = useAppStore((s) => s.history);
  return (
    <section className="history" id="history" data-testid="history" data-open={open ? 'true' : 'false'} aria-labelledby="history-title">
      <div className="history-head">
        <h2 id="history-title">{t('history.title')}</h2>
        {onClose ? (
          <button type="button" className="ghost-btn" onClick={onClose} aria-label={t('a11y.close')}>✕</button>
        ) : null}
      </div>
      {history.length === 0 ? (
        <p className="muted">{t('history.empty')}</p>
      ) : (
        <>
          <ul className="history-list">
            {history.map((entry) => (
              <li key={`${entry.id}-${entry.at}`}>
                <div>
                  <strong>{entry.title || entry.url}</strong>
                  <small>
                    {entry.preset}
                    {entry.at ? ` · ${relativeTime(entry.at)}` : ''}
                  </small>
                </div>
                {entry.fileUrl ? <a className="ghost-btn" href={entry.fileUrl} download>{t('history.redownload')}</a> : null}
              </li>
            ))}
          </ul>
          <button type="button" className="ghost-btn" onClick={clearHistory}>{t('history.clear')}</button>
        </>
      )}
    </section>
  );
}

export function Spinner({ label }) {
  return <span className="spinner" role="progressbar" aria-label={label} />;
}
