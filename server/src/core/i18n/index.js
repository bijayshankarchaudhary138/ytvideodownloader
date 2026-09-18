import { en } from './en.js';
import { hi } from './hi.js';

const DICTS = { en, hi };
export const DEFAULT_LANGUAGE = 'en';

export function hasLanguage(code) {
  return Object.prototype.hasOwnProperty.call(DICTS, String(code ?? '').toLowerCase());
}

export function listLanguages() {
  return [
    { code: 'en', label: en['language.name'], native: 'English' },
    { code: 'hi', label: hi['language.name'], native: 'हिन्दी' },
  ];
}

/** Translate a key with `{placeholder}` interpolation and en → key fallback. */
export function translate(lang, key, vars = {}) {
  const dict = DICTS[String(lang ?? '').toLowerCase()] ?? en;
  const template = dict[key] ?? en[key] ?? key;
  if (!template.includes('{')) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

export { en, hi };
