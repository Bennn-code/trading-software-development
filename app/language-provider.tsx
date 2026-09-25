'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadTranslator, translate, validLanguage, type Language, type Translator } from '@/lib/i18n';
import { getAccountBootstrap, updateAccountBootstrap } from '@/lib/account-client';
const defaultContext: {language:Language;setLanguage:(language:Language)=>void;t:Translator;preferenceError:string} = { language: 'zh-Hant', setLanguage: () => {}, t: (text: string, values?: unknown[]) => translate(text, 'zh-Hant', values), preferenceError: '' };
const LanguageContext = createContext(defaultContext);
export function LanguageProvider({ children, initialLanguage = 'zh-Hant' }: { children: React.ReactNode; initialLanguage?: Language }) {
  const [language, update] = useState<Language>(initialLanguage), [preferenceError, setError] = useState('');
  const [translator, setTranslator] = useState<Translator>(() => (text:string, values?:unknown[]) => translate(text, 'zh-Hant', values));
  const manual = useRef(false), saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    try { const saved = localStorage.getItem('trade-journal-language'); if (validLanguage(saved)) queueMicrotask(() => { if (active) update(saved); }); } catch {}
    getAccountBootstrap().then(data => { if (!manual.current && validLanguage(data?.language)) update(data.language); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('trade-journal-language', language); } catch {} }, [language]);
  useEffect(() => {
    let active = true;
    loadTranslator(language).then(next => { if (active) setTranslator(() => next); }).catch(() => {
      if (active) setTranslator(() => (text:string, values?:unknown[]) => translate(text, language, values));
    });
    return () => { active = false; };
  }, [language]);
  const value = useMemo(() => ({ language, preferenceError, t: translator, setLanguage: (next: Language) => {
    manual.current = true; update(next); setError('');
    // Serialize preference writes so rapid changes cannot overwrite the newest choice.
    saveQueue.current = saveQueue.current.then(async () => { try { const r = await fetch('/api/account/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) }); if (!r.ok && r.status !== 401) throw new Error(); updateAccountBootstrap(current=>({...current,language:next,preferences:current.preferences?{...current.preferences,language:next}:null})); } catch { setError('語言已在此瀏覽器切換，但帳號同步失敗，請稍後再試。'); } });
  } }), [language, preferenceError, translator]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }
