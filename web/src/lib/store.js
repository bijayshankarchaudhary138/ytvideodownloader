/**
 * Minimal external store (no dependencies) + localStorage persistence for the
 * download history and user preferences.
 */
import { useSyncExternalStore } from 'react';

const HISTORY_KEY = 'ytvd:history';
const PREFS_KEY = 'ytvd:prefs';
const HISTORY_LIMIT = 50;

function initialState() {
  return {
    meta: null,
    health: null,
    info: null,
    infoUrl: null,
    loading: false,
    error: null,
    jobs: [],
    batches: [],
    history: loadHistory(),
    toasts: [],
    tab: 'video',
    trim: { start: '', end: '' },
    subtitle: { lang: 'en', auto: false },
    presets: [],
    historyOpen: false,
  };
}

let state = initialState();
const listeners = new Set();

function readStorage(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function loadHistory() {
  const list = readStorage(HISTORY_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addHistory(entry) {
  const history = [{ ...entry, at: Date.now() }, ...loadHistory().filter((h) => h.id !== entry.id)].slice(0, HISTORY_LIMIT);
  writeStorage(HISTORY_KEY, history);
  setState({ history });
  return history;
}

export function clearHistory() {
  writeStorage(HISTORY_KEY, []);
  setState({ history: [] });
}

export function loadPrefs() {
  return readStorage(PREFS_KEY, {});
}

export function savePrefs(patch) {
  writeStorage(PREFS_KEY, { ...loadPrefs(), ...patch });
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const listener of listeners) listener();
  return state;
}

/** Merge a job update coming from the API/SSE into the list. */
export function upsertJob(job) {
  if (!job?.id) return state;
  const jobs = [...state.jobs];
  const index = jobs.findIndex((j) => j.id === job.id);
  if (index === -1) jobs.unshift(job);
  else jobs[index] = { ...jobs[index], ...job };
  return setState({ jobs });
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetStore() {
  try {
    globalThis.localStorage?.removeItem(HISTORY_KEY);
    globalThis.localStorage?.removeItem('ytvd:lang');
    globalThis.localStorage?.removeItem('ytvd:theme');
  } catch { /* ignore */ }
  state = initialState();
  for (const listener of listeners) listener();
}

export function toast(message, kind = 'info') {
  const id = Math.random().toString(36).slice(2);
  setState((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
}

export function useAppStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}
