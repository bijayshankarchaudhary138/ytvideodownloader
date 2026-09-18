/**
 * Front-end i18n. The dictionaries are shared with the server so the UI and the
 * API speak exactly the same language (one source of truth, no drift).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en } from '@server/core/i18n/en.js';
import { hi } from '@server/core/i18n/hi.js';

export const DICTIONARIES = { en, hi };
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];
const STORAGE_KEY = 'ytvd:lang';

export function detectLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && DICTIONARIES[stored]) return stored;
    const param = new URLSearchParams(window.location.search).get('lang');
    if (param && DICTIONARIES[param]) return param;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (DICTIONARIES[nav]) return nav;
  } catch { /* SSR / private mode */ }
  return 'en';
}

export function translate(lang, key, vars = {}) {
  const dict = DICTIONARIES[lang] ?? en;
  const template = dict[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

const I18nContext = createContext({ lang: 'en', t: (k) => k, setLang: () => {} });

export function I18nProvider({ children, initialLang = null }) {
  const [lang, setLangState] = useState(() => initialLang ?? detectLanguage());

  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const value = useMemo(() => ({ lang, t: (key, vars) => translate(lang, key, vars), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
