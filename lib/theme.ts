export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'trade-journal-theme';
const THEME_CHANGE_EVENT = 'trade-journal-theme-change';

export function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveThemeDark(mode: ThemeMode, systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  return mode === 'dark' || (mode === 'system' && systemDark);
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  const dark = resolveThemeDark(mode);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // The theme still applies for this session when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { mode, dark } }));
}

export const themeChangeEvent = THEME_CHANGE_EVENT;
