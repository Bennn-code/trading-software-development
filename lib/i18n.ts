import { Converter } from 'opencc-js/t2cn';
import en from './locales/en.json';
import yue from './locales/yue.json';
import { legalCantonese, legalEnglish } from './locales/legal';
export type Language = 'zh-Hant' | 'zh-Hans' | 'yue-Hant' | 'en';
export function validLanguage(value: unknown): value is Language { return value === 'zh-Hant' || value === 'zh-Hans' || value === 'yue-Hant' || value === 'en'; }
const simplified = Converter({ from: 'tw', to: 'cn' });
const english = { ...en, ...legalEnglish } as Record<string, string>;
const cantonese = { ...yue, ...legalCantonese } as Record<string, string>;
export function translate(text: string, language: Language, values: unknown[] = []): string {
  let translated = language === 'zh-Hans' ? simplified(text) : language === 'yue-Hant' ? cantonese[text] ?? text : language === 'en' ? english[text] ?? text : text;
  if (language === 'en' && !english[text]) {
    const ordinals: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
    translated = text.replace(/^(\d{4})\/(\d{1,2})月第([一二三四五])週$/, (_, y, m, n) => `${y}/${m} · Week ${ordinals[n]}`)
      .replace(/^(\d{4})年第([一二三四])季$/, (_, y, n) => `${y} Q${ordinals[n]}`)
      .replace(/^(\d{4})年$/, '$1');
  }
  return translated.replace(/\{(\d+)\}/g, (match, n) => Number(n) < values.length ? String(values[Number(n)] ?? '') : match);
}
