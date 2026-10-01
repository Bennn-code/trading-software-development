'use client';
import { useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from './language-provider';
import type { QuoteKeys } from '@/lib/market-candles';

const providers = [
  { id: 'fugle', name: 'Fugle', market: '台股與台指期', note: 'Fugle 使用 1／5／15 分鐘、1 小時或日線；台指期須填確切月份並查日夜盤。夜盤日線缺少實際日期時不估算。', docs: 'https://developer.fugle.tw/docs/data-futopt/http-api/historical/candles/' },
  { id: 'twelveData', name: 'Twelve Data', market: '美股、港股與 A 股', note: '股票僅分析一般交易時段；海外市場、分鐘及 4 小時行情依方案授權，查不到會嘗試日線。', docs: 'https://support.twelvedata.com/en/articles/5214728-getting-historical-data' },
  { id: 'databento', name: 'Databento', market: 'CME 美股期貨', note: 'Databento 使用 CME 的 1 分鐘、1 小時或日線，需 GLBX.MDP3 權限及確切合約；查詢可能收費。', docs: 'https://databento.com/docs/api-reference-historical' },
] as const;

export default function MarketDataSettings({ keys, busy, onApply }: { keys: QuoteKeys; busy: boolean; onApply: (keys: QuoteKeys) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <><button type="button" className="outline-button" disabled={busy} onClick={() => setOpen(true)}>{t('行情金鑰')}</button>{open && <KeyDialog keys={keys} onClose={() => setOpen(false)} onApply={onApply} t={t}/>}</>;
}

function KeyDialog({ keys, onClose, onApply, t }: { keys: QuoteKeys; onClose: () => void; onApply: (keys: QuoteKeys) => void; t: (text: string) => string }) {
  const id = useId();
  const [draft, setDraft] = useState<QuoteKeys>({ ...keys });
  const [authorized, setAuthorized] = useState(false);
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="quote-key-dialog"><DialogHeader><DialogTitle>{t('本次行情金鑰')}</DialogTitle><DialogDescription>{t('金鑰只供目前頁面分析；不保存於交易、瀏覽器儲存、資料庫或匯出備份。離開頁面或重新載入後須重新輸入。')}</DialogDescription></DialogHeader>
    <form autoComplete="off" onSubmit={event => { event.preventDefault(); const next = Object.fromEntries(Object.entries(draft).flatMap(([name, value]) => value?.trim() ? [[name, value.trim()]] : [])); onApply(next); onClose(); }}>
      <div className="quote-provider-grid">{providers.map(provider => <section className="quote-provider" key={provider.id}><div><strong>{provider.name}</strong><span>{t(provider.market)}</span></div><label htmlFor={`${id}-${provider.id}`}>API Key</label><Input id={`${id}-${provider.id}`} type="password" autoComplete="off" spellCheck={false} minLength={8} maxLength={200} pattern="[A-Za-z0-9_.-]+" value={draft[provider.id] ?? ''} placeholder={t('未設定')} onChange={event => setDraft(previous => ({ ...previous, [provider.id]: event.target.value }))}/><p>{t(provider.note)}</p><a href={provider.docs} target="_blank" rel="noopener noreferrer">{t('官方操作說明')}</a></section>)}</div>
      <p className="quote-key-note">{t('只查固定的歷史行情端點，不下單、不轉帳、不提款。供應商可能扣除查詢額度或收費；請先確認方案與資料授權。')}</p>
      <label className="quote-key-consent"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)}/>{t('我確認行情授權與供應商費用，同意使用這些金鑰分析目前交易。')}</label>
      <div className="quote-key-actions"><button type="button" className="outline-button" onClick={() => { onApply({}); onClose(); }}>{t('清除本次金鑰')}</button><button type="submit" className="primary-button" disabled={!authorized}>{t('套用並分析')}</button></div>
    </form>
  </DialogContent></Dialog>;
}
