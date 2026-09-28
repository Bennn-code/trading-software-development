'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator, loadTranslator, translate, validLanguage, type Language, type LocaleResources, type Translator } from '@/lib/i18n';
import { getAccountBootstrap, updateAccountBootstrap } from '@/lib/account-client';

const defaultContext: { language: Language; setLanguage: (language: Language) => void; t: Translator; preferenceError: string } = {
  language: 'zh-Hant',
  setLanguage: () => {},
  t: (text: string, values?: unknown[]) => translate(text, 'zh-Hant', values),
  preferenceError: '',
};
const LanguageContext = createContext(defaultContext);

function persistLanguageCookie(language: Language) {
  try { document.cookie = `trade-journal-language=${language}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch {}
}

export function LanguageProvider({ children, initialLanguage = 'zh-Hant', initialResources = {} }: {
  children: React.ReactNode;
  initialLanguage?: Language;
  initialResources?: LocaleResources;
}) {
  const [language, update] = useState<Language>(initialLanguage);
  const [translator, setTranslator] = useState<Translator>(() => createTranslator(initialLanguage, initialResources));
  const [preferenceError, setError] = useState('');
  const manual = useRef(false);
  const translationRequest = useRef(0);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    const applySavedLanguage = (next: Language) => {
      if (next === initialLanguage) return;
      const request = ++translationRequest.current;
      void loadTranslator(next).then(nextTranslator => {
        if (!active || request !== translationRequest.current || manual.current) return;
        update(next);
        setTranslator(() => nextTranslator);
        persistLanguageCookie(next);
      }).catch(() => {});
    };

    try {
      const saved = localStorage.getItem('trade-journal-language');
      if (validLanguage(saved)) queueMicrotask(() => { if (active) applySavedLanguage(saved); });
    } catch {}

    getAccountBootstrap().then(data => {
      if (!manual.current && validLanguage(data?.language)) applySavedLanguage(data.language);
    }).catch(() => {});

    return () => { active = false; };
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem('trade-journal-language', language); } catch {}
  }, [language]);

  const setLanguage = (next: Language) => {
    manual.current = true;
    const request = ++translationRequest.current;
    setError('');
    void loadTranslator(next).then(nextTranslator => {
      if (request !== translationRequest.current) return;
      update(next);
      setTranslator(() => nextTranslator);
      persistLanguageCookie(next);
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const response = await fetch('/api/account/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next }) });
          if (!response.ok && response.status !== 401) throw new Error();
          updateAccountBootstrap(current => ({ ...current, language: next, preferences: current.preferences ? { ...current.preferences, language: next } : null }));
        } catch {
          setError('語言已在此瀏覽器切換，但帳號同步失敗，請稍後再試。');
        }
      });
    }).catch(() => setError('語言載入失敗，請重試。'));
  };

  const value = useMemo(() => ({ language, preferenceError, t: translator, setLanguage }), [language, preferenceError, translator]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() { return useContext(LanguageContext); }
