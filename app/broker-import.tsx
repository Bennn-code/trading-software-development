'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, CircleHelp, ExternalLink, FileSpreadsheet, KeyRound, LoaderCircle, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TradeFields from './trade-fields';
import TradeDuplicateWarning from './trade-duplicate-warning';
import { brokerGuides, brokerRegionOptions, exactBrokerGuide, searchBrokerGuides, parseBrokerRows, parseCsv, type BrokerRegionFilter, type ParsedBrokerTrade } from '@/lib/broker-import';
import { apiImportGuides, exactApiImportGuide, searchApiImportGuides } from '@/lib/api-import';
import { tradeSchema, tradeIssueMessage } from '@/lib/validation';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
import { marketNames, type Trade } from '@/lib/trades';
import { useI18n } from './language-provider';

const offsets = [['0', 'UTC'], ['8', '台北 UTC+8'], ['-4', '美東夏令 UTC-4'], ['-5', '美東冬令／美中夏令 UTC-5'], ['-6', '美中冬令 UTC-6']] as const;
type ImportMethod = 'file' | 'api';

function dateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function BrokerImport({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (rows: Trade[], saved: number, skipped: number) => void }) {
  const { t: tx } = useI18n();
  const [method, setMethod] = useState<ImportMethod>('file');
  const [provider, setProvider] = useState('');
  const [apiProvider, setApiProvider] = useState('');
  const [help, setHelp] = useState(true);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<BrokerRegionFilter>('all');
  const [rows, setRows] = useState<ParsedBrokerTrade[]>([]);
  const [active, setActive] = useState(0);
  const [offset, setOffset] = useState('0');
  const [market, setMarket] = useState<Trade['market']>('futures');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<Record<string, TradeDuplicate>>({});
  const [apiStart, setApiStart] = useState(() => dateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [apiEnd, setApiEnd] = useState(() => dateInput(new Date()));
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiPassphrase, setApiPassphrase] = useState('');
  const [apiSymbol, setApiSymbol] = useState('');
  const [apiKeyVersion, setApiKeyVersion] = useState<'2' | '3'>('3');

  const guide = brokerGuides.find(item => item.id === provider);
  const apiGuide = apiImportGuides.find(item => item.id === apiProvider);
  const visibleGuides = useMemo(() => searchBrokerGuides(search, region), [search, region]);
  const visibleApiGuides = useMemo(() => searchApiImportGuides(search, region), [search, region]);
  const eligible = useMemo(() => rows.flatMap(row => {
    const parsed = tradeSchema.safeParse(row.trade);
    return parsed.success ? [parsed.data] : [];
  }), [rows]);
  const checkKey = JSON.stringify(eligible);
  const apiDateValid = !!apiStart && !!apiEnd && apiStart <= apiEnd && apiEnd <= dateInput(new Date());

  function offsetForMarket(value: Trade['market']) {
    return value === 'crypto' ? '0' : value === 'tw-stocks' || value === 'hk-stocks' || value === 'cn-stocks' ? '8' : '-5';
  }

  function selectGuide(next: typeof brokerGuides[number]) {
    setProvider(next.id);
    setMarket(next.market);
    setOffset(offsetForMarket(next.market));
    setHelp(true);
    setError('');
  }

  function selectApiGuide(next: typeof apiImportGuides[number]) {
    if (apiProvider !== next.id) { setApiKey(''); setApiSecret(''); setApiPassphrase(''); setApiSymbol(''); setApiKeyVersion('3'); }
    setApiProvider(next.id);
    setMarket(next.market);
    setHelp(true);
    setError('');
  }

  function changeSearch(value: string) {
    setSearch(value);
    if (method === 'file') {
      const exact = exactBrokerGuide(value);
      if (exact) {
        setRegion('all');
        selectGuide(exact);
        return;
      }
      const matches = searchBrokerGuides(value, region);
      if (matches.length === 1) selectGuide(matches[0]);
    } else {
      const exact = exactApiImportGuide(value);
      if (exact) {
        setRegion('all');
        selectApiGuide(exact);
        return;
      }
      const matches = searchApiImportGuides(value, region);
      if (matches.length === 1) selectApiGuide(matches[0]);
    }
  }

  function changeMethod(next: ImportMethod) {
    if (rows.length) return;
    setMethod(next);
    setApiKey('');
    setApiSecret('');
    setApiPassphrase('');
    setApiSymbol('');
    setApiKeyVersion('3');
    setSearch('');
    setRegion('all');
    setError('');
    setHelp(true);
  }

  function close() {
    setMethod('file');
    setProvider('');
    setApiProvider('');
    setHelp(true);
    setSearch('');
    setRegion('all');
    setRows([]);
    setApiKey('');
    setApiSecret('');
    setApiPassphrase('');
    setApiSymbol('');
    setApiKeyVersion('3');
    setError('');
    setBusy('');
    setDuplicates({});
    onClose();
  }

  useEffect(() => {
    if (!open || method !== 'file' || checkKey === '[]') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const trades = JSON.parse(checkKey) as Trade[];
        const response = await fetch('/api/imports/check-trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trades }), signal: controller.signal });
        const data = await response.json() as { duplicates: TradeDuplicate[]; error?: string };
        if (!response.ok) throw new Error(data.error || '無法檢查重複交易');
        const map = Object.fromEntries(data.duplicates.map(item => [item.tradeId, item]));
        setDuplicates(map);
        setRows(list => list.map(row => map[row.trade.id]?.step < 2 ? { ...row, selected: false, confirmed: false } : row));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '無法檢查重複交易');
      }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, method, checkKey]);

  async function chooseFile(file?: File) {
    if (!file || !guide) return;
    setBusy('正在讀取檔案…');
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('檔案不可超過 10 MB');
      const extension = file.name.split('.').pop()?.toLowerCase();
      let data: (string | number | boolean | Date | null | undefined)[][];
      if (extension === 'csv' || extension === 'txt') data = parseCsv(await file.text());
      else if (extension === 'xlsx' || extension === 'xls') {
        const read = (await import('read-excel-file')).default;
        data = await read(file) as (string | number | boolean | Date | null)[][];
      } else throw new Error('請選擇 CSV、XLS 或 XLSX 檔案');
      const parsed = parseBrokerRows(data, guide, Number(offset), market);
      if (!parsed.length) throw new Error('找不到可配對的完整交易欄位。請依「如何操作」匯出已平倉交易／倉位報表，或先用 Excel 整理後另存 CSV。');
      setRows(parsed);
      setActive(0);
      if (parsed.length === 50) setError('一次最多預覽 50 筆；請縮小匯出日期範圍後分批匯入。');
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : '讀取檔案失敗');
    } finally {
      setBusy('');
    }
  }

  async function importApiTrades() {
    if (!apiGuide?.liveConnector || !apiKey.trim() || !apiSecret.trim() || (apiGuide.liveConnector !== 'bybit-options' && !apiPassphrase.trim()) || (apiGuide.liveConnector === 'kucoin-uta-usdt-futures' && !apiSymbol.trim()) || !apiDateValid) return;
    const submittedKey = apiKey.trim(), submittedSecret = apiSecret.trim(), submittedPassphrase = apiPassphrase;
    setBusy('正在安全讀取交易所資料…');
    setError('');
    try {
      const response = await fetch(`/api/imports/api/${apiProvider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: submittedKey, apiSecret: submittedSecret, ...(apiGuide.liveConnector !== 'bybit-options' ? { apiPassphrase: submittedPassphrase } : {}), ...(apiGuide.liveConnector === 'kucoin-uta-usdt-futures' ? { apiKeyVersion, symbol: apiSymbol.trim().toUpperCase() } : {}), startDate: apiStart, endDate: apiEnd }),
      });
      const data = await response.json() as { trades?: Trade[]; warnings?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'API 查詢失敗，請確認唯讀金鑰和日期。');
      if (!data.trades?.length) throw new Error(apiGuide.liveConnector === 'bybit-options' ? '此日期區間沒有符合條件的 Bybit USDT 選擇權平倉紀錄。' : '此日期區間沒有可匯入的已平倉紀錄，請確認商品代碼與查詢範圍。');
      const parsed: ParsedBrokerTrade[] = data.trades.map((trade, index) => ({ trade, warnings: index === 0 ? data.warnings ?? [] : [], selected: true, confirmed: false, sourceRow: index + 1 }));
      setRows(parsed);
      setActive(0);
      setDuplicates({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API 查詢失敗，請重試。');
    } finally {
      setApiKey('');
      setApiSecret('');
      setApiPassphrase('');
      setBusy('');
    }
  }

  function update(index: number, trade: Trade) {
    setRows(list => list.map((row, rowIndex) => rowIndex === index ? { ...row, trade, confirmed: false } : row));
  }

  async function confirmDuplicate(id: string) {
    const duplicate = duplicates[id];
    if (!duplicate) return;
    setBusy('正在確認重複交易…');
    try {
      const response = await fetch('/api/imports/check-trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trades: eligible, confirm: { tradeId: id, step: duplicate.step + 1, fingerprint: duplicate.fingerprint } }) });
      const data = await response.json() as { duplicate: TradeDuplicate; error?: string };
      if (!response.ok) throw new Error(data.error || '確認失敗');
      setDuplicates(current => ({ ...current, [id]: data.duplicate }));
      if (data.duplicate.step === 2) setRows(list => list.map(row => row.trade.id === id ? { ...row, selected: true } : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '確認失敗');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    const selected = rows.filter(row => row.selected);
    if (!selected.length) { setError('請至少勾選一筆交易'); return; }
    const trades: Trade[] = [];
    for (const row of selected) {
      const parsed = tradeSchema.safeParse(row.trade);
      if (!parsed.success) {
        setActive(rows.indexOf(row));
        setError(`第 ${rows.indexOf(row) + 1} 筆資料未完整：${tradeIssueMessage(parsed.error.issues[0])}`);
        return;
      }
      if (!row.confirmed) {
        setActive(rows.indexOf(row));
        setError(`請核對第 ${rows.indexOf(row) + 1} 筆交易並勾選「已核對」`);
        return;
      }
      trades.push(parsed.data);
    }
    setBusy(`正在儲存 ${trades.length} 筆交易…`);
    setError('');
    try {
      const response = await fetch('/api/trades/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trades }) });
      const data = await response.json() as { saved: number; skipped: number; tradeDuplicates?: TradeDuplicate[]; error?: string };
      if (response.status === 409 && data.tradeDuplicates) {
        const map = Object.fromEntries(data.tradeDuplicates.map(item => [item.tradeId, item]));
        setDuplicates(previous => ({ ...previous, ...map }));
        setRows(list => list.map(row => map[row.trade.id] ? { ...row, selected: false, confirmed: false } : row));
        throw new Error('重複交易已標紅並取消勾選；請略過或完成兩次確認。');
      }
      if (!response.ok) throw new Error(data.error || '儲存失敗');
      onSaved(trades, data.saved, data.skipped);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '儲存失敗');
    } finally {
      setBusy('');
    }
  }

  const row = rows[active];
  const rowIssue = row ? tradeSchema.safeParse(row.trade) : null;
  const selectedApiMarket = apiGuide && apiGuide.markets && apiGuide.markets.length > 1;

  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) close(); }}>
    <DialogContent className="broker-import-dialog">
      <DialogHeader>
        <DialogTitle>{tx('交易所匯入')}</DialogTitle>
        <DialogDescription>{method === 'file' ? tx('只讀取你選擇的 CSV／Excel；先預覽核對，再寫入交易紀錄。') : tx('API 與檔案匯入分開顯示；Bybit、Bitget、OKX 和 KuCoin 提供網站唯讀連線，其他來源仍是支援指南。本站沒有下單、轉帳或提款功能。')}</DialogDescription>
      </DialogHeader>

      {!rows.length ? <>
        <div className="broker-import-start">
          <section className="broker-catalog">
            <div className="broker-catalog-heading">
              <h3>{tx('1. 選擇交易所或券商')}</h3>
              <div className="broker-method-tabs" role="group" aria-label={tx('選擇匯入方式')}>
                <button type="button" className={method === 'file' ? 'active' : ''} aria-pressed={method === 'file'} onClick={() => changeMethod('file')}><FileSpreadsheet size={16}/>{tx('CSV／Excel 匯入')}</button>
                <button type="button" className={method === 'api' ? 'active' : ''} aria-pressed={method === 'api'} onClick={() => changeMethod('api')}><KeyRound size={16}/>{tx('API 唯讀匯入')}</button>
              </div>
            </div>
            <label className="broker-search"><Search size={17}/><input type="search" value={search} onChange={event => changeSearch(event.target.value)} onKeyDown={event => {
              if (event.key !== 'Enter') return;
              if (method === 'file' && visibleGuides[0]) selectGuide(exactBrokerGuide(search) ?? visibleGuides[0]);
              if (method === 'api' && visibleApiGuides[0]) selectApiGuide(exactApiImportGuide(search) ?? visibleApiGuides[0]);
            }} placeholder={tx('搜尋交易所／券商名稱或關鍵字')} aria-label={tx('搜尋交易所／券商名稱或關鍵字')}/>{search && <button type="button" aria-label={tx('清除搜尋')} onClick={() => setSearch('')}><X size={15}/></button>}</label>
            <div className="broker-region-tabs" role="group" aria-label={tx('依地區篩選')}>{brokerRegionOptions.map(option => <button key={option.id} type="button" className={region === option.id ? 'active' : ''} aria-pressed={region === option.id} onClick={() => setRegion(option.id)}>{tx(option.label)}</button>)}</div>
            <div className="broker-grid-scroll">
              {method === 'file' ? <div className="broker-grid">{visibleGuides.map(item => <button key={item.id} type="button" className={provider === item.id ? 'active' : ''} onClick={() => selectGuide(item)}><strong>{tx(item.name)}</strong><small>{tx(item.category)}</small></button>)}</div> : <div className="broker-grid api-provider-grid">{visibleApiGuides.map(item => <button key={item.id} type="button" className={`${apiProvider === item.id ? 'active ' : ''}${item.availability === 'local-only' ? 'local-api-provider' : ''}`} onClick={() => selectApiGuide(item)}><strong>{tx(item.name)}</strong><small>{tx(item.category)}</small><span className={`api-provider-badge ${item.liveConnector ? 'live' : item.availability ?? 'normal'}`}>{tx(item.liveConnector ? '本站唯讀串接' : item.availability === 'local-only' ? '需本機連接器' : item.availability === 'external-setup' ? '需開發者開通' : item.safetyMode === 'site-query-only' ? '程式端點限制查詢' : '官方唯讀權限')}</span></button>)}</div>}
              {method === 'file' && !visibleGuides.length && <p className="broker-no-results">{tx('找不到符合的交易所或券商。請換個關鍵字或地區。')}</p>}
              {method === 'api' && !visibleApiGuides.length && <p className="broker-no-results">{tx('找不到符合的 API 來源。請換個關鍵字或地區。')}</p>}
            </div>
          </section>

          {method === 'file' ? guide ? <section className="broker-guide">
            <div className="broker-guide-heading"><div><h3>{tx(guide.name)} {tx('匯入')}</h3><span>{tx('支援類型：')}{tx(guide.category)}</span></div><button type="button" className="how-button" onClick={() => setHelp(value => !value)} aria-expanded={help}><CircleHelp size={19}/>{tx('如何操作')}</button></div>
            {help && <div className="guide-body"><ol>{guide.steps.map((step, index) => <li key={step}><b>{index + 1}.</b><span>{tx(step)}</span></li>)}</ol>{guide.notes?.map(note => <p key={note}><AlertTriangle size={15}/>{tx(note)}</p>)}<a href={guide.source} target="_blank" rel="noreferrer">{tx('查看官方匯出說明')} <ExternalLink size={13}/></a></div>}
            {(guide.markets?.length ?? 0) > 1 && <label className="broker-market"><span>{tx('交易市場')}</span><Select value={market} onValueChange={value => { const next = value as Trade['market']; setMarket(next); setOffset(offsetForMarket(next)); }}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{guide.markets?.map(value => <SelectItem key={value} value={value}>{tx(marketNames[value])}</SelectItem>)}</SelectContent></Select></label>}
            <div className="broker-file-options"><label><span>{tx('檔案內時間')}</span><Select value={offset} onValueChange={setOffset}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{offsets.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><label className="broker-upload"><Upload size={18}/><span>{tx('選擇 CSV／Excel')}</span><input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void chooseFile(event.target.files?.[0])}/></label></div>
            <p className="field-hint">{tx('資料只會在瀏覽器解析；按下儲存前可逐筆修改。若平台檔案欄位不同，請用 Excel 另存 CSV 後再試。')}</p>
          </section> : <div className="broker-empty"><FileSpreadsheet/><p>{tx('請先選擇交易所，畫面會顯示該平台的專屬匯出教學。')}</p></div> : apiGuide ? <section className="broker-guide api-guide">
            <div className="broker-guide-heading"><div><h3>{tx(apiGuide.name)} API</h3><span>{tx('支援類型：')}{tx(apiGuide.category)} · {tx(apiGuide.credentialType)}</span></div><button type="button" className="api-help-icon" aria-label={tx('API 匯入操作教學')} title={tx('API 匯入操作教學')} onClick={() => setHelp(value => !value)} aria-expanded={help}><CircleHelp size={21}/></button></div>
            <div className="api-readonly-callout"><ShieldCheck size={19}/><div><strong>{tx(apiGuide.safetyMode === 'site-query-only' ? '程式限制查詢' : '官方唯讀權限')}</strong><p>{tx(apiGuide.readPermission)}</p></div></div>
            {apiGuide.safetyMode === 'site-query-only' && <div className="api-availability-note api-security-note"><AlertTriangle size={17}/><span>{tx('此服務的 API 本身包含金融操作。本站目前不接受或儲存 API 金鑰，也沒有 API 連線；日後只有固定查詢端點會納入接頭。程式限制不能防止金鑰在本站以外遭竊或被其他程式使用。')}</span></div>}
            {help && <div className="guide-body api-guide-body"><ol>{apiGuide.steps.map((step, index) => <li key={step}><b>{index + 1}.</b><span>{tx(step)}</span></li>)}</ol>{apiGuide.notes?.map(note => <p key={note}><AlertTriangle size={15}/>{tx(note)}</p>)}<a href={apiGuide.source} target="_blank" rel="noreferrer">{tx('查看官方 API 文件')} <ExternalLink size={13}/></a></div>}
            {selectedApiMarket && <label className="broker-market"><span>{tx('交易市場')}</span><Select value={market} onValueChange={value => setMarket(value as Trade['market'])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{apiGuide.markets?.map(value => <SelectItem key={value} value={value}>{tx(marketNames[value])}</SelectItem>)}</SelectContent></Select></label>}
            <div className="api-date-panel"><div className="api-date-title"><CalendarDays size={17}/><strong>{tx('選擇要讀取的成交日期區間')}</strong></div><div className="api-date-fields"><label><span>{tx('開始日期')}</span><input type="date" value={apiStart} max={apiEnd || dateInput(new Date())} onChange={event => setApiStart(event.target.value)}/></label><label><span>{tx('結束日期')}</span><input type="date" value={apiEnd} min={apiStart} max={dateInput(new Date())} onChange={event => setApiEnd(event.target.value)}/></label></div>{!apiDateValid && <p className="form-error">{tx('請確認日期順序正確，且結束日期不可晚於今天。')}</p>}<p className="field-hint">{tx(apiGuide.liveConnector === 'bybit-options' ? 'Bybit 以 UTC 日期查詢，僅限最近六個月；較長區間會依官方上限分段讀取。' : apiGuide.liveConnector === 'kucoin-uta-usdt-futures' ? 'KuCoin UTA 最多查詢最近三個月，單次上限七天；本站會自動分段。' : apiGuide.liveConnector ? '此來源最多查詢最近三個月的已平倉部位。' : '交易所 API 的歷史查詢期間各有上限，超過時會分段讀取。')}</p></div>
            {apiGuide.availability === 'local-only' ? <div className="api-availability-note local"><AlertTriangle size={17}/><span>{tx('此 API 需要在你的電腦執行本機交易平台連接器；目前網站無法直接連到本機服務。')}</span></div> : apiGuide.availability === 'external-setup' ? <div className="api-availability-note"><AlertTriangle size={17}/><span>{tx('此交易所要求整合方先註冊／開通 OAuth 應用；本網站尚未完成這項申請。')}</span></div> : null}
            {apiGuide.liveConnector ? <div className="api-credential-form">
              <div className="api-credential-notice"><ShieldCheck size={17}/><span>{tx(apiGuide.liveConnector === 'bybit-options' ? '金鑰只會透過 HTTPS 傳送至本站固定唯讀 API；只在這次讀取時使用，不會保存到帳號、資料庫、Cookie 或瀏覽器儲存。本站只呼叫 Bybit 已平倉選擇權 GET 查詢端點。' : '憑證只會透過 HTTPS 傳送至本站固定唯讀 API，只在這次查詢時使用，不會保存到帳號、資料庫、Cookie 或瀏覽器儲存。本站只會向所選平台的固定已平倉紀錄 GET 端點查詢。')}</span></div>
              <label>{tx('API Key')}<input type="password" autoComplete="off" spellCheck={false} maxLength={128} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={tx('貼上唯讀 API Key')}/></label>
              <label>{tx('API Secret')}<input type="password" autoComplete="new-password" spellCheck={false} maxLength={256} value={apiSecret} onChange={event => setApiSecret(event.target.value)} placeholder={tx('貼上 API Secret')}/></label>
              {apiGuide.liveConnector !== 'bybit-options' && <label>{tx('API Passphrase')}<input type="password" autoComplete="new-password" spellCheck={false} maxLength={256} value={apiPassphrase} onChange={event => setApiPassphrase(event.target.value)} placeholder={tx('貼上 API Passphrase')}/></label>}
              {apiGuide.liveConnector === 'kucoin-uta-usdt-futures' && <><label>{tx('KuCoin API Key 版本')}<Select value={apiKeyVersion} onValueChange={value => setApiKeyVersion(value as '2' | '3')}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="3">V3</SelectItem><SelectItem value="2">V2</SelectItem></SelectContent></Select></label><label>{tx('USDT-M 合約代碼')}<input type="text" autoComplete="off" spellCheck={false} maxLength={30} value={apiSymbol} onChange={event => setApiSymbol(event.target.value.toUpperCase())} placeholder={tx('例如 XBTUSDTM')}/></label></>}
              <button type="button" className="primary-button" disabled={!!busy || !apiKey.trim() || !apiSecret.trim() || (apiGuide.liveConnector !== 'bybit-options' && !apiPassphrase.trim()) || (apiGuide.liveConnector === 'kucoin-uta-usdt-futures' && !apiSymbol.trim()) || !apiDateValid} onClick={() => void importApiTrades()}><KeyRound size={17}/>{tx('唯讀連線並預覽平倉紀錄')}</button>
            </div> : <div className="api-not-ready" role="status"><KeyRound size={17}/><span>{tx('此來源目前尚無實際 API 連接器，所以不接受 API 金鑰；此頁只提供支援名單、權限指南和日期區間。')}</span></div>}
            <p className="field-hint">{tx('連線只會讀取資料；金鑰必須在交易所端設為唯讀並停用交易、轉帳、提款。程式限制不能保護在本站以外遭竊的金鑰。')}</p>
          </section> : <div className="broker-empty"><KeyRound/><p>{tx('請先選擇支援唯讀 API 的交易所或券商。')}</p></div>}
        </div>
      </> : <div className="broker-review">
        <div className="broker-review-head"><button type="button" className="outline-button" onClick={() => { setRows([]); setDuplicates({}); }}><ArrowLeft size={16}/>{tx(method === 'api' ? '返回 API 設定' : '重選檔案')}</button><div><strong>{guide ? tx(guide.name) : apiGuide ? tx(apiGuide.name) : ''}</strong><span>{rows.length} {tx('筆交易待核對')}</span></div><button type="button" className="text-button" onClick={() => setRows(list => list.map(item => item.selected ? { ...item, confirmed: true } : item))}><CheckCircle2 size={16}/>{tx('核對所有已選項目')}</button></div>
        <div className="broker-review-layout"><aside>{rows.map((item, index) => {
          const duplicate = duplicates[item.trade.id];
          return <button type="button" key={item.trade.id} className={`${active === index ? 'active ' : ''}${duplicate && duplicate.step < 2 ? 'duplicate' : ''}`} onClick={() => setActive(index)}><input type="checkbox" checked={item.selected} onClick={event => event.stopPropagation()} onChange={event => setRows(list => list.map((entry, entryIndex) => entryIndex === index ? { ...entry, selected: event.target.checked, confirmed: false } : entry))}/><span><strong>{index + 1}. {item.trade.symbol}</strong><small>{item.trade.exitTime.replace('T', ' ')} · {item.trade.currency}</small></span>{item.confirmed && <CheckCircle2 size={16}/>}</button>;
        })}</aside>
          {row && <section className="broker-edit"><div className="broker-edit-heading"><div><h3>{tx('修改與核對')}</h3><p>{tx(method === 'api' ? 'API 來源第 {0} 筆' : '來源檔案第 {0} 列', [row.sourceRow])}</p></div><button type="button" aria-label={tx('取消選取')} onClick={() => setRows(list => list.map((item, index) => index === active ? { ...item, selected: false, confirmed: false } : item))}><X/></button></div>{row.warnings.length > 0 && <ul className="import-warnings">{row.warnings.map(warning => <li key={warning}>{tx(warning)}</li>)}</ul>}{duplicates[row.trade.id] && <TradeDuplicateWarning duplicate={duplicates[row.trade.id]} busy={!!busy} onConfirm={() => void confirmDuplicate(row.trade.id)}/>}<TradeFields trade={row.trade} onChange={trade => update(active, trade)} notes={false}/><label className="checkbox-label confirm-row"><input type="checkbox" checked={row.confirmed} disabled={!row.selected || !!duplicates[row.trade.id] && duplicates[row.trade.id].step < 2} onChange={event => setRows(list => list.map((item, index) => index === active ? { ...item, confirmed: event.target.checked } : item))}/>{tx('已核對這筆交易')}</label>{rowIssue && !rowIssue.success && <p className="form-error">{tradeIssueMessage(rowIssue.error.issues[0])}</p>}</section>}
        </div>
        <div className="broker-review-footer"><span>{rows.filter(item => item.selected).length} {tx('筆已選取')} · {rows.filter(item => item.selected && item.confirmed).length} {tx('筆已核對')}</span><button type="button" className="primary-button" disabled={!!busy} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" size={17}/> : <Upload size={17}/>} {tx('儲存選取交易')}</button></div>
      </div>}

      {busy && <p className="import-progress"><LoaderCircle className="animate-spin" size={16}/>{tx(busy)}</p>}
      {error && <div className="form-error" role="alert">{tx(error)}</div>}
    </DialogContent>
  </Dialog>;
}
