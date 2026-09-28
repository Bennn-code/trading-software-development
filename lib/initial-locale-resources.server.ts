import englishLocale from './locales/en.json';
import cantoneseLocale from './locales/yue.json';
import { legalEnglish, legalCantonese } from './locales/legal';
import { Converter } from 'opencc-js/t2cn';
import type { Language, LocaleResources } from './i18n';

const english = { ...englishLocale, ...legalEnglish } as Record<string, string>;
const cantonese = { ...cantoneseLocale, ...legalCantonese } as Record<string, string>;
const convert = Converter({ from: 'tw', to: 'cn' });
const simplified = Object.fromEntries([...new Set([...Object.keys(english), ...Object.keys(cantonese)])].map(key => [key, convert(key)]));

/** Supplies just the selected locale to the client so SSR and hydration start in the same language. */
export function initialLocaleResources(language: Language): LocaleResources {
  if (language === 'en') return { english };
  if (language === 'yue-Hant') return { cantonese };
  if (language === 'zh-Hans') return { simplified };
  return {};
}
