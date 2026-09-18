/** Theme handling: follows the OS by default, remembers an explicit choice. */
export const THEME_KEY = 'ytvd:theme';

export function systemTheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* ignore */ }
  return systemTheme();
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  try {
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem(THEME_KEY, next);
  } catch { /* ignore */ }
  return next;
}

export function toggleTheme(current) {
  return applyTheme(current === 'dark' ? 'light' : 'dark');
}
