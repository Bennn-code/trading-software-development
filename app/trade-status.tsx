'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Target, TrendingUp, Users } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, usePlotArea } from 'recharts';
import { useI18n } from './language-provider';
import ConvertedMoney from './converted-money';
import MarketDataSettings from './market-data-settings';
import type { QuoteKeys } from '@/lib/market-candles';
import InfoTooltip from '@/components/info-tooltip';
import FavoriteStar from '@/components/favorite-star';
import { cryptoProductForTrade, marketName, pnl, positionValue, type Trade } from '@/lib/trades';
import { Choice } from './trade-fields';
import { tradeStatusFavoriteDomId, tradeStatusFavoriteTitle } from '@/lib/trade-status-favorites';
import { utcOffsetLabel, timezoneName } from '@/lib/preferences';
import type { DateRange, ReportPeriod } from '@/lib/report-period';
import { averageDurationMinutes, averagePnl, averageReturnPercent, bestDayShare, disciplineRate, durationMinutes, enteredStrategyStats, hasEnteredStrategies, holdingTimeBucket, holdingTimeLabel, inEntryDateRange, lossRecoveryStats, maeMfeFingerprint, mistakeStats, profitConcentration, sharpeRatio, strategyStats, weekdayPnlStats, winRate } from '@/lib/trade-status';

type Community = { mistakes: { name: string; count: number; percent: number }[]; profit: { label: string; value: number; currency: string }[]; returns: { label: string; value: number }[]; sampleSize: number };
type Summary = { overview: string; strategySummary: string; reflectionSummary: string; strengths: string[]; improvements: string[]; nextSteps: string[] };
type TimeBucket = { position: number; label: string; count: number; winRate: number | null };
type ProductCharts = { market: Trade['market']; currency: Trade['currency']; count: number; averageDuration: number | null; previousAverageDuration: number | null; averageWinDuration: number | null; averageLossDuration: number | null; bestWeekday: { weekday: number; net: number } | null; worstWeekday: { weekday: number; net: number } | null; sharpe: number | null; expectancy: number; expectancyPercent: number | null };
type TimeProductCharts = { market: Trade['market']; currency: Trade['currency']; count: number; clock: TimeBucket[]; holding: TimeBucket[] };
type MaeMfeRow = { referenceSymbol?:string;productType?:string;id:string;provider:string;timeframe?:string;market:Trade['market'];symbol:string;currency:string;mae:number|null;mfe:number|null;actual:number;candleCount:number;entryTime:string;manualMae?:boolean;manualMfe?:boolean;displayFactor?:number };
type MaeMfeSkip = { id:string;reason:string };
type MaeMfeAnalysis = { selectionKey:string;rows:MaeMfeRow[];skipped:MaeMfeSkip[];attempted:string[] };
type RecoveryItem=ReturnType<typeof lossRecoveryStats>[number];
type ConcentrationGroup={market:Trade['market'];currency:Trade['currency'];rows:ReturnType<typeof profitConcentration>};
type StatusExchangeRates={rates:Record<string,number>;updatedAt:number};
const fmt = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const change = (current: number, previous: number) => previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
const weekdays = ['週日','週一','週二','週三','週四','週五','週六'] as const;
function durationText(minutes:number|null,t:(text:string,values?:unknown[])=>string){if(minutes===null||!Number.isFinite(minutes))return '—';if(minutes<60)return `${Math.round(minutes)} ${t('分鐘')}`;if(minutes<1440)return `${(minutes/60).toFixed(1)} ${t('小時')}`;return `${(minutes/1440).toFixed(1)} ${t('天')}`;}
function percentChangeText(value:number|null){return value===null?'—':`${value>0?'+':''}${value.toFixed(1)}%`;}
function percentChangeClass(value:number|null){return value===null||value===0?'':value>0?'profit-value':'loss-value';}
function isSummary(value:unknown):value is Summary{if(!value||typeof value!=='object')return false;const summary=value as Partial<Summary>;return typeof summary.overview==='string'&&typeof summary.strategySummary==='string'&&typeof summary.reflectionSummary==='string'&&Array.isArray(summary.strengths)&&summary.strengths.every(item=>typeof item==='string')&&Array.isArray(summary.improvements)&&summary.improvements.every(item=>typeof item==='string')&&Array.isArray(summary.nextSteps)&&summary.nextSteps.every(item=>typeof item==='string');}
function isCommunity(value:unknown):value is Community{if(!value||typeof value!=='object')return false;const data=value as Partial<Community>;return typeof data.sampleSize==='number'&&Array.isArray(data.mistakes)&&data.mistakes.every(row=>!!row&&typeof row.name==='string'&&typeof row.count==='number'&&typeof row.percent==='number')&&Array.isArray(data.profit)&&data.profit.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number'&&typeof row.currency==='string')&&Array.isArray(data.returns)&&data.returns.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number');}
function isReviewResponse(value:unknown):value is {record?:{summary?:Summary|null}}{if(!value||typeof value!=='object')return false;const record=(value as {record?:unknown}).record;if(!record||typeof record!=='object')return false;const summary=(record as {summary?:unknown}).summary;return summary===null||isSummary(summary);}

export default function TradeStatus({ trades, timezone, period, anchor, range, demo = false, signedIn = false, baseCurrency = 'auto', favoriteIds, onToggleFavorite, favoritesOnly = false }: { trades: Trade[]; timezone: string; period: ReportPeriod; anchor: string; range: DateRange; demo?: boolean; signedIn?: boolean; baseCurrency?: string; favoriteIds: string[]; onToggleFavorite: (id: string) => void; favoritesOnly?: boolean }) {
  const { t } = useI18n();
  const [community, setCommunity] = useState<Community | null>(null);
  const [ranking, setRanking] = useState<'profit' | 'returns'>('profit');
  const [timeMode, setTimeMode] = useState<'clock' | 'holding'>('clock');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [maeMfeAnalysis,setMaeMfeAnalysis]=useState<MaeMfeAnalysis|null>(null);
  const [maeMfeBusy,setMaeMfeBusy]=useState(false);
  const [maeMfeError,setMaeMfeError]=useState('');
  const [quoteKeys,setQuoteKeys]=useState<QuoteKeys>({});
  const [cryptoTypes,setCryptoTypes]=useState<Record<string,'spot'|'perpetual'>>({});
  const analysisRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>analysisRequest.current?.abort(),[]);
  const [statusRates,setStatusRates]=useState<StatusExchangeRates|null>(null);

  useEffect(()=>{
    if(baseCurrency==='auto')return;
    const controller=new AbortController();
    fetch('/api/exchange-rates',{signal:controller.signal,cache:'no-store'}).then(async response=>response.ok?await response.json() as StatusExchangeRates:null).then(value=>{if(value&&value.rates&&typeof value.rates==='object')setStatusRates(value);}).catch(()=>{});
    return()=>controller.abort();
  },[baseCurrency]);

  useEffect(() => {
    if (favoritesOnly && !favoriteIds.includes('community')) return;
    const controller = new AbortController();
    fetch('/api/trade-status/community?currency=' + encodeURIComponent(baseCurrency), { signal: controller.signal })
      .then(async response => { if (!response.ok) return null; const payload: unknown = await response.json(); return isCommunity(payload) ? payload : null; }).then(setCommunity).catch(() => {});
    return () => controller.abort();
  }, [baseCurrency, favoritesOnly, favoriteIds]);

  useEffect(() => {
    if (!signedIn || demo || (favoritesOnly && !favoriteIds.includes('summary'))) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: period, date: anchor, start: range.start, end: range.end });
    fetch('/api/reviews?' + params, { signal: controller.signal }).then(async response => { if (!response.ok) return null; const payload: unknown = await response.json(); return isReviewResponse(payload) ? payload : null; })
      .then(data => setSummary(data?.record?.summary || null)).catch(() => {});
    return () => controller.abort();
  }, [signedIn, demo, period, anchor, range.start, range.end, favoritesOnly, favoriteIds]);

  const selected = useMemo(() => range.start && range.end
    ? trades.filter(trade => trade.exitTime.slice(0, 10) >= range.start && trade.exitTime.slice(0, 10) <= range.end)
    : trades, [trades, range.start, range.end]);
  const timeSelected = useMemo(() => range.start && range.end
    ? inEntryDateRange(trades, range.start, range.end)
    : trades, [trades, range.start, range.end]);
  const quoteTrades=useMemo(()=>selected.map(trade=>trade.market==='crypto'?{...trade,cryptoProductType:cryptoProductForTrade(trade)??cryptoTypes[trade.id]??null}:trade),[selected,cryptoTypes]);
  const maeMfeSelectionKey=useMemo(()=>maeMfeFingerprint(quoteTrades),[quoteTrades]);
  const currentMaeMfeAnalysis=useMemo(()=>maeMfeAnalysis?.selectionKey===maeMfeSelectionKey?maeMfeAnalysis:{selectionKey:maeMfeSelectionKey,rows:[],skipped:[],attempted:[]},[maeMfeAnalysis,maeMfeSelectionKey]);
  const maeMfeEligible=useMemo(()=>quoteTrades.filter(trade=>Number.isFinite(durationMinutes(trade))&&durationMinutes(trade)>0&&(trade.mae==null||trade.mfe==null)&&(trade.market==='crypto'?!!trade.cryptoProductType:trade.market==='tw-stocks'||trade.market==='tw-index-futures'?!!quoteKeys.fugle:trade.market==='futures'?!!quoteKeys.databento:!!quoteKeys.twelveData)),[quoteTrades,quoteKeys]);
  const maeMfePending=useMemo(()=>maeMfeEligible.filter(trade=>!currentMaeMfeAnalysis.attempted.includes(trade.id)).slice(0,3),[maeMfeEligible,currentMaeMfeAnalysis.attempted]);
  useEffect(()=>{analysisRequest.current?.abort();},[maeMfeSelectionKey]);

  const data = useMemo(() => {
    const days = Math.max(1, Math.round((new Date(`${range.end}T00:00:00Z`).getTime() - new Date(`${range.start}T00:00:00Z`).getTime()) / 86400000) + 1);
    const priorEnd = new Date(`${range.start}T00:00:00Z`);
    priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setUTCDate(priorStart.getUTCDate() - days + 1);
    const previous = trades.filter(trade => trade.exitTime.slice(0, 10) >= priorStart.toISOString().slice(0, 10) && trade.exitTime.slice(0, 10) <= priorEnd.toISOString().slice(0, 10));
    const mistakes = mistakeStats(selected);
    const strategies = strategyStats(selected);
    const enteredStrategies = enteredStrategyStats(selected);
    const symbolCounts = new Map<string, number>();
    const productGroups = new Map<string, { market: Trade['market']; currency: Trade['currency']; trades: Trade[] }>();
    const previousProductGroups = new Map<string, Trade[]>();
    for (const trade of selected) {
      symbolCounts.set(trade.symbol, (symbolCounts.get(trade.symbol) ?? 0) + 1);
      const key = `${trade.market}|${trade.currency}`;
      const group = productGroups.get(key);
      if (group) group.trades.push(trade);
      else productGroups.set(key, { market: trade.market, currency: trade.currency, trades: [trade] });
    }
    for (const trade of previous) {
      const key = `${trade.market}|${trade.currency}`;
      const group = previousProductGroups.get(key);
      if (group) group.push(trade);
      else previousProductGroups.set(key, [trade]);
    }
    const symbols = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const products: ProductCharts[] = [...productGroups.entries()].map(([key, { market, currency, trades: rows }]) => {
      const previousRows = previousProductGroups.get(key) ?? [];
      const daily = weekdayPnlStats(rows);
      const durations = rows.filter(trade => Number.isFinite(durationMinutes(trade)));
      const winningDurations = durations.filter(trade => pnl(trade) > 0);
      const losingDurations = durations.filter(trade => pnl(trade) < 0);
      return {
        market, currency, count: rows.length,
        averageDuration: averageDurationMinutes(durations),
        previousAverageDuration: averageDurationMinutes(previousRows.filter(trade => Number.isFinite(durationMinutes(trade)))),
        averageWinDuration: averageDurationMinutes(winningDurations),
        averageLossDuration: averageDurationMinutes(losingDurations),
        bestWeekday: daily.length ? [...daily].sort((a, b) => b.net - a.net)[0] : null,
        worstWeekday: daily.length ? [...daily].sort((a, b) => a.net - b.net)[0] : null,
        sharpe: sharpeRatio(rows),
        expectancy: averagePnl(rows),
        expectancyPercent: averageReturnPercent(rows),
      };
    });
    const timeProductGroups = new Map<string, { market: Trade['market']; currency: Trade['currency']; trades: Trade[] }>();
    for (const trade of timeSelected) {
      const key = `${trade.market}|${trade.currency}`;
      const group = timeProductGroups.get(key);
      if (group) group.trades.push(trade);
      else timeProductGroups.set(key, { market: trade.market, currency: trade.currency, trades: [trade] });
    }
    const timeProducts: TimeProductCharts[] = [...timeProductGroups.values()].map(({ market, currency, trades: rows }) => {
      const hourly: Trade[][] = Array.from({ length: 24 }, () => []);
      for (const trade of rows) hourly[Number(trade.entryTime.slice(11, 13))]?.push(trade);
      const clock = hourly.map((bucket, hour) => ({ position: hour, label: `${String(hour).padStart(2, '0')}:00`, count: bucket.length, winRate: bucket.length ? winRate(bucket) : null }));
      const holdingMap = new Map<number, Trade[]>();
      for (const trade of rows) {
        const position = holdingTimeBucket(durationMinutes(trade));
        const bucket = holdingMap.get(position);
        if (bucket) bucket.push(trade);
        else holdingMap.set(position, [trade]);
      }
      const holding = [...holdingMap].sort((a, b) => a[0] - b[0]).map(([position, bucket]) => ({ position, label: holdingTimeLabel(position), count: bucket.length, winRate: winRate(bucket) }));
      return { market, currency, count: rows.length, clock, holding };
    });
    const lossPercent = selected.filter(trade => positionValue(trade) > 0 && pnl(trade) < 0).map(trade => Math.abs(pnl(trade)) / positionValue(trade) * 100);
    const avgLossPercent = lossPercent.length ? lossPercent.reduce((sum, value) => sum + value, 0) / lossPercent.length : 0;
    const frequency = selected.length / Math.max(new Set(selected.map(trade => trade.exitTime.slice(0, 10))).size, 1);
    const leverageRows = selected.filter(trade => (trade.leverage || 0) > 0);
    const leverage = leverageRows.length ? leverageRows.reduce((sum, trade) => sum + (trade.leverage || 0), 0) / leverageRows.length : 0;
    const riskScore = Math.min(100, Math.round(frequency * 12 + Math.min(avgLossPercent * 3, 35) + Math.min(leverage * 3, 35)));
    const currencyGroups = new Map<Trade['currency'], Trade[]>();
    for (const trade of selected) {
      const group = currencyGroups.get(trade.currency);
      if (group) group.push(trade);
      else currencyGroups.set(trade.currency, [trade]);
    }
    const bestDays = [...currencyGroups.entries()].flatMap(([currency, rows]) => {
      const byDay = new Map<string, Trade[]>();
      for (const trade of rows) {
        const date = trade.exitTime.slice(0, 10);
        const day = byDay.get(date);
        if (day) day.push(trade);
        else byDay.set(date, [trade]);
      }
      const totals = [...byDay].map(([date, dayTrades]) => ({ date, trades: dayTrades, net: dayTrades.reduce((sum, trade) => sum + pnl(trade), 0), currency }))
        .sort((a, b) => b.net - a.net);
      const best = totals[0];
      return best ? [{ ...best, share: bestDayShare(best.net, totals.map(day => day.net)) }] : [];
    });
    const wins = selected.filter(trade => pnl(trade) > 0).reduce((sum, trade) => sum + pnl(trade), 0);
    const losses = Math.abs(selected.filter(trade => pnl(trade) < 0).reduce((sum, trade) => sum + pnl(trade), 0));
    const score = Math.max(0, Math.min(100, Math.round(winRate(selected) * .45 + Math.min(40, (wins / (losses || 1)) * 20) + disciplineRate(selected) * .25)));
    const recovery=lossRecoveryStats(selected);
    const concentrationGroups=new Map<string,{market:Trade['market'];currency:Trade['currency'];rows:Trade[]}>();
    for(const trade of selected){const key=`${trade.market}|${trade.currency}`,group=concentrationGroups.get(key);if(group)group.rows.push(trade);else concentrationGroups.set(key,{market:trade.market,currency:trade.currency,rows:[trade]});}
    const concentration=[...concentrationGroups.values()].map(group=>({market:group.market,currency:group.currency,rows:profitConcentration(group.rows)}));
    return { previous, mistakes, strategies, enteredStrategies, symbols, products, timeProducts, riskScore, score, leverage, bestDays, recovery, concentration };
  }, [trades, selected, timeSelected, range.start, range.end]);

  const durationComparisons = data.products.filter(product => product.averageDuration !== null).map(product => ({
    name: `${t(marketName(product.market))} · ${t('平均進出場時間')}`,
    value: product.previousAverageDuration === null ? null : change(product.averageDuration!, product.previousAverageDuration),
  }));
  const averagePnlChange = change(averagePnl(selected), averagePnl(data.previous));
  const risk = data.riskScore < 34 ? '保守' : data.riskScore < 67 ? '平衡' : '激進';
  const maeMfeRows=useMemo(()=>{const analyzed=new Map(currentMaeMfeAnalysis.rows.map(row=>[row.id,row]));return selected.map(trade=>{const estimate=analyzed.get(trade.id);return{id:trade.id,market:trade.market,provider:estimate?.provider??trade.exchangeSource??'manual',timeframe:estimate?.timeframe,referenceSymbol:estimate?.referenceSymbol,productType:estimate?.productType,symbol:trade.symbol,currency:trade.currency,mae:trade.mae??estimate?.mae??null,mfe:trade.mfe??estimate?.mfe??null,actual:pnl(trade),candleCount:estimate?.candleCount??0,entryTime:trade.entryTime,manualMae:trade.mae!=null,manualMfe:trade.mfe!=null};});},[selected,currentMaeMfeAnalysis.rows]);
  const maeMfeGroups=groupRows(maeMfeRows,row=>`${row.market}|${row.currency}`);
  const concentrationGroups:ConcentrationGroup[]=data.concentration;
  const cryptoWithoutSource=quoteTrades.filter(trade=>trade.market==='crypto'&&!trade.cryptoProductType&&(trade.mae==null||trade.mfe==null));
  const summarySections: [string, string[]][] = [];
  if (summary?.strengths.length) summarySections.push([t('做得好的地方'), summary.strengths]);
  if (summary?.improvements.length) summarySections.push([t('可以改善'), summary.improvements]);
  if (summary?.nextSteps.length) summarySections.push([t('下一步'), summary.nextSteps]);

  async function generate() {
    setSummaryBusy(true); setSummaryError('');
    try {
      const response = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: period, date: anchor, start: range.start, end: range.end, action: 'generate' }) });
      const result = await response.json() as { error?: string; record?: { summary?: Summary | null } };
      if (!response.ok) throw new Error(result.error || t('AI 總結失敗'));
      setSummary(result.record?.summary || null);
    } catch (error) { setSummaryError(error instanceof Error ? error.message : t('AI 總結失敗')); }
    finally { setSummaryBusy(false); }
  }

  const analyzeMaeMfeNextBatch=useCallback(async()=>{
    if(!maeMfePending.length||maeMfeBusy)return;
    setMaeMfeBusy(true);setMaeMfeError('');
    const batch=maeMfePending;
    const controller=new AbortController();analysisRequest.current=controller;
    try{
      const response=await fetch('/api/trade-status/mae-mfe',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({quoteKeys,trades:batch.map(trade=>({
        account:'quote',notes:'',strategy:'',imageId:null,cryptoProductType:trade.cryptoProductType,priceSymbol:trade.priceSymbol,
        id:trade.id,market:trade.market,currency:trade.currency,symbol:trade.symbol,side:trade.side,entryTime:trade.entryTime,exitTime:trade.exitTime,timezone:trade.timezone,
        entry:trade.entry,exit:trade.exit,quantity:trade.quantity,multiplier:trade.multiplier,positionValue:trade.positionValue,exchangeSource:trade.exchangeSource,
        netOverride:trade.netOverride,profitBasis:trade.profitBasis,fees:trade.fees,funding:trade.funding,feeMode:trade.feeMode,commission:trade.commission,transactionTax:trade.transactionTax,
        exchangeFee:trade.exchangeFee,clearingFee:trade.clearingFee,settlementFee:trade.settlementFee,regulatoryFee:trade.regulatoryFee,secFee:trade.secFee,finraFee:trade.finraFee,futuresTax:trade.futuresTax,
      }))})});
      const result=await response.json() as {error?:string;rows?:MaeMfeRow[];skipped?:MaeMfeSkip[];stopped?:boolean};
      if(controller.signal.aborted)return;
      if(!response.ok)throw new Error(result.error||t('MAE／MFE 分析失敗'));
      if(result.stopped)setMaeMfeError(t('行情分析已暫停；請查看未完成原因，確認授權或稍後重新分析。'));
      const receivedRows=Array.isArray(result.rows)?result.rows:[],receivedSkipped=Array.isArray(result.skipped)?result.skipped:[];
      setMaeMfeAnalysis(previous=>{
        const current=previous?.selectionKey===maeMfeSelectionKey?previous:{selectionKey:maeMfeSelectionKey,rows:[],skipped:[],attempted:[]};
        const mergedRows=new Map([...current.rows,...receivedRows].map(row=>[row.id,row]));
        const mergedSkipped=new Map([...current.skipped,...receivedSkipped].map(row=>[row.id,row]));
        return{selectionKey:maeMfeSelectionKey,rows:[...mergedRows.values()],skipped:[...mergedSkipped.values()],attempted:[...new Set([...current.attempted,...batch.map(trade=>trade.id)])]};
      });
    }catch(error){if(!controller.signal.aborted)setMaeMfeError(error instanceof Error?error.message:t('MAE／MFE 分析失敗'));}
    finally{setMaeMfeBusy(false);}
  },[maeMfePending,maeMfeBusy,maeMfeSelectionKey,quoteKeys,t]);

  useEffect(()=>{
    if(!signedIn||demo||maeMfeBusy||maeMfeError||!maeMfePending.length||(favoritesOnly&&!favoriteIds.includes('mae-mfe')))return;
    const timer=setTimeout(()=>void analyzeMaeMfeNextBatch(),350);return()=>clearTimeout(timer);
  },[signedIn,demo,maeMfeBusy,maeMfeError,maeMfePending.length,favoritesOnly,favoriteIds,analyzeMaeMfeNextBatch]);

  function confirmCryptoTypes(ids:string[],type:'spot'|'perpetual'){setCryptoTypes(previous=>({...previous,...Object.fromEntries(ids.map(id=>[id,type]))}));setMaeMfeError('');}

  function resetMaeMfeAnalysis(){setMaeMfeAnalysis({selectionKey:maeMfeSelectionKey,rows:[],skipped:[],attempted:[]});setMaeMfeError('');}

  return <div className="status-grid">
    {(!favoritesOnly || favoriteIds.includes('score')) && <section id={tradeStatusFavoriteDomId('score')} className="panel status-card status-hero"><StatusHeader id="score" title={t('交易分數')} icon={null} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}/><div className="status-score-value"><strong>{data.score}</strong><small>/ 100</small></div><div className="score-gauge" style={{ '--score': `${data.score * 3.6}deg` } as React.CSSProperties}><i style={{ transform: `rotate(${data.score * 1.8 - 90}deg)` }}/></div><p>{t('依勝率、盈虧效率與紀律紀錄計算；只反映已保存資料。')}</p></section>}

    <Card favoriteId="risk" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<ShieldCheck/>} title={t('風險偏好')}>
      <div className="risk-segment-labels"><span>{t('保守')}</span><span>{t('平衡')}</span><span>{t('激進')}</span></div>
      <div className="risk-meter" role="img" aria-label={`${t('系統判定')}：${t(risk)}`}><div className="risk-meter-arc"/><i style={{ transform: `rotate(${data.riskScore * 1.8 - 90}deg)` }}/></div>
      <div className="risk-conclusion"><span>{t('系統判定')}</span><strong>{t(risk)}</strong></div>
      <p>{t('依平均虧損、交易頻率與平均槓桿估算。')} {t('平均槓桿')} {data.leverage ? `${data.leverage.toFixed(1)}×` : t('未記錄')}</p>
    </Card>

    {(!favoritesOnly || favoriteIds.includes('community')) && <section id={tradeStatusFavoriteDomId('community')} className="panel status-card community-card"><StatusHeader id="community" title={t('本週結算排行')} icon={<Users/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><div className="status-switch"><button className={ranking === 'profit' ? 'active' : ''} onClick={() => setRanking('profit')}>{t('金額')}</button><button className={ranking === 'returns' ? 'active' : ''} onClick={() => setRanking('returns')}>{t('百分比')}</button></div></StatusHeader>{community && community.sampleSize >= 3 ? <><h3>{t('本平台本週最常犯的三個錯誤')}</h3>{community.mistakes.slice(0, 3).map(item => <Row key={item.name} name={item.name} value={`${item.percent.toFixed(0)}% · ${item.count} ${t('次')}`}/>)}{ranking === 'profit' ? community.profit.map(item => <Row key={item.label} name={item.label} value={`${fmt(item.value)} ${item.currency}`}/>) : community.returns.map(item => <Row key={item.label} name={item.label} value={`${fmt(item.value)}%`}/>)}</> : <Empty text={t('本週匿名樣本不足 3 位使用者，暫不顯示平台排行。')}/>}</section>}

    <Card favoriteId="symbols" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<TrendingUp/>} title={t('最常交易商品')}>{data.symbols.map(([symbol, count]) => <Row key={symbol} name={symbol} value={`${count} ${t('筆')}`}/>)}</Card>
    <Card favoriteId="mistakes" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Activity/>} title={t('常犯錯誤')}>{data.mistakes.length ? data.mistakes.slice(0, 6).map(item => <Progress key={item.name} name={t(item.name)} value={item.percent} suffix={`${item.percent.toFixed(0)}% · ${item.count} ${t('次')}`}/>) : <Empty text={t('尚未在心得中辨識到常見錯誤。')}/>}</Card>
    <Card favoriteId="time-preference" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Clock3/>} title={t('交易時間偏好')}><p>{t(timezoneName(timezone))} · {utcOffsetLabel(timezone)} · 24 {t('時制')} · {t('按進場日期歸屬期間')}</p>{data.timeProducts.map(product => <div className="preference-product" key={`${product.market}-${product.currency}`}><h3>{t(marketName(product.market))} · {product.currency}</h3>{product.clock.filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 3).map(item => <Row key={item.position} name={item.label} value={`${item.count} ${t('筆')}`}/>)}</div>)}</Card>
    {hasEnteredStrategies(data.enteredStrategies)&&<Card favoriteId="strategies" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Target/>} title={t('交易策略偏好')} className="strategy-preference-card"><StrategyPreferences data={data.enteredStrategies} t={t}/></Card>}
    <Card favoriteId="best-day" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('最好的一天佔本期獲利日總額')} hidden={!data.bestDays.length&&!favoriteIds.includes('best-day')} className="best-day-card">{data.bestDays.length ? data.bestDays.map(day => <div className="best-day-row" key={`${day.currency}-${day.date}`}><div className="best-day-top"><span>{day.date} · {day.currency}</span><strong className={day.net < 0 ? 'loss-value' : 'profit-value'}>{fmt(day.net)} {day.currency}<ConvertedMoney amount={day.net} currency={day.currency} baseCurrency={baseCurrency}/></strong></div><p className="best-day-share"><span>{t('佔本期獲利日淨損益')}</span><strong>{day.share === null ? '—' : `${day.share.toFixed(1)}%`}</strong></p><div className="best-day-symbols">{day.trades.map(trade => trade.symbol).filter((symbol, index, all) => all.indexOf(symbol) === index).map(symbol => <span key={symbol}>{symbol}</span>)}</div></div>) : <Empty text={t('所選期間尚無交易。')}/>}</Card>

    <Card favoriteId="loss-recovery" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Activity/>} title={t('連續虧損與恢復狀況')} className="status-full analytics-card">{data.recovery.length?<RecoveryStats rows={data.recovery} t={t}/>:<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('連敗後部位變化只比較同一商品，且必須有完整部位大小；恢復時間依逐筆出場損益累積至先前資金高點估算。')}</p></Card>

    <Card favoriteId="mae-mfe" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<TrendingUp/>} title={t('每筆交易 MAE／MFE 區間')} className="status-full analytics-card" actions={<InfoTooltip label={t('MAE／MFE 統計說明')} contentClassName="factor-help-wide"><strong>{t('MAE／MFE 統計說明')}</strong><p>{t('每筆交易 MAE／MFE 說明內容')}</p><p>{t('加密貨幣依序使用 Binance、OKX、Bybit、BingX 的同交易對參考行情；股票與期貨需行情金鑰及授權。現貨與永續不混用，沒有可靠行情時不會畫成零。')}</p><p>{t('先依持倉期間選擇可完整查詢的分鐘線；查不到再嘗試 15 分鐘、30 分鐘、1 小時、4 小時或日線（依來源支援）。粗週期包含未持倉時段的價格，MAE／MFE 屬區間估算，可能高估幅度。')}</p><p>{t('已手動填寫的 MAE／MFE 優先顯示；空白代表沒有資料，不代表零。')}</p><p>{t('自動分析結果只暫存於目前頁面；重新載入後需重新分析。手動填寫的 MAE／MFE 會保存於交易紀錄。')}</p></InfoTooltip>}>
      <MaeMfeAverages rows={maeMfeRows} t={t} baseCurrency={baseCurrency} rates={statusRates}/>
      <div className="analysis-action-row"><MarketDataSettings keys={quoteKeys} busy={maeMfeBusy} onApply={keys=>{setQuoteKeys(keys);resetMaeMfeAnalysis();}}/><button type="button" className="outline-button" disabled={!signedIn||demo||maeMfeBusy||(!maeMfePending.length&&currentMaeMfeAnalysis.attempted.length===0)} aria-busy={maeMfeBusy} onClick={()=>maeMfePending.length?void analyzeMaeMfeNextBatch():resetMaeMfeAnalysis()}><RefreshCw size={15} className={maeMfeBusy?'animate-spin':''}/>{maeMfeBusy?t('分析中…'):maeMfePending.length?t('分析下一批交易（{0} 筆）',[maeMfePending.length]):t('重新分析')}</button><span>{t('可自動分析 {0} 筆交易',[maeMfeEligible.length])} · {t('已完成 {0} 筆',[currentMaeMfeAnalysis.attempted.length])}</span></div>
      <MaeMfeCharts groups={maeMfeGroups} t={t} baseCurrency={baseCurrency} rates={statusRates}/>
      <p className="market-metrics-note">{t('資料完整的 USDT 加密交易會自動分析，不需行情金鑰；未明確標示現貨或永續時，請先編輯商品類型。結果標示實際行情來源與週期，跨交易所價格可能不同。')}</p>
      {!signedIn||demo?<Empty text={t('登入並切換至我的紀錄後，才能查詢公開 K 線。')}/>:cryptoWithoutSource.length>0?<details className="analysis-product-types" open><summary>{t('有 {0} 筆加密交易需確認商品類型',[cryptoWithoutSource.length])}</summary><p>{t('確認後立即補查歷史行情；此選擇只用於本次分析，不更改已保存的交易。')}</p><div className="analysis-type-actions"><button type="button" className="outline-button" disabled={maeMfeBusy} onClick={()=>confirmCryptoTypes(cryptoWithoutSource.map(trade=>trade.id),'perpetual')}>{t('以上皆為永續合約')}</button><button type="button" className="outline-button" disabled={maeMfeBusy} onClick={()=>confirmCryptoTypes(cryptoWithoutSource.map(trade=>trade.id),'spot')}>{t('以上皆為現貨')}</button></div><div className="analysis-type-grid">{cryptoWithoutSource.map(trade=><Choice key={trade.id} label={`${trade.symbol} · ${trade.entryTime.replace('T',' ')}`} value="" options={[["",t('請確認商品類型')],["perpetual",t('永續合約')],["spot",t('現貨')]]} onChange={value=>{if(value)confirmCryptoTypes([trade.id],value as 'spot'|'perpetual');}}/>)}</div></details>:null}
      {currentMaeMfeAnalysis.skipped.length>0&&<details className="analysis-skipped"><summary>{t('有 {0} 筆交易無法計算',[currentMaeMfeAnalysis.skipped.length])}</summary>{currentMaeMfeAnalysis.skipped.map(item=><p key={item.id}>{selected.find(trade=>trade.id===item.id)?.symbol??item.id} · {t(item.reason)}</p>)}</details>}{maeMfeError&&<p role="alert" className="status-error">{t(maeMfeError)}</p>}
    </Card>
    <Card favoriteId="profit-concentration" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('損益變化與獲利集中度')} className="status-full analytics-card" actions={<InfoTooltip label={t('損益圖表統計說明')} contentClassName="factor-help-wide"><strong>{t('損益圖表統計說明')}</strong><p>{t('損益圖表統計方式')}</p></InfoTooltip>}>{concentrationGroups.length?<ProfitConcentrationCharts groups={concentrationGroups} t={t} baseCurrency={baseCurrency} rates={statusRates}/>:<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('柱狀圖依單筆淨損益由高到低排列；獲利線與虧損線各自顯示累積占比；游標提示框另列單筆占比與金額。獲利與虧損分開計算，各自以該組損益絕對總額為 100%。此圖不是依時間累積的資金曲線。')}</p></Card>

    {(!favoritesOnly || favoriteIds.includes('market-metrics') || favoriteIds.some(id => id.startsWith('market-stat:'))) && <section id={tradeStatusFavoriteDomId('market-metrics')} className="panel status-card status-full market-metrics-section"><StatusHeader id="market-metrics" title={t('各市場交易統計')} icon={<BarChart3/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}/><div className="market-metrics-grid">{data.products.map(product => { const id = `market-stat:${product.market}:${product.currency}`; if (favoritesOnly && !favoriteIds.includes('market-metrics') && !favoriteIds.includes(id)) return null; return <section id={tradeStatusFavoriteDomId(id)} className="market-metrics-card" key={id}><header><div className="market-metric-heading"><FavoriteStar active={favoriteIds.includes(id)} title={tradeStatusFavoriteTitle(id,t)} onToggle={()=>onToggleFavorite(id)}/><h3>{t(marketName(product.market))} · {product.currency}</h3></div><span>{product.count} {t('筆')}</span></header><div className="market-metric-grid">
      <Metric label={t('平均交易時間')} value={durationText(product.averageDuration,t)}/>
      <Metric label={t('夏普比率')} value={product.sharpe===null?'—':product.sharpe.toFixed(2)}/>
      <Metric label={t('期望值')} value={`${fmt(product.expectancy)} ${product.currency}`} detail={`${t('平均報酬率')} ${percentChangeText(product.expectancyPercent)}`} tone={product.expectancy>0?'profit':product.expectancy<0?'loss':undefined} detailTone={product.expectancyPercent===null?undefined:product.expectancyPercent>0?'profit':product.expectancyPercent<0?'loss':undefined}/>
      <Metric label={t('最賺錢的天')} value={product.bestWeekday?`${t(weekdays[product.bestWeekday.weekday])} · ${fmt(product.bestWeekday.net)} ${product.currency}`:'—'} tone={product.bestWeekday&&product.bestWeekday.net!==0?product.bestWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('最賠錢的天')} value={product.worstWeekday?`${t(weekdays[product.worstWeekday.weekday])} · ${fmt(product.worstWeekday.net)} ${product.currency}`:'—'} tone={product.worstWeekday&&product.worstWeekday.net!==0?product.worstWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('平均盈利時間')} value={durationText(product.averageWinDuration,t)}/>
      <Metric label={t('平均虧損時間')} value={durationText(product.averageLossDuration,t)}/>
    </div></section>;})}</div>{!data.products.length&&<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('夏普比率以逐筆淨損益計算，未年化；期望值金額為每筆平均淨損益，百分比為平均逐筆報酬率。')}</p></section>}

    {(!favoritesOnly || favoriteIds.includes('summary')) && <section id={tradeStatusFavoriteDomId('summary')} className="panel status-card status-full"><StatusHeader id="summary" title={t('交易報導')} icon={<Activity/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><button className="primary-button" aria-busy={summaryBusy} disabled={!signedIn || demo || summaryBusy} onClick={() => void generate()}><RefreshCw size={15} className={summaryBusy ? 'animate-spin' : ''}/>{summaryBusy ? t('生成中…') : t('生成 AI 總結')}</button></StatusHeader>{summary ? <div className="ai-summary"><h3>{t('期間總結')}</h3><p>{summary.overview}</p><div className="summary-columns"><div><h3>{t('策略總結')}</h3><p>{summary.strategySummary || t('本期間沒有足夠的策略心得。')}</p></div><div><h3>{t('心得總結')}</h3><p>{summary.reflectionSummary || t('本期間沒有足夠的心得內容。')}</p></div></div>{summarySections.map(([title, items]) => <div key={title}><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div> : <p className="status-empty">{signedIn && !demo ? t('按右上方按鈕，AI 將依所選期間的交易、策略與心得生成交易報導。') : t('登入並選擇我的紀錄後即可生成個人 AI 交易報導。')}</p>}{summaryError && <p className="status-error">{summaryError}</p>}</section>}

    {(!favoritesOnly || favoriteIds.includes('best-worst-time') || favoriteIds.some(id => id.startsWith('time-chart:'))) && <section id={tradeStatusFavoriteDomId('best-worst-time')} className="panel status-card status-full"><StatusHeader id="best-worst-time" title={t('最佳與最低勝率時間')} icon={<Clock3/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><div className="time-chart-actions"><div className="status-switch" role="group" aria-label={t('切換統計方式')}><button type="button" aria-pressed={timeMode === 'clock'} className={timeMode === 'clock' ? 'active' : ''} onClick={() => setTimeMode('clock')}>{t('交易時段')}</button><button type="button" aria-pressed={timeMode === 'holding'} className={timeMode === 'holding' ? 'active' : ''} onClick={() => setTimeMode('holding')}>{t('持倉時間')}</button></div><InfoTooltip label={t('統計方式說明')} contentClassName="factor-help-wide"><strong>{t('統計方式說明')}</strong><section><strong>{t('交易時段')}</strong><p>{t('依進場日期判斷是否在所選期間內，再按進場時間的小時分組。')}</p></section><section><strong>{t('持倉時間')}</strong><p>{t('依進場日期判斷是否在所選期間內；持倉時間以出場時間減進場時間計算，未滿一小時按分鐘分組。')}</p></section><p className="factor-help-note">{t('每組勝率等於獲利交易筆數除以該組交易總筆數；打平交易計入總筆數，但不計為獲利。最高與最低勝率只比較有交易的分組，並按市場及幣別分開統計。')}</p></InfoTooltip></div></StatusHeader><p>{timeMode === 'clock' ? `${t(timezoneName(timezone))} · ${utcOffsetLabel(timezone)}` : `${t('滑鼠移至圖表可查看時間與勝率。')} ${t('不足一小時以分鐘顯示。')}`} · {t('交易時段依進場時間分組；持倉時間為出場時間減進場時間。')}</p><div className="time-chart-grid">{data.timeProducts.filter(product => !favoritesOnly || favoriteIds.includes('best-worst-time') || favoriteIds.includes(`time-chart:${product.market}:${product.currency}`)).map(product => {
      const buckets = timeMode === 'clock' ? product.clock : product.holding;
      const activeBuckets = buckets.filter(item => item.count > 0 && item.winRate !== null);
      const best = [...activeBuckets].sort((a, b) => (b.winRate || 0) - (a.winRate || 0))[0];
      const worst = [...activeBuckets].sort((a, b) => (a.winRate || 0) - (b.winRate || 0))[0];
      const favoriteId = `time-chart:${product.market}:${product.currency}`;
      return <section id={tradeStatusFavoriteDomId(favoriteId)} className="time-chart-product" key={favoriteId}><header><div className="time-chart-heading"><FavoriteStar active={favoriteIds.includes(favoriteId)} title={tradeStatusFavoriteTitle(favoriteId,t)} onToggle={()=>onToggleFavorite(favoriteId)}/><h3>{t(marketName(product.market))} · {product.currency}</h3></div><span>{t('總交易筆數')}：{product.count}</span></header>{best && worst && <div className="best-worst"><span>{t('最高勝率')} · {best.label} <b>{best.winRate?.toFixed(1)}%</b></span><span>{t('最低勝率')} · {worst.label} <b>{worst.winRate?.toFixed(1)}%</b></span></div>}<div className="status-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={buckets} margin={{ top: 12, right: 18, bottom: 20, left: 16 }}><CartesianGrid strokeDasharray="1 6"/><XAxis dataKey="label" minTickGap={20} label={{ value: timeMode === 'clock' ? t('交易時間') : t('持倉時間'), position: 'insideBottom', offset: -8 }}/><YAxis width={48} domain={[0, 100]} tickFormatter={value => `${value}%`} label={{ value: t('勝率 (%)'), angle: -90, position: 'insideLeft', dx: -4 }}/><Tooltip cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.92, strokeDasharray: '3 3', strokeWidth: 2 }} isAnimationActive={false} content={({ active, payload, label }) => { const point = payload?.[0]?.payload as TimeBucket | undefined; if (!active || !point || point.winRate === null) return null; return <div className="status-tooltip"><span>{String(label)}</span><strong>{t('勝率')} · {point.winRate.toFixed(1)}%</strong><small>{t('交易筆數')} · {point.count}</small></div>; }}/><Line type="linear" dataKey="winRate" stroke="var(--foreground)" strokeWidth={2.2} dot={{ r: 2.5, strokeWidth: 1, fill: 'var(--background)' }} activeDot={{ r: 4, fill: 'var(--foreground)' }} connectNulls isAnimationActive={false}/></LineChart></ResponsiveContainer></div></section>;
    })}</div>{!data.timeProducts.length && <Empty text={t('所選期間尚無交易。')}/>}</section>}

    <Card favoriteId="comparison" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('與前一個等長期間比較')}><Row name={t('平均損益')} value={percentChangeText(averagePnlChange)} className={percentChangeClass(averagePnlChange)}/>{durationComparisons.map(item=><Row key={item.name} name={item.name} value={percentChangeText(item.value)} className={percentChangeClass(item.value)}/>)}</Card>
    <Card favoriteId="rules" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<CheckCircle2/>} title={t('所選期間遵守的規則')}>{data.strategies.slice(0, 3).map(rule => { const activeDays = Math.max(new Set(selected.map(trade => trade.exitTime.slice(0, 10))).size, 1); const days = new Set(selected.filter(trade => trade.strategy.includes(rule.name.split('／')[0]) || trade.notes.includes(rule.name.split('／')[0])).map(trade => trade.exitTime.slice(0, 10))).size; const rate = days / activeDays * 100; return <div className="rule-row" key={rule.name}><CheckCircle2 className={rate >= 80 ? 'checked' : ''}/><span>{t(rule.name)}</span><b>{rate.toFixed(0)}%</b></div>; })}{!data.strategies.length && <Empty text={t('先在策略與心得中記下規則，系統才會計算。')}/>}</Card>
  </div>;
}

function StatusHeader({ id, title, icon, favoriteIds, onToggleFavorite, t, children }: { id: string; title: string; icon: React.ReactNode; favoriteIds: string[]; onToggleFavorite: (id: string) => void; t: (text: string, values?: unknown[]) => string; children?: React.ReactNode }) {
  return <header><div className="status-card-heading"><FavoriteStar active={favoriteIds.includes(id)} title={tradeStatusFavoriteTitle(id,t)} onToggle={()=>onToggleFavorite(id)}/><div className="status-card-title">{icon}<h2>{title}</h2></div></div>{children}</header>;
}
function Card({ icon, title, favoriteId, favoriteIds, onToggleFavorite, t, children, hidden = false, favoritesOnly = false, className = '', actions }: { icon: React.ReactNode; title: string; favoriteId: string; favoriteIds: string[]; onToggleFavorite: (id: string) => void; t: (text: string, values?: unknown[]) => string; children: React.ReactNode; hidden?: boolean; favoritesOnly?: boolean; className?: string; actions?: React.ReactNode }) { if (hidden || (favoritesOnly && !favoriteIds.includes(favoriteId))) return null; return <section id={tradeStatusFavoriteDomId(favoriteId)} className={`panel status-card ${className}`}><StatusHeader id={favoriteId} title={title} icon={icon} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}>{actions}</StatusHeader>{children}</section>; }
function Metric({label,value,detail,tone,detailTone}:{label:string;value:string;detail?:string;tone?:'profit'|'loss';detailTone?:'profit'|'loss'}){return <div className="market-metric"><span>{label}</span><strong className={tone==='profit'?'profit-value':tone==='loss'?'loss-value':''}>{value}</strong>{detail&&<small className={detailTone==='profit'?'profit-value':detailTone==='loss'?'loss-value':''}>{detail}</small>}</div>;}
function Row({ name, value, className = '' }: { name: string; value: string; className?: string }) { return <div className="status-row"><span>{name}</span><b className={className}>{value}</b></div>; }
function Progress({ name, value, suffix }: { name: string; value: number; suffix: string }) { return <div className="status-progress"><div><span title={name}>{name}</span><b>{suffix}</b></div><i><em style={{ width: `${Math.min(value, 100)}%` }}/></i></div>; }
function Empty({ text }: { text: string }) { return <p className="status-empty">{text}</p>; }

function groupRows<T>(rows:T[],keyOf:(row:T)=>string){const groups=new Map<string,T[]>();for(const row of rows){const key=keyOf(row);groups.set(key,[...(groups.get(key)??[]),row]);}return [...groups];}
function chartCurrency(source:string,target:string,rates:StatusExchangeRates|null){if(target==='auto'||target===source)return{factor:1,currency:source};const from=rates?.rates?.[source],to=rates?.rates?.[target],factor=Number(from)>0&&Number(to)>0?Number(to)/Number(from):NaN;return Number.isFinite(factor)&&factor>0?{factor,currency:target}:{factor:1,currency:source};}

function StrategyPreferences({data,t}:{data:ReturnType<typeof enteredStrategyStats>;t:(text:string,values?:unknown[])=>string}){
 const rows=(items:typeof data.overall)=><div className="strategy-preference-rows">{items.map(item=><Progress key={item.name} name={item.name} value={item.percent} suffix={`${item.percent.toFixed(1)}% · ${item.count} ${t('次')}`}/>)}</div>;
 return <div className="strategy-preferences"><section className="strategy-preference-section"><header><strong>{t('整體')}</strong><span>{t('{0} 個策略項目',[data.overall.reduce((sum,item)=>sum+item.count,0)])}</span></header>{rows(data.overall)}</section>{data.markets.map(group=><section className="strategy-preference-section" key={group.market}><header><strong>{t(marketName(group.market))}</strong><span>{t('{0} 個策略項目',[group.count])}</span></header>{rows(group.rows)}</section>)}<p className="market-metrics-note">{t('依逐筆策略分組，英文不分大小寫，繁簡字及常見中文同義名稱合併；同筆同策略只算一次。百分比以策略項目總數為分母。')}</p></div>;
}

function RecoveryStats({rows,t}:{rows:RecoveryItem[];t:(text:string,values?:unknown[])=>string}){
 return <div className="analytics-product-grid">{rows.map(row=>{const increaseRate=row.postStreakSamples?row.postStreakIncreases/row.postStreakSamples*100:null;return <section className="analytics-product" key={`${row.market}-${row.currency}`}><header><strong>{t(marketName(row.market))} · {row.currency}</strong><span>{row.count} {t('筆')}</span></header><div className="recovery-metrics"><Metric label={t('最長連敗')} value={`${row.maxLosingStreak} ${t('筆')}`} tone={row.maxLosingStreak>=3?'loss':undefined}/><Metric label={t('最長回到資金前高')} value={durationText(row.maxRecoveryMinutes,t)}/><Metric label={t('目前回撤經過時間')} value={row.currentRecoveryMinutes===null?t('目前沒有未恢復回撤'):durationText(row.currentRecoveryMinutes,t)}/><Metric label={t('連敗後加大部位')} value={increaseRate===null?t('資料不足'):`${row.postStreakIncreases}/${row.postStreakSamples} · ${increaseRate.toFixed(1)}%`} detail={t('比較同商品、連敗後的下一筆交易')}/></div></section>;})}</div>;
}

function MaeMfeAverages({rows,t,baseCurrency,rates}:{rows:MaeMfeRow[];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null}){
  const summarize=(items:MaeMfeRow[],scope:string)=>{
  const groups=new Map<string,{mae:number[];mfe:number[];count:number}>();
  for(const row of items){const display=chartCurrency(row.currency,baseCurrency,rates),current=groups.get(display.currency)??{mae:[],mfe:[],count:0};current.count++;if(row.mae!==null)current.mae.push(row.mae*display.factor);if(row.mfe!==null)current.mfe.push(row.mfe*display.factor);groups.set(display.currency,current);}
  return [...groups].map(([currency,group])=>({scope,currency,count:group.count,maeCount:group.mae.length,mfeCount:group.mfe.length,mae:group.mae.length?group.mae.reduce((sum,value)=>sum+value,0)/group.mae.length:null,mfe:group.mfe.length?group.mfe.reduce((sum,value)=>sum+value,0)/group.mfe.length:null}));
 };
 const overall=summarize(rows,t('整體')),markets=rows.length?[...new Set(rows.map(row=>row.market))].flatMap(market=>summarize(rows.filter(row=>row.market===market),t(marketName(market)))):[];
 const cards=[...overall,...markets];
 return cards.length?<><h3 className="mae-mfe-summary-heading">{t('平均 MAE／MFE')}<small>{baseCurrency==='auto'?t('未選換算幣別，整體依原幣別分列。'):t('依目前選擇的主要換算幣別統計；缺少匯率時保留原幣別分列。')}</small></h3><div className="mae-mfe-average-grid">{cards.map((item,index)=><section className="market-metric" key={item.scope+'-'+item.currency+'-'+index}><span>{item.scope} · {item.currency}</span><strong className={item.mae===null?'':item.mae<0?'loss-value':'profit-value'}>{t('平均浮虧 MAE')} · {item.mae===null?'—':fmt(item.mae)+' '+item.currency}</strong><strong className={item.mfe===null?'':item.mfe>0?'profit-value':'loss-value'}>{t('平均浮盈 MFE')} · {item.mfe===null?'—':fmt(item.mfe)+' '+item.currency}</strong><small>{t('MAE 樣本 {0} · MFE 樣本 {1} · 交易 {2}',[item.maeCount,item.mfeCount,item.count])}</small></section>)}</div></>:null;
}

type MaeMfeMetric='mae'|'mfe'|'actual';
type MaeMfePoint={referenceSymbol?:string;productType?:string;index:number;value:number;metric:MaeMfeMetric;symbol:string;entryTime:string;currency:string;originalCurrency:string;candleCount:number;source:'manual'|'exchange'|'actual';provider:string;timeframe?:string;displayFactor:number};
function PlotCrosshair({cursor}:{cursor:{x:number;y:number}|null}){
 const area=usePlotArea();if(!area||!cursor||cursor.x<area.x||cursor.x>area.x+area.width||cursor.y<area.y||cursor.y>area.y+area.height)return null;
 return <g className="analytics-crosshair" pointerEvents="none" aria-hidden="true"><line x1={cursor.x} x2={cursor.x} y1={area.y} y2={area.y+area.height}/><line x1={area.x} x2={area.x+area.width} y1={cursor.y} y2={cursor.y}/></g>;
}
function MaeMfeScatter({rows,currency,t,emptyText}:{rows:MaeMfeRow[];currency:string;t:(text:string,values?:unknown[])=>string;emptyText?:string}){
 const [cursor,setCursor]=useState<{x:number;y:number}|null>(null);
 const [pointHovered,setPointHovered]=useState(false);
 const points=rows.slice().sort((a,b)=>a.entryTime.localeCompare(b.entryTime)).map((row,index)=>({...row,index:index+1}));
 const scatter=(field:MaeMfeMetric):MaeMfePoint[]=>{const result:MaeMfePoint[]=[];for(const point of points){const raw=point[field];if(raw===null)continue;const source=field==='actual'?'actual':field==='mae'&&point.manualMae||field==='mfe'&&point.manualMfe?'manual':'exchange';result.push({index:point.index,value:raw,metric:field,symbol:point.symbol,entryTime:point.entryTime,originalCurrency:point.currency,currency,candleCount:point.candleCount,source,provider:point.provider,referenceSymbol:point.referenceSymbol,productType:point.productType,timeframe:point.timeframe,displayFactor:point.displayFactor??1});}return result;};
 const mae=scatter('mae'),mfe=scatter('mfe'),actual=scatter('actual'),empty=!mae.length&&!mfe.length,values=[...mae,...mfe,...actual].map(point=>point.value),minValue=values.length?values.reduce((min,value)=>Math.min(min,value),Infinity):-1,maxValue=values.length?values.reduce((max,value)=>Math.max(max,value),-Infinity):1,padding=Math.max((maxValue-minValue)*.12,Math.max(Math.abs(minValue),Math.abs(maxValue),1)*.05),axisMin=Math.min(0,minValue)-padding,axisMax=Math.max(0,maxValue)+padding,rawStep=(axisMax-axisMin)/4,power=10**Math.floor(Math.log10(rawStep)),step=([1,2,5,10].find(scale=>scale*power>=rawStep)??10)*power,yDomain:[number,number]=[Math.floor(axisMin/step)*step,Math.ceil(axisMax/step)*step],yTicks=Array.from({length:Math.round((yDomain[1]-yDomain[0])/step)+1},(_,index)=>Math.abs(yDomain[0]+index*step)<step/1000?0:yDomain[0]+index*step);
 return <div className="mae-mfe-chart-wrap"><div className="analytics-horizontal-axis-labels mae-mfe-axis-labels"><span>{t('損益金額')} · {currency}</span></div><div className="status-chart analytics-scatter-chart" onPointerMove={event=>{const box=event.currentTarget.getBoundingClientRect();setCursor({x:event.clientX-box.left,y:event.clientY-box.top});setPointHovered(event.target instanceof Element&&!!event.target.closest('.recharts-scatter-symbol'));}} onPointerLeave={()=>{setCursor(null);setPointHovered(false);}} onFocusCapture={()=>setPointHovered(true)} onBlurCapture={()=>setPointHovered(false)}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:12,right:20,bottom:25,left:14}}><CartesianGrid strokeDasharray="1 5"/><XAxis axisLine={false} tickLine={false} type="number" dataKey="index" name={t('交易序號')} domain={[0,Math.max(1,points.length)]} tickFormatter={value=>String(Math.round(Number(value)))} label={{value:t('交易序號'),position:'insideBottom',offset:-14}}/><YAxis axisLine={false} tickLine={false} type="number" dataKey="value" name={currency} domain={yDomain} ticks={yTicks} tickFormatter={value=>fmt(Number(value))}/><ZAxis range={[48,48]}/><ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.5} strokeWidth={1}/><Tooltip active={pointHovered} cursor={false} isAnimationActive={false} content={({active,payload})=>{const point=payload?.[0]?.payload as MaeMfePoint|undefined;if(!active||!point)return null;const shown=point.value,metric=point.metric==='mae'?t('最大浮虧 MAE'):point.metric==='mfe'?t('最大浮盈 MFE'):t('實際淨損益');return <div className="status-tooltip"><strong>{point.symbol} · {point.entryTime.replace('T',' ')}</strong><span className={shown<0?'loss-value':shown>0?'profit-value':''}>{metric} · {fmt(shown)} {point.currency}</span>{point.originalCurrency!==point.currency&&<small>{t('原幣別')} · {fmt(shown/point.displayFactor)} {point.originalCurrency}</small>}<small>{point.source==='manual'?t('手動填寫'):point.source==='actual'?t('已保存交易淨損益'):t('交易所 OHLC 區間估算 · {0} · {1}',[point.provider,point.timeframe??'1m'])}</small>{point.source==='exchange'&&<small>{t('參考商品')} · {point.referenceSymbol??point.symbol} · {t(point.productType==='spot'?'現貨':point.productType==='perpetual'?'永續合約':point.productType==='future'?'期貨':'股票')}</small>}{point.candleCount>0&&point.source==='exchange'&&<small>{t('K 線數量')} · {point.candleCount}</small>}</div>;}}/><Scatter isAnimationActive={false} name={t('最大浮虧 MAE')} data={mae} dataKey="value" fill="var(--loss-color)"/><Scatter isAnimationActive={false} name={t('最大浮盈 MFE')} data={mfe} dataKey="value" fill="var(--profit-color)"/><Scatter isAnimationActive={false} name={t('實際淨損益')} data={actual} dataKey="value" fill="var(--foreground)"/><PlotCrosshair cursor={cursor}/></ScatterChart></ResponsiveContainer>{empty&&emptyText&&<div className="analytics-chart-empty">{emptyText}</div>}</div><div className="analytics-chart-legend"><span><i className="loss-legend"/>{t('最大浮虧 MAE')}</span><span><i className="profit-legend"/>{t('最大浮盈 MFE')}</span><span><i className="actual-legend"/>{t('實際淨損益')}</span></div></div>;
}
function MaeMfeCharts({groups,t,baseCurrency,rates}:{groups:[string,MaeMfeRow[]][];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null}){
 if(!groups.length)return <MaeMfeScatter rows={[]} currency={baseCurrency==='auto'?'—':baseCurrency} t={t} emptyText={t('尚無 MAE／MFE 資料；可手動填寫，或補齊商品類型／行情金鑰後分析。')}/>;
 return <div className="analytics-product-grid">{groups.map(([key,rows])=>{const market=rows[0].market,sourceCurrency=rows[0].currency,display=chartCurrency(sourceCurrency,baseCurrency,rates),chartRows=rows.map(row=>({...row,displayFactor:display.factor,mae:row.mae===null?null:row.mae*display.factor,mfe:row.mfe===null?null:row.mfe*display.factor,actual:row.actual*display.factor}));return <section className="analytics-product" key={key}><header><strong>{t(marketName(market))} · {display.currency}{display.currency!==sourceCurrency?' ('+sourceCurrency+')':''}</strong><span>{rows.length} {t('筆')}</span></header><MaeMfeScatter rows={chartRows} currency={display.currency} t={t}/></section>;})}</div>;
}

function ProfitConcentrationCharts({groups,t,baseCurrency,rates}:{groups:ConcentrationGroup[];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null}){
  return <div className="analytics-product-grid">{groups.map(group=>{
    const display=chartCurrency(group.currency,baseCurrency,rates),start={index:0,trade:null as Trade|null,net:0,profitShare:null as number|null,cumulativeProfitShare:0 as number|null,lossShare:null as number|null,cumulativeLossShare:0 as number|null,displayNet:0},lastGain=group.rows.findLastIndex(row=>row.net>=0),chartRows=[{...start,profitCurve:group.rows.some(row=>row.net>0)?0:null,lossCurve:lastGain===-1?0:null},...group.rows.map((row,index)=>({...row,displayNet:row.net*display.factor,profitCurve:row.net>0?row.cumulativeProfitShare:null,lossCurve:row.net<0?row.cumulativeLossShare:index===lastGain?0:null}))];
    return <section className="analytics-product" key={group.market+'-'+group.currency}>
      <header><strong>{t(marketName(group.market))} · {display.currency}{display.currency!==group.currency?' ('+group.currency+')':''}</strong><span>{group.rows.length} {t('筆')}</span></header>
      <div className="analytics-horizontal-axis-labels"><span>{t('淨損益')} · {display.currency}</span><span>{t('累積獲利／虧損占比')}</span></div>
      <div className="status-chart analytics-concentration-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartRows} margin={{top:12,right:18,bottom:36,left:12}}>
        <CartesianGrid strokeDasharray="1 5"/><XAxis dataKey="index" minTickGap={28} tickFormatter={value=>String(value)} label={{value:t('交易序號'),position:'insideBottom',offset:-20}}/>
        <YAxis yAxisId="pnl" tickFormatter={value=>fmt(Number(value))}/><YAxis yAxisId="share" orientation="right" domain={[0,100]} tickFormatter={value=>String(Number(value))+'%'} />
        <ReferenceLine y={0} yAxisId="pnl" stroke="var(--muted-foreground)"/><Tooltip cursor={{stroke:'var(--foreground)',strokeOpacity:.6,strokeDasharray:'2 4',strokeWidth:1}} isAnimationActive={false} content={({active,payload})=>{
          const row=payload?.find(item=>item.dataKey==='displayNet')?.payload as typeof chartRows[number]|undefined;if(!active||!row?.trade)return null;
          return <div className="status-tooltip"><strong>{row.trade.symbol} · {row.trade.exitTime.replace('T',' ')}</strong><span>{t('淨損益')} · {fmt(row.displayNet)} {display.currency}</span>{display.currency!==group.currency&&<small>{t('原幣別')} · {fmt(row.net)} {group.currency}</small>}{row.net>0?<><span className="profit-value">{t('單筆獲利占比')} · {row.profitShare===null?'—':row.profitShare.toFixed(1)+'%'} · {fmt(row.displayNet)} {display.currency}</span><small>{t('累積獲利占比')} · {row.cumulativeProfitShare===null?'—':row.cumulativeProfitShare.toFixed(1)+'%'}</small></>:row.net<0?<><span className="loss-value">{t('單筆虧損占比')} · {row.lossShare===null?'—':row.lossShare.toFixed(1)+'%'} · {fmt(row.displayNet)} {display.currency}</span><small>{t('累積虧損占比')} · {row.cumulativeLossShare===null?'—':row.cumulativeLossShare.toFixed(1)+'%'}</small></>:null}</div>;
        }}/>
        <Bar yAxisId="pnl" dataKey="displayNet" radius={[3,3,0,0]}>{chartRows.map(row=><Cell key={row.trade?.id??'zero'} fill={row.net>=0?'var(--profit-color)':'var(--loss-color)'}/>)}</Bar>
        <Line yAxisId="share" type="monotoneX" dataKey="profitCurve" name={t('累積獲利占比')} stroke="var(--profit-color)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}/>
        <Line yAxisId="share" type="monotoneX" dataKey="lossCurve" name={t('累積虧損占比')} stroke="var(--loss-color)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}/>
      </ComposedChart></ResponsiveContainer></div>
      <div className="analytics-chart-legend"><span><i className="pnl-legend"/>{t('單筆淨損益')}</span><span><i className="profit-line-legend"/>{t('累積獲利占比')}</span><span><i className="loss-line-legend"/>{t('累積虧損占比')}</span></div>
    </section>;
  })}</div>;
}
