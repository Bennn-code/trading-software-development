'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Target, TrendingUp, Users } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { PlotCrosshair } from './plot-crosshair';
import { useI18n } from './language-provider';
import ConvertedMoney from './converted-money';
import CryptoQuoteSourceSelect, { useCryptoQuoteSource } from './crypto-quote-source';
import MarketDataSettings from './market-data-settings';
import { StrategyPerformanceCharts, ProductDirectionCharts, NetPnlDistributionCharts, StrategyPreferenceChart } from './trade-performance-cards';
import { realizedDrawdownStats, strategyPerformanceStats, productDirectionStats, netPnlDistributionStats, settledPerformanceTrades, tradeTimestamp, type RealizedDrawdownStat } from '@/lib/trade-performance';
import { reportTradeCohorts, holdingMinutes, averageHoldingMinutes, currentLossStreaks } from '@/lib/report-cohorts';
import { performanceCurrencyTrades, performanceFxFactor } from '@/lib/performance-currency';
import type { QuoteKeys } from '@/lib/market-candles';
import { mergeMaeMfeBatch, retryableMaeMfe, type MaeMfeBatch, type MaeMfeQueueState } from '@/lib/mae-mfe-queue';
import { hydrateMaeMfeQueue } from '@/lib/mae-mfe-state';
import { savedExcursions } from '@/lib/trade-excursions';
import { overallMaeMfe } from '@/lib/mae-mfe-summary';
import { type ExchangeRates } from '@/lib/display-currency';
import InfoTooltip from '@/components/info-tooltip';
import FavoriteStar from '@/components/favorite-star';
import { cryptoExcursionPosition, cryptoProductForTrade, marketName, pnl, positionValue, type ExcursionTime, type Trade } from '@/lib/trades';
import { Choice } from './trade-fields';
import { tradeStatusFavoriteDomId, tradeStatusFavoriteTitle } from '@/lib/trade-status-favorites';
import { utcOffsetLabel, timezoneName } from '@/lib/preferences';
import type { DateRange, ReportPeriod } from '@/lib/report-period';
import { averagePnl, averageReturnPercent, bestDayShare, disciplineRate, durationMinutes, excursionPerformance, enteredStrategyStats, hasEnteredStrategies, holdingTimeStats, lossRecoveryStats, maeMfeFingerprint, mistakeStats, profitConcentration, sharpeRatio, strategyStats, weekdayPnlStats, winRate } from '@/lib/trade-status';

type Community = { mistakes: { name: string; count: number; percent: number }[]; profit: { label: string; value: number; currency: string }[]; returns: { label: string; value: number }[]; sampleSize: number };
type Summary = { overview: string; strategySummary: string; reflectionSummary: string; strengths: string[]; improvements: string[]; nextSteps: string[] };
type TimeBucket = { position: number; label: string; count: number; winRate: number | null };
type ProductCharts = { market: Trade['market']; currency: Trade['currency']; count: number; durationCount: number; winningDurationCount: number; losingDurationCount: number; averageDuration: number | null; previousAverageDuration: number | null; averageWinDuration: number | null; averageLossDuration: number | null; bestWeekday: { weekday: number; net: number } | null; worstWeekday: { weekday: number; net: number } | null; sharpe: number | null; expectancy: number; expectancyPercent: number | null };
type TimeProductCharts = { market: Trade['market']; currency: Trade['currency']; count: number; clock: TimeBucket[]; holding: TimeBucket[] };
type MaeMfeRow = {maeTime?:ExcursionTime|null;mfeTime?:ExcursionTime|null;sizeBasis?:string; referenceSymbol?:string;productType?:string;id:string;provider:string;timeframe?:string;market:Trade['market'];symbol:string;currency:string;mae:number|null;mfe:number|null;actual:number;candleCount:number;entryTime:string;manualMae?:boolean;manualMfe?:boolean;displayFactor?:number };
type MaeMfeAnalysis = MaeMfeQueueState<MaeMfeRow> & { selectionKey:string };
type RecoveryItem=ReturnType<typeof lossRecoveryStats>[number];
type ConcentrationGroup={market:Trade['market'];currency:Trade['currency'];rows:ReturnType<typeof profitConcentration>};
type StatusExchangeRates=ExchangeRates;
const fmt = (n: number) => n===0?'0':(n > 0 ? '+' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const change = (current: number, previous: number) => previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
const weekdays = ['週日','週一','週二','週三','週四','週五','週六'] as const;
function durationText(minutes:number|null,t:(text:string,values?:unknown[])=>string){if(minutes===null||!Number.isFinite(minutes))return '—';if(minutes<60)return `${Math.round(minutes)} ${t('分鐘')}`;if(minutes<1440)return `${(minutes/60).toFixed(1)} ${t('小時')}`;return `${(minutes/1440).toFixed(1)} ${t('天')}`;}
function percentChangeText(value:number|null){return value===null?'—':`${value>0?'+':''}${value.toFixed(1)}%`;}
function percentChangeClass(value:number|null){return value===null||value===0?'':value>0?'profit-value':'loss-value';}
function isSummary(value:unknown):value is Summary{if(!value||typeof value!=='object')return false;const summary=value as Partial<Summary>;return typeof summary.overview==='string'&&typeof summary.strategySummary==='string'&&typeof summary.reflectionSummary==='string'&&Array.isArray(summary.strengths)&&summary.strengths.every(item=>typeof item==='string')&&Array.isArray(summary.improvements)&&summary.improvements.every(item=>typeof item==='string')&&Array.isArray(summary.nextSteps)&&summary.nextSteps.every(item=>typeof item==='string');}
function isCommunity(value:unknown):value is Community{if(!value||typeof value!=='object')return false;const data=value as Partial<Community>;return typeof data.sampleSize==='number'&&Array.isArray(data.mistakes)&&data.mistakes.every(row=>!!row&&typeof row.name==='string'&&typeof row.count==='number'&&typeof row.percent==='number')&&Array.isArray(data.profit)&&data.profit.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number'&&typeof row.currency==='string')&&Array.isArray(data.returns)&&data.returns.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number');}
function isReviewResponse(value:unknown):value is {record?:{summary?:Summary|null}}{if(!value||typeof value!=='object')return false;const record=(value as {record?:unknown}).record;if(!record||typeof record!=='object')return false;const summary=(record as {summary?:unknown}).summary;return summary===null||isSummary(summary);}

export default function TradeStatus({ trades, timezone, period, anchor, range, demo = false, signedIn = false, baseCurrency = 'auto', favoriteIds, onToggleFavorite, favoritesOnly = false, analysisTrades = trades, profileId, onPersistedTrades, onEditTrade, onRefreshTrades }: { trades: Trade[]; timezone: string; period: ReportPeriod; anchor: string; range: DateRange; demo?: boolean; signedIn?: boolean; baseCurrency?: string; favoriteIds: string[]; onToggleFavorite: (id: string) => void; favoritesOnly?: boolean;analysisTrades?:Trade[];profileId?:string;onPersistedTrades?:(rows:Trade[])=>void;onEditTrade?:(trade:Trade)=>void;onRefreshTrades?:()=>void }) {
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
  const [maeMfePaused,setMaeMfePaused]=useState(false);
  const [quoteKeys,setQuoteKeys]=useState<QuoteKeys>({});
  const [cryptoSource,setCryptoSource]=useCryptoQuoteSource();
  const [confirmBusy,setConfirmBusy]=useState(false);
  const [retryRequested,setRetryRequested]=useState(false);
  const analysisRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>analysisRequest.current?.abort(),[]);
  const [statusRates,setStatusRates]=useState<StatusExchangeRates|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      let delay=3600000;
      try{
        const response=await fetch('/api/exchange-rates',{signal:controller.signal,cache:'no-store'});
        const value=response.ok?await response.json() as StatusExchangeRates:null;
        if(value&&value.rates&&typeof value.rates==='object'&&!controller.signal.aborted){
          setStatusRates(value);
          const timestamps=[value.updatedAt,value.usdtUpdatedAt].filter((stamp):stamp is number=>typeof stamp==='number'&&Number.isFinite(stamp));
          if(timestamps.length)delay=Math.max(60000,Math.min(3600000,Math.min(...timestamps)+3600000-Date.now()));
        }
      }catch{}
      if(!controller.signal.aborted)timer=setTimeout(refresh,delay);
    };
    void refresh();
    return()=>{controller.abort();clearTimeout(timer);};
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

  const canonical=useMemo(()=>new Map(analysisTrades.map(trade=>[trade.id,trade])),[analysisTrades]);
  const [observationTime,setObservationTime]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setObservationTime(Date.now()),timer=setTimeout(update,0),interval=setInterval(update,60000);
    return()=>{clearTimeout(timer);clearInterval(interval);};
  },[trades,range.end,timezone]);
  const cohorts=useMemo(()=>reportTradeCohorts(trades,analysisTrades,{start:range.start,end:range.end},timezone,observationTime),[trades,analysisTrades,range.start,range.end,timezone,observationTime]);
  const {selected,timeSelected,quoteTrades,observedAt}=cohorts;
  const historyRecovery=useMemo(()=>lossRecoveryStats(cohorts.historyTrades.filter(trade=>Number.isFinite(pnl(trade))),tradeTimestamp),[cohorts.historyTrades]);
  const historyStreaks=useMemo(()=>currentLossStreaks(cohorts.historyTrades),[cohorts.historyTrades]);
  const performance=useMemo(()=>{
    const converted=performanceCurrencyTrades(settledPerformanceTrades(quoteTrades,observedAt),baseCurrency,statusRates,observationTime),history=performanceCurrencyTrades(cohorts.historyTrades,baseCurrency,statusRates,observationTime),options={readNetOverride:baseCurrency!=='auto',asOf:observedAt};
    return {...converted,drawdown:realizedDrawdownStats(converted.trades,observedAt,options),overallDrawdown:realizedDrawdownStats(converted.trades,observedAt,{...options,combineMarkets:true}),historyDrawdown:realizedDrawdownStats(history.trades,observedAt,options),historyOverallDrawdown:realizedDrawdownStats(history.trades,observedAt,{...options,combineMarkets:true}),historyOmitted:history.omitted,
      strategies:strategyPerformanceStats(converted.trades,options),overallStrategies:strategyPerformanceStats(converted.trades,{...options,combineMarkets:true}),
      directions:productDirectionStats(converted.trades,options),
      distribution:netPnlDistributionStats(converted.trades,options),overallDistribution:netPnlDistributionStats(converted.trades,{...options,combineMarkets:true}),
      originals:baseCurrency==='auto'?null:{strategies:strategyPerformanceStats(quoteTrades,{asOf:observedAt}),directions:productDirectionStats(quoteTrades,{asOf:observedAt}),distribution:netPnlDistributionStats(quoteTrades,{asOf:observedAt})}};
  },[quoteTrades,cohorts.historyTrades,baseCurrency,statusRates,observedAt,observationTime]);
  const maeMfeSelectionKey=useMemo(()=>cryptoSource+'|'+maeMfeFingerprint(quoteTrades),[quoteTrades,cryptoSource]);
  const currentMaeMfeAnalysis=useMemo(()=>{
    const local=maeMfeAnalysis?.selectionKey===maeMfeSelectionKey?maeMfeAnalysis:{rows:[],skipped:[],attempted:[],resume:{}};
    return{...hydrateMaeMfeQueue(local,quoteTrades,cryptoSource,retryRequested),selectionKey:maeMfeSelectionKey};
  },[maeMfeAnalysis,maeMfeSelectionKey,quoteTrades,retryRequested,cryptoSource]);
  const maeMfeEligible=useMemo(()=>quoteTrades.filter(trade=>Number.isFinite(durationMinutes(trade))&&durationMinutes(trade)>0&&(savedExcursions(trade).mae.amount===null||savedExcursions(trade).mfe.amount===null)&&(trade.market==='crypto'?!!cryptoProductForTrade(trade):trade.market==='tw-stocks'||trade.market==='tw-index-futures'?!!quoteKeys.fugle:trade.market==='futures'?!!quoteKeys.databento:!!quoteKeys.twelveData)),[quoteTrades,quoteKeys]);
  const maeMfePending=useMemo(()=>maeMfeEligible.filter(trade=>!currentMaeMfeAnalysis.attempted.includes(trade.id)),[maeMfeEligible,currentMaeMfeAnalysis.attempted]);
  const maeMfeQueuePaused=maeMfePaused||currentMaeMfeAnalysis.requiresRetry;
  const maeMfeRetryIds=new Set(currentMaeMfeAnalysis.skipped.filter(item=>item.retryable).map(item=>item.id));
  const maeMfeWaitingCount=new Set([...maeMfePending.map(trade=>trade.id),...maeMfeRetryIds]).size;
  const maeMfeHandledCount=quoteTrades.filter(trade=>(currentMaeMfeAnalysis.attempted.includes(trade.id)&&!maeMfeRetryIds.has(trade.id))||(savedExcursions(trade).mae.amount!==null&&savedExcursions(trade).mfe.amount!==null)).length;
  const maeMfeVisibleError=maeMfeError||(currentMaeMfeAnalysis.requiresRetry?currentMaeMfeAnalysis.skipped.find(item=>item.retryable)?.reason??'行情分析已暫停；請查看未完成原因，確認授權或稍後續查。':'');
  useEffect(()=>{analysisRequest.current?.abort();},[maeMfeSelectionKey]);

  const data = useMemo(() => {
    const days = Math.max(1, Math.round((new Date(`${range.end}T00:00:00Z`).getTime() - new Date(`${range.start}T00:00:00Z`).getTime()) / 86400000) + 1);
    const priorEnd = new Date(`${range.start}T00:00:00Z`);
    priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setUTCDate(priorStart.getUTCDate() - days + 1);
    const previous = cohorts.historyDisplayed.filter(trade => trade.exitTime.slice(0, 10) >= priorStart.toISOString().slice(0, 10) && trade.exitTime.slice(0, 10) <= priorEnd.toISOString().slice(0, 10));
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
      const durations = rows.map(trade=>canonical.get(trade.id)??trade).filter(trade => Number.isFinite(holdingMinutes(trade)));
      const winningDurations = durations.filter(trade => pnl(trade) > 0);
      const losingDurations = durations.filter(trade => pnl(trade) < 0);
      return {
        market, currency, count: rows.length, durationCount: durations.length, winningDurationCount: winningDurations.length, losingDurationCount: losingDurations.length,
        averageDuration: averageHoldingMinutes(durations),
        previousAverageDuration: averageHoldingMinutes(previousRows.map(trade=>canonical.get(trade.id)??trade)),
        averageWinDuration: averageHoldingMinutes(winningDurations),
        averageLossDuration: averageHoldingMinutes(losingDurations),
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
      const holding = holdingTimeStats(rows.map(trade=>canonical.get(trade.id)??trade),holdingMinutes);
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
    const recovery=lossRecoveryStats(quoteTrades.filter(trade=>Number.isFinite(pnl(trade))),tradeTimestamp);
    const concentrationGroups=new Map<string,{market:Trade['market'];currency:Trade['currency'];rows:Trade[]}>();
    for(const trade of selected){const key=`${trade.market}|${trade.currency}`,group=concentrationGroups.get(key);if(group)group.rows.push(trade);else concentrationGroups.set(key,{market:trade.market,currency:trade.currency,rows:[trade]});}
    const concentration=[...concentrationGroups.values()].map(group=>({market:group.market,currency:group.currency,rows:profitConcentration(group.rows)}));
    return { previous, mistakes, strategies, enteredStrategies, symbols, products, timeProducts, riskScore, score, leverage, bestDays, recovery, concentration };
  }, [cohorts.historyDisplayed, canonical, quoteTrades, selected, timeSelected, range.start, range.end]);

  const durationComparisons = data.products.filter(product => product.averageDuration !== null).map(product => ({
    name: `${t(marketName(product.market))} · ${t('平均進出場時間')}`,
    value: product.previousAverageDuration === null ? null : change(product.averageDuration!, product.previousAverageDuration),
  }));
  const averagePnlChange = change(averagePnl(selected), averagePnl(data.previous));
  const risk = data.riskScore < 34 ? '保守' : data.riskScore < 67 ? '平衡' : '激進';
  const maeMfeRows=useMemo(()=>{const analyzed=new Map(currentMaeMfeAnalysis.rows.map(row=>[row.id,row]));return selected.map(trade=>{const saved=savedExcursions(canonical.get(trade.id)??trade),estimate=analyzed.get(trade.id)??saved.estimate;return{id:trade.id,market:trade.market,provider:estimate?.provider??trade.exchangeSource??'manual',timeframe:estimate?.timeframe,referenceSymbol:estimate?.referenceSymbol,productType:estimate?.productType,symbol:trade.symbol,currency:trade.currency,mae:saved.mae.amount??analyzed.get(trade.id)?.mae??null,mfe:saved.mfe.amount??analyzed.get(trade.id)?.mfe??null,actual:pnl(trade),candleCount:estimate?.candleCount??0,entryTime:trade.entryTime,maeTime:saved.mae.automatic?estimate?.maeTime:null,mfeTime:saved.mfe.automatic?estimate?.mfeTime:null,sizeBasis:estimate?.sizeBasis,manualMae:saved.mae.amount!==null&&!saved.mae.automatic,manualMfe:saved.mfe.amount!==null&&!saved.mfe.automatic};});},[selected,canonical,currentMaeMfeAnalysis.rows]);
  const maeMfeGroups=groupRows(maeMfeRows,row=>`${row.market}|${row.currency}`);
  const concentrationGroups:ConcentrationGroup[]=data.concentration;
  const cryptoWithoutSource=quoteTrades.filter(trade=>trade.market==='crypto'&&!cryptoProductForTrade(trade)&&(savedExcursions(trade).mae.amount===null||savedExcursions(trade).mfe.amount===null));
  const cryptoWithoutSize=quoteTrades.filter(trade=>trade.market==='crypto'&&cryptoProductForTrade(trade)&&!cryptoExcursionPosition(trade)&&(savedExcursions(trade).mae.amount===null||savedExcursions(trade).mfe.amount===null));
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
    if(!maeMfePending.length||analysisRequest.current)return;
    setMaeMfeBusy(true);setMaeMfeError('');
    const batch=maeMfePending.slice(0,3),resume=Object.fromEntries(batch.flatMap(trade=>currentMaeMfeAnalysis.resume[trade.id]?[[trade.id,currentMaeMfeAnalysis.resume[trade.id]]]:[]));
    const controller=new AbortController();analysisRequest.current=controller;
    try{
      const response=await fetch('/api/trade-status/mae-mfe',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({persist:true,profileId,retry:retryRequested,quoteKeys,cryptoSource,resume,trades:batch.map(trade=>({
        account:'quote',notes:'',strategy:'',imageId:null,cryptoProductType:trade.cryptoProductType,priceSymbol:trade.priceSymbol,
        id:trade.id,market:trade.market,currency:trade.currency,symbol:trade.symbol,side:trade.side,entryTime:trade.entryTime,exitTime:trade.exitTime,timezone:trade.timezone,
        entry:trade.entry,exit:trade.exit,quantity:trade.quantity,multiplier:trade.multiplier,positionValue:trade.positionValue,closingPositionValue:trade.closingPositionValue,marginAmount:trade.marginAmount,positionSizing:trade.positionSizing,leverage:trade.leverage,marginMode:trade.marginMode,exchangeSource:trade.exchangeSource,
        netOverride:trade.netOverride,profitBasis:trade.profitBasis,fees:trade.fees,funding:trade.funding,feeMode:trade.feeMode,commission:trade.commission,transactionTax:trade.transactionTax,
        exchangeFee:trade.exchangeFee,clearingFee:trade.clearingFee,settlementFee:trade.settlementFee,regulatoryFee:trade.regulatoryFee,secFee:trade.secFee,finraFee:trade.finraFee,futuresTax:trade.futuresTax,
      }))})});
      const result=await response.json() as Partial<MaeMfeBatch<MaeMfeRow>> & {error?:string;persistedTrades?:Trade[];conflicts?:string[]};
      if(controller.signal.aborted)return;
      if(!response.ok)throw new Error(result.error||t('MAE／MFE 分析失敗'));
      if(!Array.isArray(result.rows)||!Array.isArray(result.skipped)||!Array.isArray(result.completed)||!Array.isArray(result.deferred))throw new Error(t('MAE／MFE 分析回應不完整，已保留進度，請稍後續查。'));
      if(result.stopped){setRetryRequested(false);setMaeMfePaused(true);setMaeMfeError(t(result.skipped.find(item=>item.retryable)?.reason??'行情分析已暫停；請查看未完成原因，確認授權或稍後續查。'));}
      if(result.persistedTrades?.length)onPersistedTrades?.(result.persistedTrades);
      if(result.conflicts?.length){onRefreshTrades?.();setMaeMfePaused(true);setMaeMfeError(t('交易已被修改，請重新載入後分析；已保存的資料不會被覆蓋。'));return;}
      const received=result as MaeMfeBatch<MaeMfeRow>;
      if(!received.stopped&&!received.completed.length&&!received.deferred.some(item=>item.resume&&JSON.stringify(item.resume)!==JSON.stringify(currentMaeMfeAnalysis.resume[item.id])))throw new Error(t('MAE／MFE 分析回應不完整，已保留進度，請稍後續查。'));
      setMaeMfeAnalysis(previous=>{
        const current=previous?.selectionKey===maeMfeSelectionKey?previous:{rows:[],skipped:[],attempted:[],resume:{}};
        return{selectionKey:maeMfeSelectionKey,...mergeMaeMfeBatch(current,batch.map(trade=>trade.id),received)};
      });
    }catch(error){if(!controller.signal.aborted){setMaeMfePaused(true);setMaeMfeError(error instanceof Error?error.message:t('MAE／MFE 分析失敗'));}}
    finally{if(analysisRequest.current===controller)analysisRequest.current=null;setMaeMfeBusy(false);}
  },[maeMfePending,currentMaeMfeAnalysis.resume,maeMfeSelectionKey,quoteKeys,cryptoSource,t,profileId,retryRequested,onPersistedTrades,onRefreshTrades]);

  useEffect(()=>{
    if(!signedIn||demo||maeMfeBusy||maeMfeQueuePaused||maeMfeError||!maeMfePending.length||(favoritesOnly&&!favoriteIds.includes('mae-mfe')))return;
    const timer=setTimeout(()=>void analyzeMaeMfeNextBatch(),350);return()=>clearTimeout(timer);
  },[signedIn,demo,maeMfeBusy,maeMfeQueuePaused,maeMfeError,maeMfePending.length,favoritesOnly,favoriteIds,analyzeMaeMfeNextBatch]);

  async function confirmCryptoTypes(ids:string[],type:'spot'|'perpetual'){
    if(confirmBusy)return;setConfirmBusy(true);setMaeMfeError('');
    try{for(let start=0;start<ids.length;start+=200){const response=await fetch('/api/trade-status/mae-mfe/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileId,confirmations:Object.fromEntries(ids.slice(start,start+200).map(id=>[id,type]))})});const result=await response.json() as {error?:string;persistedTrades?:Trade[];conflicts?:string[]};if(!response.ok)throw new Error(result.error||t('儲存商品類型失敗'));if(result.persistedTrades?.length)onPersistedTrades?.(result.persistedTrades);if(result.conflicts?.length){onRefreshTrades?.();throw new Error(t('交易已被修改，請重新載入後分析；已保存的資料不會被覆蓋。'));}}setMaeMfePaused(false);}catch(error){setMaeMfeError(error instanceof Error?error.message:t('儲存商品類型失敗'));}finally{setConfirmBusy(false);}
  }
  function retryMaeMfeAnalysis(){setRetryRequested(true);setMaeMfeAnalysis({...retryableMaeMfe(currentMaeMfeAnalysis),selectionKey:maeMfeSelectionKey});setMaeMfeError('');setMaeMfePaused(false);}

  function applyQuoteKeys(keys:QuoteKeys){setQuoteKeys(keys);retryMaeMfeAnalysis();}

  return <div className="status-grid">
    <Card favoriteId="loss-recovery" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Activity/>} title={t('回撤、恢復與資料摘要')} className="status-full analytics-card status-compact-summary" actions={<InfoTooltip label={t('回撤與資料摘要說明')} contentClassName="factor-help-wide"><strong>{t('回撤與資料摘要說明')}</strong><p>{t('本期最大回撤只使用所選期間的已平倉淨損益，由期初零開始累積；目前回撤與恢復時間則使用此帳號完整交易歷史，計至所選期間結束或現在，取較早者。相同平倉時間先合併結算，不含未平倉浮盈虧、入金或出金。')}</p><p>{t('恢復從歷史損益高點計時，跨週、月、年不重置；最長恢復只計截止時已完成恢復的回撤。歷史樣本不受期間起點限制，截止後的交易不納入。各市場與幣別分開，整體只合併同幣別或有有效匯率的交易。')}</p><p>{t('完整行情指有效自動估算已涵蓋整段持倉，不代表逐筆成交。手動極值另計；只有 MAE 或 MFE 的交易按各指標獨立計算，空白不是零。')}</p><p>{t('浮盈保留率為每筆實際淨損益 ÷ 最大浮盈，再取有效樣本平均；只納入 MFE 大於零的交易。負值代表最後虧損，費用與粗週期估算可能使結果超出 0～100%，不會強制截斷。')}</p><p>{t('由盈轉虧比例為曾有正 MFE 且最後淨損益為負的筆數，除以有正 MFE 的有效樣本；打平不算虧損。')}</p></InfoTooltip>}>
      <StatusSummary drawdown={performance.drawdown} overall={performance.overallDrawdown} historyDrawdown={performance.historyDrawdown} historyOverall={performance.historyOverallDrawdown} historyRecovery={historyRecovery} historyStreaks={historyStreaks} historyOmitted={performance.historyOmitted} recovery={data.recovery} rows={maeMfeRows} trades={quoteTrades} observedAt={observedAt} timezone={timezone} pending={maeMfeWaitingCount} blocked={maeMfeQueuePaused} omitted={performance.omitted} t={t}/>
    </Card>
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
    <Card favoriteId="time-preference" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Clock3/>} title={t('交易時間偏好')}><p>{t(timezoneName(timezone))} · {utcOffsetLabel(timezone)} · 24 {t('時制')} · {t('按進場日期歸屬期間')} · {t('本期進場且已平倉 · 有效樣本 {0} 筆',[timeSelected.length])}</p>{data.timeProducts.map(product => <div className="preference-product" key={`${product.market}-${product.currency}`}><h3>{t(marketName(product.market))} · {product.currency}</h3>{product.clock.filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 3).map(item => <Row key={item.position} name={item.label} value={`${item.count} ${t('筆')}`}/>)}</div>)}</Card>
    {hasEnteredStrategies(data.enteredStrategies)&&<Card favoriteId="strategies" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Target/>} title={t('交易策略偏好')} className="status-full analytics-card"><StrategyPreferenceChart stats={data.enteredStrategies}/></Card>}
    <Card favoriteId="best-day" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('最好的一天佔本期獲利日總額')} hidden={!data.bestDays.length&&!favoriteIds.includes('best-day')} className="best-day-card">{data.bestDays.length ? data.bestDays.map(day => <div className="best-day-row" key={`${day.currency}-${day.date}`}><div className="best-day-top"><span>{day.date} · {day.currency}</span><strong className={day.net < 0 ? 'loss-value' : 'profit-value'}>{fmt(day.net)} {day.currency}<ConvertedMoney amount={day.net} currency={day.currency} baseCurrency={baseCurrency}/></strong></div><p className="best-day-share"><span>{t('佔本期獲利日淨損益')}</span><strong>{day.share === null ? '—' : `${day.share.toFixed(1)}%`}</strong></p><div className="best-day-symbols">{day.trades.map(trade => trade.symbol).filter((symbol, index, all) => all.indexOf(symbol) === index).map(symbol => <span key={symbol}>{symbol}</span>)}</div></div>) : <Empty text={t('所選期間尚無交易。')}/>}</Card>

    <Card favoriteId="strategy-performance" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<Target/>} title={t('策略實際績效')} className="status-full analytics-card" actions={<InfoTooltip label={t('策略績效說明')} contentClassName="factor-help-wide"><p>{t('每筆期望值為已保存淨損益合計除以交易筆數；勝率為獲利筆數除以總筆數，包含打平交易。同筆有多個策略時，各策略納入整筆損益，因此策略金額不可直接相加。少量樣本提醒只供閱讀，不代表統計顯著性。')}</p></InfoTooltip>}><PerformanceCurrencyNote omitted={performance.omitted} currency={performance.currency} t={t}/><StrategyPerformanceCharts groups={performance.strategies} overall={performance.overallStrategies} originalGroups={performance.originals?.strategies}/></Card>
    <Card favoriteId="product-direction" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('商品及做多／做空績效')} className="status-full analytics-card" actions={<InfoTooltip label={t('商品方向績效說明')} contentClassName="factor-help-wide"><p>{t('依市場、商品與方向分組，用已保存淨損益計算平均每筆結果；每個方向列出有效筆數。沒有交易的方向顯示空值，不當成零；不同商品與市場的合約規格不互相套用。')}</p></InfoTooltip>}><PerformanceCurrencyNote omitted={performance.omitted} currency={performance.currency} t={t}/><ProductDirectionCharts groups={performance.directions} originalGroups={performance.originals?.directions}/></Card>
    <Card favoriteId="pnl-distribution" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('單筆淨損益分布')} className="status-full analytics-card" actions={<InfoTooltip label={t('損益分布說明')} contentClassName="factor-help-wide"><p>{t('直方圖依單筆已平倉淨損益分箱，以零線分開獲利與虧損，打平獨立計數。區間高度表示筆數，寬度表示金額範圍；提示與數據表列出完整邊界。平均值、中位數與最大單筆結果使用同一組有效樣本。')}</p></InfoTooltip>}><PerformanceCurrencyNote omitted={performance.omitted} currency={performance.currency} t={t}/><NetPnlDistributionCharts groups={performance.distribution} overall={performance.overallDistribution} originalGroups={performance.originals?.distribution}/></Card>

    <Card favoriteId="mae-mfe" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<TrendingUp/>} title={t('每筆交易 MAE／MFE 區間')} className="status-full analytics-card" actions={<InfoTooltip label={t('MAE／MFE 統計說明')} contentClassName="factor-help-wide"><strong>{t('MAE／MFE 統計說明')}</strong><p>{t('MAE 是持倉期間相對進場價的最大浮虧，MFE 是最大浮盈；手動數值優先，自動數值來自同商品歷史 K 線的區間估算。報表按出場日期篩選，圖表按進場時間排序，並分市場與幣別顯示。')}</p><p>{t('自動來源按 OKX、Bybit、BingX 查詢同交易對；也可在開始前指定單一來源。遭拒絕或限流即停止，不自動切換來源；請確認來源可用後手動開始新的查詢。股票與期貨需行情金鑰及授權，現貨與永續不混用，缺資料不會畫成零。')}</p><p>{t('先依持倉期間選擇可完整查詢的分鐘線；查不到再嘗試 15 分鐘、30 分鐘、1 小時、4 小時或日線（依來源支援）。粗週期包含未持倉時段的價格，MAE／MFE 屬區間估算，可能高估幅度。')}</p><p>{t('已手動填寫的 MAE／MFE 優先顯示；空白代表沒有資料，不代表零。')}</p><p>{t('商品類型、補查結果與已查來源會隨交易保存；重新登入直接顯示有效結果，只查新增或計算資料改變的交易。手動值優先，已查完但缺行情的項目不會反覆掃描。')}</p></InfoTooltip>}>
      <MaeMfeAverages rows={maeMfeRows} t={t} baseCurrency={baseCurrency} rates={statusRates} now={observationTime}/>
      <div className="analysis-action-row"><CryptoQuoteSourceSelect value={cryptoSource} busy={maeMfeBusy} onChange={source=>{setCryptoSource(source);setRetryRequested(true);setMaeMfeError('');setMaeMfePaused(false);setMaeMfeAnalysis({selectionKey:source+'|'+maeMfeFingerprint(quoteTrades),rows:currentMaeMfeAnalysis.rows,attempted:currentMaeMfeAnalysis.rows.map(row=>row.id),skipped:[],resume:{}});}}/><MarketDataSettings keys={quoteKeys} busy={maeMfeBusy} onApply={applyQuoteKeys}/><button type="button" className="outline-button" disabled={!signedIn||demo||maeMfeBusy||!maeMfeWaitingCount} aria-busy={maeMfeBusy} onClick={retryMaeMfeAnalysis}><RefreshCw size={15} className={maeMfeBusy?'animate-spin':''}/>{maeMfeBusy?t('分析中…'):maeMfeWaitingCount?maeMfeQueuePaused||maeMfeError?t('繼續分析全部交易（{0} 筆）',[maeMfeWaitingCount]):t('分析全部交易（{0} 筆）',[maeMfeWaitingCount]):currentMaeMfeAnalysis.skipped.some(item=>item.retryable)?t('重試未取得行情'):cryptoWithoutSource.length?t('待確認商品類型'):cryptoWithoutSize.length?t('需補齊部位資料'):t('目前可查交易已完成')}</button>{maeMfePending.length>0&&!maeMfeQueuePaused&&<button type="button" className="outline-button" onClick={()=>setMaeMfePaused(true)}>{t('暫停')}</button>}<span role="status" aria-live="polite">{t('已處理 {0}／{1} 筆 · 兩項已齊 {2} 筆 · 待查 {3} 筆',[maeMfeHandledCount,quoteTrades.length,maeMfeRows.filter(row=>row.mae!==null&&row.mfe!==null).length,maeMfeWaitingCount])}{maeMfeQueuePaused?' · '+t(maeMfeBusy?'完成目前查詢後暫停':'已暫停'):''}</span></div><p className="market-metrics-note">{t('全部交易已排入佇列，依序分段查詢；查詢額度用完會保留進度接續，不把未查交易當成完成。遇限流或授權拒絕會暫停，請稍後手動續查。')}</p>
      <MaeMfePerformance rows={maeMfeRows} t={t} baseCurrency={baseCurrency} rates={statusRates} now={observationTime}/><MaeMfeCharts groups={maeMfeGroups} t={t} baseCurrency={baseCurrency} rates={statusRates} now={observationTime}/>
      <p className="market-metrics-note">{t('資料完整的 USDT 加密交易會自動分析，不需行情金鑰；未明確標示現貨或永續時，請先編輯商品類型。結果標示實際行情來源與週期，跨交易所價格可能不同。')}</p>
      {!signedIn||demo?<Empty text={t('登入並切換至我的紀錄後，才能查詢公開 K 線。')}/>:cryptoWithoutSource.length>0?<details className="analysis-product-types" open><summary>{t('有 {0} 筆加密交易需確認商品類型',[cryptoWithoutSource.length])}</summary><p>{t('確認的商品類型會永久保存於此交易帳號；之後登入不需再次確認。')}</p><div className="analysis-type-actions"><button type="button" className="outline-button" disabled={maeMfeBusy||confirmBusy} onClick={()=>void confirmCryptoTypes(cryptoWithoutSource.map(trade=>trade.id),'perpetual')}>{t('以上皆為永續合約')}</button><button type="button" className="outline-button" disabled={maeMfeBusy||confirmBusy} onClick={()=>void confirmCryptoTypes(cryptoWithoutSource.map(trade=>trade.id),'spot')}>{t('以上皆為現貨')}</button></div><div className="analysis-type-grid">{cryptoWithoutSource.map(trade=><Choice key={trade.id} label={`${trade.symbol} · ${trade.entryTime.replace('T',' ')}`} value="" options={[["",t('請確認商品類型')],["perpetual",t('永續合約')],["spot",t('現貨')]]} onChange={value=>{if(value)void confirmCryptoTypes([trade.id],value as 'spot'|'perpetual');}}/>)}</div></details>:null}
      {cryptoWithoutSize.length>0&&<details className="analysis-product-types" open><summary>{t('有 {0} 筆交易需核對部位資料',[cryptoWithoutSize.length])}</summary><p>{t('數量單位不明時不估算；請填實際幣數、進場倉位金額，或該筆保證金、槓桿與全倉／逐倉。')}</p><div className="analysis-type-grid">{cryptoWithoutSize.map(trade=><button className="outline-button" key={trade.id} disabled={!onEditTrade} onClick={()=>onEditTrade?.(trade)}>{trade.symbol} · {t('補齊部位資料')}</button>)}</div></details>}
      {currentMaeMfeAnalysis.skipped.length>0&&<details className="analysis-skipped"><summary>{t('未取得行情 {0} 筆 · 待重試 {1} 筆',[currentMaeMfeAnalysis.skipped.filter(item=>!item.retryable).length,currentMaeMfeAnalysis.skipped.filter(item=>item.retryable).length])}</summary>{currentMaeMfeAnalysis.skipped.map(item=><p key={item.id}>{selected.find(trade=>trade.id===item.id)?.symbol??item.id} · {item.retryable?t('待重試'):t('無法估算')} · {t(item.reason)}{item.diagnostic&&<small> · {item.diagnostic.provider} · HTTP {item.diagnostic.status}</small>}</p>)}</details>}{maeMfeVisibleError&&<p role="alert" className="status-error">{t(maeMfeVisibleError)}</p>}
    </Card>
    <Card favoriteId="profit-concentration" favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} favoritesOnly={favoritesOnly} t={t} icon={<BarChart3/>} title={t('損益變化與獲利集中度')} className="status-full analytics-card" actions={<InfoTooltip label={t('損益圖表統計說明')} contentClassName="factor-help-wide"><strong>{t('損益圖表統計說明')}</strong><p>{t('交易依單筆淨損益由高到低排序；獲利與虧損各自累加，獲利柱在零線上方，虧損柱以負值放在零線下方。兩組累積總額相加才是本期淨損益。獲利與虧損占比各用其總額計算，平滑曲線不超過 100%；此圖不是按時間排列的資金曲線。')}</p></InfoTooltip>}>{concentrationGroups.length?<ProfitConcentrationCharts groups={concentrationGroups} t={t} baseCurrency={baseCurrency} rates={statusRates} now={observationTime}/>:<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('交易依單筆淨損益由高到低排序；獲利與虧損各自累加，獲利柱在零線上方，虧損柱以負值放在零線下方。兩組累積總額相加才是本期淨損益。獲利與虧損占比各用其總額計算，平滑曲線不超過 100%；此圖不是按時間排列的資金曲線。')}</p></Card>

    {(!favoritesOnly || favoriteIds.includes('market-metrics') || favoriteIds.some(id => id.startsWith('market-stat:'))) && <section id={tradeStatusFavoriteDomId('market-metrics')} className="panel status-card status-full market-metrics-section"><StatusHeader id="market-metrics" title={t('各市場交易統計')} icon={<BarChart3/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><InfoTooltip label={t('統計方式說明')} contentClassName="factor-help-wide"><p>{t('已實現損益按設定時區的出場日期歸屬期間，整筆計入出場週、月或年，不按持倉天數拆分。週期為週一至週日；月份、季度與年份按日曆邊界。')}</p><p>{t('依設定時區的進場日期歸屬期間；持倉時間使用原始進出場時刻的完整時間差，跨週、月、年不截斷，切換時區不改變經過時間。平均持倉摘要使用本期平倉交易，因此樣本可能不同。')}</p></InfoTooltip></StatusHeader><div className="market-metrics-grid">{data.products.map(product => { const id = `market-stat:${product.market}:${product.currency}`; if (favoritesOnly && !favoriteIds.includes('market-metrics') && !favoriteIds.includes(id)) return null; return <section id={tradeStatusFavoriteDomId(id)} className="market-metrics-card" key={id}><header><div className="market-metric-heading"><FavoriteStar active={favoriteIds.includes(id)} title={tradeStatusFavoriteTitle(id,t)} onToggle={()=>onToggleFavorite(id)}/><h3>{t(marketName(product.market))} · {product.currency}</h3></div><span>{product.count} {t('筆')}</span></header><div className="market-metric-grid">
      <Metric label={t('平均交易時間')} value={durationText(product.averageDuration,t)} detail={t('本期平倉 · 有效樣本 {0} 筆',[product.durationCount])}/>
      <Metric label={t('夏普比率')} value={product.sharpe===null?'—':product.sharpe.toFixed(2)}/>
      <Metric label={t('期望值')} value={`${fmt(product.expectancy)} ${product.currency}`} detail={`${t('平均報酬率')} ${percentChangeText(product.expectancyPercent)}`} tone={product.expectancy>0?'profit':product.expectancy<0?'loss':undefined} detailTone={product.expectancyPercent===null?undefined:product.expectancyPercent>0?'profit':product.expectancyPercent<0?'loss':undefined}/>
      <Metric label={t('最賺錢的天')} value={product.bestWeekday?`${t(weekdays[product.bestWeekday.weekday])} · ${fmt(product.bestWeekday.net)} ${product.currency}`:'—'} tone={product.bestWeekday&&product.bestWeekday.net!==0?product.bestWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('最賠錢的天')} value={product.worstWeekday?`${t(weekdays[product.worstWeekday.weekday])} · ${fmt(product.worstWeekday.net)} ${product.currency}`:'—'} tone={product.worstWeekday&&product.worstWeekday.net!==0?product.worstWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('平均盈利時間')} value={durationText(product.averageWinDuration,t)} detail={t('本期平倉 · 有效樣本 {0} 筆',[product.winningDurationCount])}/>
      <Metric label={t('平均虧損時間')} value={durationText(product.averageLossDuration,t)} detail={t('本期平倉 · 有效樣本 {0} 筆',[product.losingDurationCount])}/>
    </div></section>;})}</div>{!data.products.length&&<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('夏普比率以逐筆淨損益計算，未年化；期望值金額為每筆平均淨損益，百分比為平均逐筆報酬率。')}</p></section>}

    {(!favoritesOnly || favoriteIds.includes('summary')) && <section id={tradeStatusFavoriteDomId('summary')} className="panel status-card status-full"><StatusHeader id="summary" title={t('交易報導')} icon={<Activity/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><button className="primary-button" aria-busy={summaryBusy} disabled={!signedIn || demo || summaryBusy} onClick={() => void generate()}><RefreshCw size={15} className={summaryBusy ? 'animate-spin' : ''}/>{summaryBusy ? t('生成中…') : t('生成 AI 總結')}</button></StatusHeader>{summary ? <div className="ai-summary"><h3>{t('期間總結')}</h3><p>{summary.overview}</p><div className="summary-columns"><div><h3>{t('策略總結')}</h3><p>{summary.strategySummary || t('本期間沒有足夠的策略心得。')}</p></div><div><h3>{t('心得總結')}</h3><p>{summary.reflectionSummary || t('本期間沒有足夠的心得內容。')}</p></div></div>{summarySections.map(([title, items]) => <div key={title}><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div> : <p className="status-empty">{signedIn && !demo ? t('按右上方按鈕，AI 將依所選期間的交易、策略與心得生成交易報導。') : t('登入並選擇我的紀錄後即可生成個人 AI 交易報導。')}</p>}{summaryError && <p className="status-error">{summaryError}</p>}</section>}

    {(!favoritesOnly || favoriteIds.includes('best-worst-time') || favoriteIds.some(id => id.startsWith('time-chart:'))) && <section id={tradeStatusFavoriteDomId('best-worst-time')} className="panel status-card status-full"><StatusHeader id="best-worst-time" title={t('最佳與最低勝率時間')} icon={<Clock3/>} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} t={t}><div className="time-chart-actions"><div className="status-switch" role="group" aria-label={t('切換統計方式')}><button type="button" aria-pressed={timeMode === 'clock'} className={timeMode === 'clock' ? 'active' : ''} onClick={() => setTimeMode('clock')}>{t('交易時段')}</button><button type="button" aria-pressed={timeMode === 'holding'} className={timeMode === 'holding' ? 'active' : ''} onClick={() => setTimeMode('holding')}>{t('持倉時間')}</button></div><InfoTooltip label={t('統計方式說明')} contentClassName="factor-help-wide"><strong>{t('統計方式說明')}</strong><p>{t('已實現損益按設定時區的出場日期歸屬期間，整筆計入出場週、月或年，不按持倉天數拆分。週期為週一至週日；月份、季度與年份按日曆邊界。')}</p><section><strong>{t('交易時段')}</strong><p>{t('先依設定時區判斷進場日期是否在所選期間內，再按進場時間的小時分組；只納入截至目前已平倉且時間有效的交易，跨期平倉仍歸入進場期間。')}</p></section><section><strong>{t('持倉時間')}</strong><p>{t('依設定時區的進場日期歸屬期間；持倉時間使用原始進出場時刻的完整時間差，跨週、月、年不截斷，切換時區不改變經過時間。平均持倉摘要使用本期平倉交易，因此樣本可能不同。')}</p></section><p className="factor-help-note">{t('每組勝率等於獲利交易筆數除以該組交易總筆數；打平交易計入總筆數，但不計為獲利。最高與最低勝率只比較有交易的分組，並按市場及幣別分開統計。')}</p></InfoTooltip></div></StatusHeader><p>{timeMode === 'clock' ? `${t(timezoneName(timezone))} · ${utcOffsetLabel(timezone)}` : `${t('滑鼠移至圖表可查看時間與勝率。')} ${t('不足一小時以分鐘顯示。')}`} · {t('本期進場且已平倉 · 有效樣本 {0} 筆',[timeSelected.length])}</p><div className="time-chart-grid">{data.timeProducts.filter(product => !favoritesOnly || favoriteIds.includes('best-worst-time') || favoriteIds.includes(`time-chart:${product.market}:${product.currency}`)).map(product => {
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
function chartCurrency(source:string,target:string,rates:StatusExchangeRates|null,now:number){if(target==='auto')return{factor:1,currency:source};const factor=performanceFxFactor(source,target,rates,now);return factor===null?{factor:1,currency:source}:{factor,currency:target};}

function PerformanceCurrencyNote({omitted,currency,t}:{omitted:number;currency:string|null;t:(text:string,values?:unknown[])=>string}){
 return <div className="performance-currency-note"><p className="market-metrics-note">{currency?t('依有效匯率逐筆換算為 {0} 後統計；原幣別數據可展開查看。',[currency]):t('原幣別分組顯示；整體也按幣別分開，不混加不同幣別。')}</p>{omitted>0&&<p className="market-metrics-note">{t('有 {0} 筆交易缺少有效匯率或損益，未納入換算統計。',[omitted])}</p>}</div>;
}
function StatusSummary({drawdown,overall,historyDrawdown,historyOverall,historyRecovery,historyStreaks,historyOmitted,recovery,rows,trades,observedAt,timezone,pending,blocked,omitted,t}:{drawdown:RealizedDrawdownStat[];overall:RealizedDrawdownStat[];historyDrawdown:RealizedDrawdownStat[];historyOverall:RealizedDrawdownStat[];historyRecovery:RecoveryItem[];historyStreaks:ReturnType<typeof currentLossStreaks>;historyOmitted:number;recovery:RecoveryItem[];rows:MaeMfeRow[];trades:Trade[];observedAt:number;timezone:string;pending:number;blocked:boolean;omitted:number;t:(text:string,values?:unknown[])=>string}){
 const [scope,setScope]=useState<'overall'|'markets'>('overall');
 const periodRows=scope==='overall'?overall:drawdown,historyRows=scope==='overall'?historyOverall:historyDrawdown;
 const keyOf=(row:{market:string;currency:string})=>row.market+'|'+row.currency;
 const periodByKey=new Map(periodRows.map(row=>[keyOf(row),row])),historyByKey=new Map(historyRows.map(row=>[keyOf(row),row]));
 const visible=[...new Set([...periodByKey.keys(),...historyByKey.keys()])].map(key=>({period:periodByKey.get(key),history:historyByKey.get(key)}));
 const byId=new Map(trades.map(trade=>[trade.id,trade]));
 const samples=rows.flatMap(row=>{const trade=byId.get(row.id);return trade?[{trade,mae:row.mae,mfe:row.mfe}]:[];});
 const ratios=scope==='overall'?[{label:t('整體'),rows:samples}]:[...new Set(rows.map(row=>row.market))].map(market=>({label:t(marketName(market)),rows:samples.filter(item=>item.trade.market===market)}));
 const stamp=(instant:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
 const history=rows.filter(row=>row.candleCount>0&&((row.mae!==null&&!row.manualMae)||(row.mfe!==null&&!row.manualMfe))).length;
 const maeCount=rows.filter(row=>row.mae!==null).length,mfeCount=rows.filter(row=>row.mfe!==null).length;
 const partial=rows.filter(row=>(row.mae===null)!==(row.mfe===null)).length,missing=rows.filter(row=>row.mae===null&&row.mfe===null).length;
 return <><div className="status-summary-toolbar"><div className="status-switch" role="group" aria-label={t('統計範圍')}><button type="button" className={scope==='overall'?'active':''} aria-pressed={scope==='overall'} onClick={()=>setScope('overall')}>{t('整體')}</button><button type="button" className={scope==='markets'?'active':''} aria-pressed={scope==='markets'} onClick={()=>setScope('markets')}>{t('分市場')}</button></div><small>{t('觀察截止')} · {stamp(observedAt)}</small></div>
 <p className="market-metrics-note">{t('本期最大回撤按所選期間；目前回撤與恢復狀況追溯完整歷史，計至觀察截止。')}</p>
 <div className="status-summary-grid">{visible.map(({period,history})=>{
  const row=history??period!;
  return <section className="status-summary-group" key={keyOf(row)}><header><strong>{row.market==='all'?t('整體'):t(marketName(row.market))} · {row.currency}</strong><span>{t('本期平倉 {0} 筆 · 歷史平倉 {1} 筆',[period?.count??0,history?.count??0])}</span></header><div className="status-summary-metrics">
    <Metric label={t('本期最大回撤金額')} value={period?fmt(-period.maxDrawdown)+' '+row.currency:'—'} detail={t('所選期間，期初為零')} tone={period&&period.maxDrawdown>0?'loss':undefined}/>
    <Metric label={t('目前回撤金額')} value={history?fmt(-history.currentDrawdown)+' '+row.currency:'—'} detail={t('相對歷史損益高點')} tone={history&&history.currentDrawdown>0?'loss':undefined}/>
    <Metric label={t('最長恢復所需時間')} value={durationText(history?.maxRecoveryMinutes??null,t)} detail={t('完整歷史，只計已恢復')}/>
    <Metric label={t('目前尚未恢復所經時間')} value={durationText(history?.currentRecoveryMinutes??null,t)} detail={!history?t('沒有有效歷史樣本'):history.currentRecoveryStart===null?t('目前沒有未恢復回撤'):t('起始日期 {0}',[stamp(history.currentRecoveryStart)])}/>
  </div></section>;
 })}{!visible.length&&<Empty text={t('截至觀察截止尚無已平倉交易。')}/>}</div>
 {historyOmitted>0&&<p className="market-metrics-note">{t('歷史回撤有 {0} 筆缺少有效匯率或損益，未納入；僅代表有效樣本。',[historyOmitted])}</p>}
 {omitted>0&&<p className="market-metrics-note">{t('有 {0} 筆交易缺少有效匯率或損益，未納入換算統計。',[omitted])}</p>}
 <div className="status-summary-grid excursion-summary-grid">{ratios.map(group=>{const result=excursionPerformance(group.rows);return <section className="status-summary-group" key={group.label}><header><strong>{group.label} · {t('浮盈保留')}</strong><span>{t('有效樣本 {0} 筆',[result.retentionSamples])}</span></header><div className="status-summary-metrics"><Metric label={t('平均浮盈保留率')} value={percentChangeText(result.profitRetention)} detail={t('保留率樣本 {0} · 未有正 MFE {1} 筆',[result.retentionSamples,group.rows.length-result.retentionSamples])}/><Metric label={t('曾有浮盈、最後虧損比例')} value={result.turnedLossRate===null?'—':result.turnedLossRate.toFixed(1)+'%'} detail={t('{0}／{1} 筆有效樣本',[result.turnedLossCount,result.positiveExcursionSamples])}/></div></section>;})}<section className="status-summary-group"><header><strong>{t('行情與資料完整度')}</strong><span>{rows.length} {t('筆')}</span></header><div className="status-summary-metrics"><Metric label={t('完整行情／總筆數')} value={`${history} / ${rows.length}`} detail={t('只計涵蓋持倉的有效自動估算')}/><Metric label={t('MAE／MFE 有效樣本')} value={`${maeCount} / ${mfeCount}`} detail={t('單側資料 {0} 筆 · 兩側缺漏 {1} 筆',[partial,missing])}/><Metric label={t('待查交易')} value={`${pending} ${t('筆')}`} detail={blocked?t('已暫停'):t('已保存結果直接顯示')}/><Metric label={t('手動極值交易')} value={`${rows.filter(row=>row.manualMae||row.manualMfe).length} ${t('筆')}`} detail={t('手動資料不當成完整行情')}/></div></section></div>
 <details className="status-summary-details"><summary>{t('連敗與部位變化明細')}</summary><div className="status-summary-grid">{historyRecovery.map(history=>{
  const period=recovery.find(row=>keyOf(row)===keyOf(history)),streak=historyStreaks.find(row=>keyOf(row)===keyOf(history));
  const increase=period?.postStreakSamples?period.postStreakIncreases/period.postStreakSamples*100:null;
  return <section className="status-summary-group" key={keyOf(history)}><header><strong>{t(marketName(history.market))} · {history.currency}</strong><span>{t('本期平倉 {0} 筆 · 歷史平倉 {1} 筆',[period?.count??0,history.count])}</span></header><div className="status-summary-metrics">
    <Metric label={t('本期最長連敗')} value={period?period.maxLosingStreak+' '+t('筆'):'—'}/>
    <Metric label={t('歷史最長連敗')} value={history.maxLosingStreak+' '+t('筆')}/>
    <Metric label={t('目前延續連敗')} value={streak?streak.streak+' '+t('筆'):'—'} detail={t('計至觀察截止，跨期不重置')}/>
    <Metric label={t('連敗後加大部位')} value={increase===null?'—':period!.postStreakIncreases+'/'+period!.postStreakSamples+' · '+increase.toFixed(1)+'%'} detail={t('本期同商品、連敗後的下一筆交易')}/>
  </div></section>;
 })}</div></details><p className="market-metrics-note">{t('本期損益按設定時區的出場日期統計；進場時段與持倉勝率圖按進場日期。歷史回撤與連敗僅使用截止前已平倉交易，不含未平倉部位或入出金；沒有有效樣本顯示空值。')}</p></>;
}

function MaeMfeAverages({rows,t,baseCurrency,rates,now}:{rows:MaeMfeRow[];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null;now:number}){
  const summarize=(items:MaeMfeRow[],scope:string)=>{
  const groups=new Map<string,{mae:number[];mfe:number[];count:number}>();
  for(const row of items){const display=chartCurrency(row.currency,baseCurrency,rates,now),current=groups.get(display.currency)??{mae:[],mfe:[],count:0};current.count++;if(row.mae!==null)current.mae.push(row.mae*display.factor);if(row.mfe!==null)current.mfe.push(row.mfe*display.factor);groups.set(display.currency,current);}
  return [...groups].map(([currency,group])=>({scope,currency,count:group.count,maeCount:group.mae.length,mfeCount:group.mfe.length,mae:group.mae.length?group.mae.reduce((sum,value)=>sum+value,0)/group.mae.length:null,mfe:group.mfe.length?group.mfe.reduce((sum,value)=>sum+value,0)/group.mfe.length:null}));
 };
 const overall=overallMaeMfe(rows,baseCurrency,rates,now),markets=rows.length?[...new Set(rows.map(row=>row.market))].flatMap(market=>summarize(rows.filter(row=>row.market===market),t(marketName(market)))):[];
 const metrics=(item:Pick<typeof overall,'mae'|'mfe'|'currency'|'maeCount'|'mfeCount'|'count'>)=><div className="mae-mfe-average-values"><strong className={item.mae===null?'':item.mae<0?'loss-value':'profit-value'}>{t('平均浮虧 MAE')} · {item.mae===null?'—':fmt(item.mae)+' '+item.currency}</strong><strong className={item.mfe===null?'':item.mfe>0?'profit-value':'loss-value'}>{t('平均浮盈 MFE')} · {item.mfe===null?'—':fmt(item.mfe)+' '+item.currency}</strong><small>{t('MAE 樣本 {0} · MFE 樣本 {1} · 交易 {2}',[item.maeCount,item.mfeCount,item.count])}</small></div>;
 return rows.length?<><h3 className="mae-mfe-summary-heading">{t('平均 MAE／MFE')}<small>{t('整體先逐筆換算為 USD 取平均，再轉為所選幣別；市場明細保留原分組。')}</small></h3><section className="market-metric mae-mfe-overall"><header><strong>{t('整體')} · {overall.currency}</strong><span>{rows.length} {t('筆')}</span></header>{metrics(overall)}{overall.missingRates>0&&<p className="market-metrics-note">{t('有 {0} 筆樣本缺少有效匯率，未納入整體平均。',[overall.missingRates])}</p>}{overall.conversionMissing&&<p className="market-metrics-note">{t('所選幣別匯率暫不可用，整體先顯示 USD。')}</p>}{rates?.provider&&<small className="market-metrics-note">{t('匯率來源')} · {rates.provider}</small>}</section><div className="mae-mfe-average-grid">{markets.map((item,index)=><section className="market-metric" key={item.scope+'-'+item.currency+'-'+index}><span>{item.scope} · {item.currency}</span>{metrics(item)}</section>)}</div></>:null;
}

function extremeRangeText(time:ExcursionTime|null|undefined,timeframe:string|undefined,t:(text:string,values?:unknown[])=>string){return time?t('參考 {0} K 線區間：相對進場約 {1}～{2} 分鐘',[timeframe??'—',Math.floor(time.elapsedStartMinutes),Math.ceil(time.elapsedEndMinutes)]):'—';}
type MaeMfeMetric='mae'|'mfe'|'actual';
function MaeMfePerformance({rows,t,baseCurrency,rates,now}:{rows:MaeMfeRow[];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null;now:number}){
 const timeText=(time:ExcursionTime|null|undefined,timeframe?:string)=>extremeRangeText(time,timeframe,t);
 return <div className="excursion-performance"><header><h3>{t('最大浮盈／浮虧金額與出現時間')}</h3><InfoTooltip label={t('浮盈保留與時間說明')} contentClassName="factor-help-wide"><p>{t('極值金額依每筆交易分別顯示；只有 MAE 或 MFE 時，另一側保留空值。手動值優先，沒有可驗證時間時只顯示金額。')}</p><p>{t('極值時間僅表示參考 K 線所在區間，不是精確發生分鐘。粗週期可能含進場前或出場後的價格，區間可能跨越持倉邊界；手動值或缺少時間資料顯示橫線。')}</p></InfoTooltip></header><details className="excursion-timing" open><summary>{t('最大浮盈／浮虧出現時間')}</summary><div className="excursion-timing-table" tabIndex={0} role="region" aria-label={t('最大浮盈／浮虧金額與出現時間')}><div className="excursion-timing-row"><strong>{t('商品 / 市場')}</strong><strong>{t('最大浮盈 MFE')} · {t('金額與區間')}</strong><strong>{t('最大浮虧 MAE')} · {t('金額與區間')}</strong></div>{rows.slice().sort((a,b)=>a.entryTime.localeCompare(b.entryTime)).map(row=>{const display=chartCurrency(row.currency,baseCurrency,rates,now);return <div className="excursion-timing-row" key={row.id}><span>{row.symbol}<small>{t(marketName(row.market))} · {row.entryTime.replace('T',' ')}</small></span><span><b className={row.mfe===null?'':'profit-value'}>{row.mfe===null?'—':fmt(row.mfe)+' '+row.currency}</b>{row.mfe!==null&&display.currency!==row.currency&&<small className="profit-value">{fmt(row.mfe*display.factor)} {display.currency}</small>}<small>{timeText(row.mfeTime,row.timeframe)}</small></span><span><b className={row.mae===null?'':'loss-value'}>{row.mae===null?'—':fmt(row.mae)+' '+row.currency}</b>{row.mae!==null&&display.currency!==row.currency&&<small className="loss-value">{fmt(row.mae*display.factor)} {display.currency}</small>}<small>{timeText(row.maeTime,row.timeframe)}</small></span></div>;})}</div></details></div>;
}
type MaeMfePoint={time?:ExcursionTime|null;sizeBasis?:string;referenceSymbol?:string;productType?:string;index:number;value:number;metric:MaeMfeMetric;symbol:string;entryTime:string;currency:string;originalCurrency:string;candleCount:number;source:'manual'|'exchange'|'actual';provider:string;timeframe?:string;displayFactor:number};
function MaeMfeScatter({rows,currency,t,emptyText}:{rows:MaeMfeRow[];currency:string;t:(text:string,values?:unknown[])=>string;emptyText?:string}){
 const [cursor,setCursor]=useState<{x:number;y:number}|null>(null);
 const [pointHovered,setPointHovered]=useState(false);
 const points=rows.slice().sort((a,b)=>a.entryTime.localeCompare(b.entryTime)).map((row,index)=>({...row,index:index+1}));
 const scatter=(field:MaeMfeMetric):MaeMfePoint[]=>{const result:MaeMfePoint[]=[];for(const point of points){const raw=point[field];if(raw===null)continue;const source=field==='actual'?'actual':field==='mae'&&point.manualMae||field==='mfe'&&point.manualMfe?'manual':'exchange';result.push({time:field==='mae'?point.maeTime:field==='mfe'?point.mfeTime:null,sizeBasis:point.sizeBasis,index:point.index,value:raw,metric:field,symbol:point.symbol,entryTime:point.entryTime,originalCurrency:point.currency,currency,candleCount:point.candleCount,source,provider:point.provider,referenceSymbol:point.referenceSymbol,productType:point.productType,timeframe:point.timeframe,displayFactor:point.displayFactor??1});}return result;};
 const mae=scatter('mae'),mfe=scatter('mfe'),actual=scatter('actual'),empty=!mae.length&&!mfe.length,values=[...mae,...mfe,...actual].map(point=>point.value),minValue=values.length?values.reduce((min,value)=>Math.min(min,value),Infinity):-1,maxValue=values.length?values.reduce((max,value)=>Math.max(max,value),-Infinity):1,padding=Math.max((maxValue-minValue)*.12,Math.max(Math.abs(minValue),Math.abs(maxValue),1)*.05),axisMin=Math.min(0,minValue)-padding,axisMax=Math.max(0,maxValue)+padding,rawStep=(axisMax-axisMin)/4,power=10**Math.floor(Math.log10(rawStep)),step=([1,2,5,10].find(scale=>scale*power>=rawStep)??10)*power,yDomain:[number,number]=[Math.floor(axisMin/step)*step,Math.ceil(axisMax/step)*step],yTicks=Array.from({length:Math.round((yDomain[1]-yDomain[0])/step)+1},(_,index)=>Math.abs(yDomain[0]+index*step)<step/1000?0:yDomain[0]+index*step);
 return <div className="mae-mfe-chart-wrap"><div className="analytics-horizontal-axis-labels mae-mfe-axis-labels"><span>{t('損益金額')} · {currency}</span></div><div className="status-chart analytics-scatter-chart" onPointerMove={event=>{const box=event.currentTarget.getBoundingClientRect();setCursor({x:event.clientX-box.left,y:event.clientY-box.top});setPointHovered(event.target instanceof Element&&!!event.target.closest('.recharts-scatter-symbol'));}} onPointerLeave={()=>{setCursor(null);setPointHovered(false);}} onFocusCapture={()=>setPointHovered(true)} onBlurCapture={()=>setPointHovered(false)}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:12,right:20,bottom:25,left:14}}><CartesianGrid strokeDasharray="1 5"/><XAxis axisLine={false} tickLine={false} type="number" dataKey="index" name={t('交易序號')} domain={[0,Math.max(1,points.length)]} tickFormatter={value=>String(Math.round(Number(value)))} label={{value:t('交易序號'),position:'insideBottom',offset:-14}}/><YAxis axisLine={false} tickLine={false} type="number" dataKey="value" name={currency} domain={yDomain} ticks={yTicks} tickFormatter={value=>fmt(Number(value))}/><ZAxis range={[48,48]}/><ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.5} strokeWidth={1}/><Tooltip active={pointHovered} cursor={false} isAnimationActive={false} content={({active,payload})=>{const point=payload?.[0]?.payload as MaeMfePoint|undefined;if(!active||!point)return null;const shown=point.value,metric=point.metric==='mae'?t('最大浮虧 MAE'):point.metric==='mfe'?t('最大浮盈 MFE'):t('實際淨損益');return <div className="status-tooltip"><strong>{point.symbol} · {point.entryTime.replace('T',' ')}</strong><span className={shown<0?'loss-value':shown>0?'profit-value':''}>{metric} · {fmt(shown)} {point.currency}</span>{point.originalCurrency!==point.currency&&<small>{t('原幣別')} · {fmt(shown/point.displayFactor)} {point.originalCurrency}</small>}<small>{point.source==='manual'?t('手動填寫'):point.source==='actual'?t('已保存交易淨損益'):t('交易所 OHLC 區間估算 · {0} · {1}',[point.provider,point.timeframe??'1m'])}</small>{point.source==='exchange'&&<small>{t('參考商品')} · {point.referenceSymbol??point.symbol} · {t(point.productType==='spot'?'現貨':point.productType==='perpetual'?'永續合約':point.productType==='future'?'期貨':'股票')}</small>}{point.time&&point.source==='exchange'&&<small>{t(point.metric==='mae'?'最大浮虧出現區間':'最大浮盈出現區間')} · {extremeRangeText(point.time,point.timeframe,t)}</small>}{point.source==='exchange'&&point.sizeBasis&&<small>{t('部位計算依據')} · {t(point.sizeBasis==='margin'?'該筆保證金 × 槓桿':point.sizeBasis==='base-quantity'?'實際幣數':point.sizeBasis==='notional'?'進場倉位金額':point.sizeBasis==='closing-notional'?'平倉倉位金額':point.sizeBasis==='contracts'?'口數 × 每點乘數':'股數')}</small>}{point.candleCount>0&&point.source==='exchange'&&<small>{t('K 線數量')} · {point.candleCount}</small>}</div>;}}/><Scatter isAnimationActive={false} name={t('最大浮虧 MAE')} data={mae} dataKey="value" fill="var(--loss-color)"/><Scatter isAnimationActive={false} name={t('最大浮盈 MFE')} data={mfe} dataKey="value" fill="var(--profit-color)"/><Scatter isAnimationActive={false} name={t('實際淨損益')} data={actual} dataKey="value" fill="var(--foreground)"/><PlotCrosshair cursor={cursor}/></ScatterChart></ResponsiveContainer>{empty&&emptyText&&<div className="analytics-chart-empty">{emptyText}</div>}</div><div className="analytics-chart-legend"><span><i className="loss-legend"/>{t('最大浮虧 MAE')}</span><span><i className="profit-legend"/>{t('最大浮盈 MFE')}</span><span><i className="actual-legend"/>{t('實際淨損益')}</span></div></div>;
}
function MaeMfeCharts({groups,t,baseCurrency,rates,now}:{groups:[string,MaeMfeRow[]][];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null;now:number}){
 if(!groups.length)return <MaeMfeScatter rows={[]} currency={baseCurrency==='auto'?'—':baseCurrency} t={t} emptyText={t('尚無 MAE／MFE 資料；可手動填寫，或補齊商品類型／行情金鑰後分析。')}/>;
 return <div className="analytics-product-grid">{groups.map(([key,rows])=>{const market=rows[0].market,sourceCurrency=rows[0].currency,display=chartCurrency(sourceCurrency,baseCurrency,rates,now),chartRows=rows.map(row=>({...row,displayFactor:display.factor,mae:row.mae===null?null:row.mae*display.factor,mfe:row.mfe===null?null:row.mfe*display.factor,actual:row.actual*display.factor}));return <section className="analytics-product" key={key}><header><strong>{t(marketName(market))} · {display.currency}{display.currency!==sourceCurrency?' ('+sourceCurrency+')':''}</strong><span>{rows.length} {t('筆')}</span></header><MaeMfeScatter rows={chartRows} currency={display.currency} t={t}/></section>;})}</div>;
}

function ProfitConcentrationCharts({groups,t,baseCurrency,rates,now}:{groups:ConcentrationGroup[];t:(text:string,values?:unknown[])=>string;baseCurrency:string;rates:StatusExchangeRates|null;now:number}){
  return <div className="analytics-product-grid">{groups.map(group=>{
    const display=chartCurrency(group.currency,baseCurrency,rates,now),start={index:0,trade:null as Trade|null,net:0,cumulativeNet:0,signedCumulative:0,profitShare:null as number|null,cumulativeProfitShare:0 as number|null,lossShare:null as number|null,cumulativeLossShare:0 as number|null,displayNet:0,displayCumulative:0},chartRows=[{...start,profitCurve:group.rows.some(row=>row.net>0)?0:null,lossCurve:group.rows.some(row=>row.net<0)?0:null},...group.rows.map(row=>({...row,displayNet:row.net*display.factor,displayCumulative:row.signedCumulative*display.factor,profitCurve:row.cumulativeProfitShare,lossCurve:row.cumulativeLossShare}))];
    const amounts=chartRows.map(row=>row.displayCumulative),minimum=Math.min(0,...amounts),maximum=Math.max(0,...amounts),rawStep=Math.max(1,maximum-minimum)/5,power=10**Math.floor(Math.log10(rawStep)),step=([1,2,5,10].find(scale=>scale*power>=rawStep)??10)*power,lower=Math.floor(minimum/step)*step,upper=Math.max(lower+step,Math.ceil(maximum/step)*step),ticks=Array.from({length:Math.round((upper-lower)/step)+1},(_,index)=>Math.abs(lower+index*step)<step/1000?0:lower+index*step);
    return <section className="analytics-product" key={group.market+'-'+group.currency}>
      <header><strong>{t(marketName(group.market))} · {display.currency}{display.currency!==group.currency?' ('+group.currency+')':''}</strong><span>{group.rows.length} {t('筆')}</span></header>
      <div className="analytics-horizontal-axis-labels"><span>{t('累積獲利／虧損金額')} · {display.currency}</span><span>{t('累積獲利／虧損占比')}</span></div>
      <div className="status-chart analytics-concentration-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartRows} margin={{top:12,right:18,bottom:36,left:12}}>
        <CartesianGrid strokeDasharray="1 5"/><XAxis dataKey="index" minTickGap={28} tickFormatter={value=>String(value)} label={{value:t('交易序號'),position:'insideBottom',offset:-20}}/>
        <YAxis yAxisId="pnl" domain={[lower,upper]} ticks={ticks} tickFormatter={value=>fmt(Number(value))}/><YAxis yAxisId="share" orientation="right" domain={[0,100]} tickFormatter={value=>String(Number(value))+'%'} />
        <ReferenceLine y={0} yAxisId="pnl" stroke="var(--muted-foreground)"/><Tooltip cursor={{stroke:'var(--foreground)',strokeOpacity:.6,strokeDasharray:'2 4',strokeWidth:1}} isAnimationActive={false} content={({active,payload})=>{
          const row=payload?.find(item=>item.dataKey==='displayCumulative')?.payload as typeof chartRows[number]|undefined;if(!active||!row?.trade)return null;
          return <div className="status-tooltip"><strong>{row.trade.symbol} · {row.trade.exitTime.replace('T',' ')}</strong><span className={row.displayCumulative<0?'loss-value':row.displayCumulative>0?'profit-value':''}>{t(row.net<0?'累積虧損金額':'累積獲利金額')} · {fmt(row.displayCumulative)} {display.currency}</span>{display.currency!==group.currency&&<small>{t('原幣別')} · {fmt(row.signedCumulative)} {group.currency}</small>}{row.net>0?<><span className="profit-value">{t('單筆獲利占比')} · {row.profitShare===null?'—':row.profitShare.toFixed(1)+'%'} · {fmt(row.displayNet)} {display.currency}</span><small>{t('累積獲利占比')} · {row.cumulativeProfitShare===null?'—':row.cumulativeProfitShare.toFixed(1)+'%'}</small></>:row.net<0?<><span className="loss-value">{t('單筆虧損占比')} · {row.lossShare===null?'—':row.lossShare.toFixed(1)+'%'} · {fmt(row.displayNet)} {display.currency}</span><small>{t('累積虧損占比')} · {row.cumulativeLossShare===null?'—':row.cumulativeLossShare.toFixed(1)+'%'}</small></>:null}</div>;
        }}/>
        <Bar yAxisId="pnl" dataKey="displayCumulative" radius={[3,3,0,0]} isAnimationActive={false}>{chartRows.map(row=><Cell key={row.trade?.id??'zero'} fill={row.net<0?'var(--loss-color)':row.net>0?'var(--profit-color)':'var(--muted-foreground)'}/>)}</Bar>
        <Line yAxisId="share" type="monotoneX" dataKey="profitCurve" name={t('累積獲利占比')} stroke="var(--profit-color)" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}/>
        <Line yAxisId="share" type="monotoneX" dataKey="lossCurve" name={t('累積虧損占比')} stroke="var(--loss-color)" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false}/>
      </ComposedChart></ResponsiveContainer></div>
      <div className="analytics-chart-legend"><span><i className="pnl-legend"/>{t('累積獲利／虧損金額')}</span><span><i className="profit-line-legend"/>{t('累積獲利占比')}</span><span><i className="loss-line-legend"/>{t('累積虧損占比')}</span></div>
    </section>;
  })}</div>;
}
