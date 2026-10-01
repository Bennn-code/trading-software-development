'use client';
import { useEffect, useState } from 'react';
import { Choice } from './trade-fields';
import { useI18n } from './language-provider';
import type { CryptoQuoteSource } from '@/lib/market-candles';

const sources: CryptoQuoteSource[] = ['auto', 'okx', 'bybit', 'bingx'];
export function useCryptoQuoteSource() {
  const [source, setSource] = useState<CryptoQuoteSource>('auto');
  useEffect(() => {
    const timer = setTimeout(() => { try { const saved = localStorage.getItem('trade-crypto-quote-source'); if (sources.includes(saved as CryptoQuoteSource)) setSource(saved as CryptoQuoteSource); } catch {} }, 0);
    return () => clearTimeout(timer);
  }, []);
  return [source, (next: CryptoQuoteSource) => { setSource(next); try { localStorage.setItem('trade-crypto-quote-source', next); } catch {} }] as const;
}
export default function CryptoQuoteSourceSelect({ value, busy, onChange }: { value: CryptoQuoteSource; busy: boolean; onChange: (source: CryptoQuoteSource) => void }) {
  const { t } = useI18n();
  return <fieldset className="crypto-quote-source" disabled={busy}><Choice label={t('加密歷史行情來源')} value={value} options={[["auto",t('自動（OKX → Bybit → BingX）')],["okx","OKX"],["bybit","Bybit"],["bingx","BingX"]]} onChange={next => { if (sources.includes(next as CryptoQuoteSource)) onChange(next as CryptoQuoteSource); }}/></fieldset>;
}
