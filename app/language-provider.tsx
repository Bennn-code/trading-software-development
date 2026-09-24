'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { translate, validLanguage, type Language } from '@/lib/i18n';
import { getAccountBootstrap, updateAccountBootstrap } from '@/lib/account-client';
const defaultContext = { language: 'zh-Hant' as Language, setLanguage: (_: Language) => {}, t: (text: string, values?: unknown[]) => translate(text, 'zh-Hant', values), preferenceError: '' };
const LanguageContext = createContext(defaultContext);
export function LanguageProvider({ children, initialLanguage = 'zh-Hant' }: { children: React.ReactNode; initialLanguage?: Language }) {
  const [language, update] = useState<Language>(initialLanguage), [preferenceError, setError] = useState('');
  const manual = useRef(false), saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    try { const saved = localStorage.getItem('trade-journal-language'); if (validLanguage(saved)) update(saved); } catch {}
    getAccountBootstrap().then(data => { if (!manual.current && validLanguage(data?.language)) update(data.language); }).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('trade-journal-language', language); } catch {} }, [language]);
  const value = useMemo(() => ({ language, preferenceError, t: (text: string, values?: unknown[]) => translate(text, language, values), setLanguage: (next: Language) => {
    manual.current = true; update(next); setError('');
    // Serialize preference writes so rapid changes cannot overwrite the newest choice.
    saveQueue.current = saveQueue.current.then(async () => { try { const r = await fetch('/api/account/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) }); if (!r.ok && r.status !== 401) throw new Error(); updateAccountBootstrap(current=>({...current,language:next,preferences:current.preferences?{...current.preferences,language:next}:null})); } catch { setError('語言已在此瀏覽器切換，但帳號同步失敗，請稍後再試。'); } });
  } }), [language, preferenceError]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }
