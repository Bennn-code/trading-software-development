'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, Clock3, RefreshCw, ShieldCheck, Target, TrendingUp, Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from './language-provider';
import ConvertedMoney from './converted-money';
import { marketName, pnl, positionValue, type Trade } from '@/lib/trades';
import { utcOffsetLabel, timezoneName } from '@/lib/preferences';
import type { DateRange, ReportPeriod } from '@/lib/report-period';
import { averageDurationMinutes, averagePnl, averageReturnPercent, bestDayShare, disciplineRate, durationMinutes, holdingTimeBucket, holdingTimeLabel, mistakeStats, sharpeRatio, strategyStats, weekdayPnlStats, winRate } from '@/lib/trade-status';

type Community = { mistakes: { name: string; count: number; percent: number }[]; profit: { label: string; value: number; currency: string }[]; returns: { label: string; value: number }[]; sampleSize: number };
type Summary = { overview: string; strategySummary: string; reflectionSummary: string; strengths: string[]; improvements: string[]; nextSteps: string[] };
type TimeBucket = { position: number; label: string; count: number; winRate: number | null };
type ProductCharts = { market: Trade['market']; currency: Trade['currency']; count: number; clock: TimeBucket[]; holding: TimeBucket[]; averageDuration: number | null; previousAverageDuration: number | null; averageWinDuration: number | null; averageLossDuration: number | null; bestWeekday: { weekday: number; net: number } | null; worstWeekday: { weekday: number; net: number } | null; sharpe: number | null; expectancy: number; expectancyPercent: number | null };
const fmt = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const change = (current: number, previous: number) => previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
const weekdays = ['週日','週一','週二','週三','週四','週五','週六'] as const;
function durationText(minutes:number|null,t:(text:string,values?:unknown[])=>string){if(minutes===null||!Number.isFinite(minutes))return '—';if(minutes<60)return `${Math.round(minutes)} ${t('分鐘')}`;if(minutes<1440)return `${(minutes/60).toFixed(1)} ${t('小時')}`;return `${(minutes/1440).toFixed(1)} ${t('天')}`;}
function percentChangeText(value:number|null){return value===null?'—':`${value>0?'+':''}${value.toFixed(1)}%`;}
function percentChangeClass(value:number|null){return value===null||value===0?'':value>0?'profit-value':'loss-value';}
function isSummary(value:unknown):value is Summary{if(!value||typeof value!=='object')return false;const summary=value as Partial<Summary>;return typeof summary.overview==='string'&&typeof summary.strategySummary==='string'&&typeof summary.reflectionSummary==='string'&&Array.isArray(summary.strengths)&&summary.strengths.every(item=>typeof item==='string')&&Array.isArray(summary.improvements)&&summary.improvements.every(item=>typeof item==='string')&&Array.isArray(summary.nextSteps)&&summary.nextSteps.every(item=>typeof item==='string');}
function isCommunity(value:unknown):value is Community{if(!value||typeof value!=='object')return false;const data=value as Partial<Community>;return typeof data.sampleSize==='number'&&Array.isArray(data.mistakes)&&data.mistakes.every(row=>!!row&&typeof row.name==='string'&&typeof row.count==='number'&&typeof row.percent==='number')&&Array.isArray(data.profit)&&data.profit.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number'&&typeof row.currency==='string')&&Array.isArray(data.returns)&&data.returns.every(row=>!!row&&typeof row.label==='string'&&typeof row.value==='number');}
function isReviewResponse(value:unknown):value is {record?:{summary?:Summary|null}}{if(!value||typeof value!=='object')return false;const record=(value as {record?:unknown}).record;if(!record||typeof record!=='object')return false;const summary=(record as {summary?:unknown}).summary;return summary===null||isSummary(summary);}

export default function TradeStatus({ trades, timezone, period, anchor, range, demo = false, signedIn = false, baseCurrency = 'auto' }: { trades: Trade[]; timezone: string; period: ReportPeriod; anchor: string; range: DateRange; demo?: boolean; signedIn?: boolean; baseCurrency?: string }) {
  const { t } = useI18n();
  const [community, setCommunity] = useState<Community | null>(null);
  const [ranking, setRanking] = useState<'profit' | 'returns'>('profit');
  const [timeMode, setTimeMode] = useState<'clock' | 'holding'>('clock');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/trade-status/community?currency=' + encodeURIComponent(baseCurrency), { signal: controller.signal })
      .then(async response => { if (!response.ok) return null; const payload: unknown = await response.json(); return isCommunity(payload) ? payload : null; }).then(setCommunity).catch(() => {});
    return () => controller.abort();
  }, [baseCurrency]);

  useEffect(() => {
    if (!signedIn || demo) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind: period, date: anchor, start: range.start, end: range.end });
    fetch('/api/reviews?' + params, { signal: controller.signal }).then(async response => { if (!response.ok) return null; const payload: unknown = await response.json(); return isReviewResponse(payload) ? payload : null; })
      .then(data => setSummary(data?.record?.summary || null)).catch(() => {});
    return () => controller.abort();
  }, [signedIn, demo, period, anchor, range.start, range.end]);

  const selected = useMemo(() => range.start && range.end
    ? trades.filter(trade => trade.exitTime.slice(0, 10) >= range.start && trade.exitTime.slice(0, 10) <= range.end)
    : trades, [trades, range.start, range.end]);

  const data = useMemo(() => {
    const days = Math.max(1, Math.round((new Date(`${range.end}T00:00:00Z`).getTime() - new Date(`${range.start}T00:00:00Z`).getTime()) / 86400000) + 1);
    const priorEnd = new Date(`${range.start}T00:00:00Z`);
    priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setUTCDate(priorStart.getUTCDate() - days + 1);
    const previous = trades.filter(trade => trade.exitTime.slice(0, 10) >= priorStart.toISOString().slice(0, 10) && trade.exitTime.slice(0, 10) <= priorEnd.toISOString().slice(0, 10));
    const mistakes = mistakeStats(selected);
    const strategies = strategyStats(selected);
    const symbols = [...new Map(selected.map(trade => [trade.symbol, selected.filter(row => row.symbol === trade.symbol).length])).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    const productKeys = [...new Set(selected.map(trade => `${trade.market}|${trade.currency}`))];
    const products: ProductCharts[] = productKeys.map(key => {
      const [market, currency] = key.split('|') as [Trade['market'], Trade['currency']];
      const rows = selected.filter(trade => trade.market === market && trade.currency === currency);
      const previousRows = previous.filter(trade => trade.market === market && trade.currency === currency);
      const clock = Array.from({ length: 24 }, (_, hour) => {
        const bucket = rows.filter(trade => Number(trade.entryTime.slice(11, 13)) === hour);
        return { position: hour, label: `${String(hour).padStart(2, '0')}:00`, count: bucket.length, winRate: bucket.length ? winRate(bucket) : null };
      });
      const holdingMap = new Map<number, Trade[]>();
      for (const trade of rows) {
        const position = holdingTimeBucket(durationMinutes(trade));
        holdingMap.set(position, [...(holdingMap.get(position) || []), trade]);
      }
      const holding = [...holdingMap].sort((a, b) => a[0] - b[0]).map(([position, bucket]) => ({ position, label: holdingTimeLabel(position), count: bucket.length, winRate: winRate(bucket) }));
      const daily = weekdayPnlStats(rows);
      const durations = rows.filter(trade => Number.isFinite(durationMinutes(trade)));
      const winningDurations = durations.filter(trade => pnl(trade) > 0);
      const losingDurations = durations.filter(trade => pnl(trade) < 0);
      return {
        market, currency, count: rows.length, clock, holding,
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
    const lossPercent = selected.filter(trade => positionValue(trade) > 0 && pnl(trade) < 0).map(trade => Math.abs(pnl(trade)) / positionValue(trade) * 100);
    const avgLossPercent = lossPercent.length ? lossPercent.reduce((sum, value) => sum + value, 0) / lossPercent.length : 0;
    const frequency = selected.length / Math.max(new Set(selected.map(trade => trade.exitTime.slice(0, 10))).size, 1);
    const leverageRows = selected.filter(trade => (trade.leverage || 0) > 0);
    const leverage = leverageRows.length ? leverageRows.reduce((sum, trade) => sum + (trade.leverage || 0), 0) / leverageRows.length : 0;
    const riskScore = Math.min(100, Math.round(frequency * 12 + Math.min(avgLossPercent * 3, 35) + Math.min(leverage * 3, 35)));
    const currencyGroups = [...new Set(selected.map(trade => trade.currency))].map(currency => [currency, selected.filter(trade => trade.currency === currency)] as const);
    const bestDays = currencyGroups.flatMap(([currency, rows]) => {
      const byDay = new Map<string, Trade[]>();
      for (const trade of rows) byDay.set(trade.exitTime.slice(0, 10), [...(byDay.get(trade.exitTime.slice(0, 10)) || []), trade]);
      const totals = [...byDay].map(([date, dayTrades]) => ({ date, trades: dayTrades, net: dayTrades.reduce((sum, trade) => sum + pnl(trade), 0), currency }))
        .sort((a, b) => b.net - a.net);
      const best = totals[0];
      return best ? [{ ...best, share: bestDayShare(best.net, totals.map(day => day.net)) }] : [];
    });
    const wins = selected.filter(trade => pnl(trade) > 0).reduce((sum, trade) => sum + pnl(trade), 0);
    const losses = Math.abs(selected.filter(trade => pnl(trade) < 0).reduce((sum, trade) => sum + pnl(trade), 0));
    const score = Math.max(0, Math.min(100, Math.round(winRate(selected) * .45 + Math.min(40, (wins / (losses || 1)) * 20) + disciplineRate(selected) * .25)));
    return { previous, mistakes, strategies, symbols, products, riskScore, score, leverage, bestDays };
  }, [trades, selected, range.start, range.end]);

  const durationComparisons = data.products.filter(product => product.averageDuration !== null).map(product => ({
    name: `${t(marketName(product.market))} · ${t('平均進出場時間')}`,
    value: product.previousAverageDuration === null ? null : change(product.averageDuration!, product.previousAverageDuration),
  }));
  const averagePnlChange = change(averagePnl(selected), averagePnl(data.previous));
  const disciplineChange = change(disciplineRate(selected), disciplineRate(data.previous));
  const risk = data.riskScore < 34 ? '保守' : data.riskScore < 67 ? '平衡' : '激進';
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

  return <div className="status-grid">
    <section className="panel status-card status-hero"><h2>{t('交易分數')}</h2><div className="status-score-value"><strong>{data.score}</strong><small>/ 100</small></div><div className="score-gauge" style={{ '--score': `${data.score * 3.6}deg` } as React.CSSProperties}><i style={{ transform: `rotate(${data.score * 1.8 - 90}deg)` }}/></div><p>{t('依勝率、盈虧效率與紀律紀錄計算；只反映已保存資料。')}</p></section>

    <Card icon={<ShieldCheck/>} title={t('風險偏好')}>
      <div className="risk-segment-labels"><span>{t('保守')}</span><span>{t('平衡')}</span><span>{t('激進')}</span></div>
      <div className="risk-meter" role="img" aria-label={`${t('系統判定')}：${t(risk)}`}><div className="risk-meter-arc"/><i style={{ transform: `rotate(${data.riskScore * 1.8 - 90}deg)` }}/></div>
      <div className="risk-conclusion"><span>{t('系統判定')}</span><strong>{t(risk)}</strong></div>
      <p>{t('依平均虧損、交易頻率與平均槓桿估算。')} {t('平均槓桿')} {data.leverage ? `${data.leverage.toFixed(1)}×` : t('未記錄')}</p>
    </Card>

    <section className="panel status-card community-card"><header><div><Users/><h2>{t('本週結算排行')}</h2></div><div className="status-switch"><button className={ranking === 'profit' ? 'active' : ''} onClick={() => setRanking('profit')}>{t('金額')}</button><button className={ranking === 'returns' ? 'active' : ''} onClick={() => setRanking('returns')}>{t('百分比')}</button></div></header>{community && community.sampleSize >= 3 ? <><h3>{t('本平台本週最常犯的三個錯誤')}</h3>{community.mistakes.slice(0, 3).map(item => <Row key={item.name} name={t(item.name)} value={`${item.percent.toFixed(0)}% · ${item.count} ${t('次')}`}/>)}{ranking === 'profit' ? community.profit.map(item => <Row key={item.label} name={item.label} value={`${fmt(item.value)} ${item.currency}`}/>) : community.returns.map(item => <Row key={item.label} name={item.label} value={`${fmt(item.value)}%`}/>)}</> : <Empty text={t('本週匿名樣本不足 3 位使用者，暫不顯示平台排行。')}/>}</section>

    <Card icon={<TrendingUp/>} title={t('最常交易商品')}>{data.symbols.map(([symbol, count]) => <Row key={symbol} name={symbol} value={`${count} ${t('筆')}`}/>)}</Card>
    <Card icon={<Activity/>} title={t('常犯錯誤')}>{data.mistakes.length ? data.mistakes.slice(0, 6).map(item => <Progress key={item.name} name={t(item.name)} value={item.percent} suffix={`${item.percent.toFixed(0)}% · ${item.count} ${t('次')}`}/>) : <Empty text={t('尚未在心得中辨識到常見錯誤。')}/>}</Card>
    <Card icon={<Clock3/>} title={t('交易時間偏好')}><p>{t(timezoneName(timezone))} · {utcOffsetLabel(timezone)} · 24 {t('時制')}</p>{data.products.map(product => <div className="preference-product" key={`${product.market}-${product.currency}`}><h3>{t(marketName(product.market))} · {product.currency}</h3>{product.clock.filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 3).map(item => <Row key={item.position} name={item.label} value={`${item.count} ${t('筆')}`}/>)}</div>)}</Card>
    <Card icon={<Target/>} title={t('交易策略偏好')} hidden={!data.strategies.length}>{data.strategies.map(item => <Progress key={item.name} name={t(item.name)} value={item.percent} suffix={`${item.percent.toFixed(0)}%`}/>)}</Card>
    <Card icon={<BarChart3/>} title={t('最好的一天佔本期獲利日總額')} hidden={!data.bestDays.length} className="best-day-card">{data.bestDays.map(day => <div className="best-day-row" key={`${day.currency}-${day.date}`}><div className="best-day-top"><span>{day.date} · {day.currency}</span><strong className={day.net < 0 ? 'loss-value' : 'profit-value'}>{fmt(day.net)} {day.currency}<ConvertedMoney amount={day.net} currency={day.currency} baseCurrency={baseCurrency}/></strong></div><p className="best-day-share"><span>{t('佔本期獲利日淨損益')}</span><strong>{day.share === null ? '—' : `${day.share.toFixed(1)}%`}</strong></p><div className="best-day-symbols">{day.trades.map(trade => trade.symbol).filter((symbol, index, all) => all.indexOf(symbol) === index).map(symbol => <span key={symbol}>{symbol}</span>)}</div></div>)}</Card>

    <section className="panel status-card status-full market-metrics-section"><header><div><BarChart3/><h2>{t('各市場交易統計')}</h2></div></header><div className="market-metrics-grid">{data.products.map(product => <section className="market-metrics-card" key={`${product.market}-${product.currency}`}><header><h3>{t(marketName(product.market))} · {product.currency}</h3><span>{product.count} {t('筆')}</span></header><div className="market-metric-grid">
      <Metric label={t('平均交易時間')} value={durationText(product.averageDuration,t)}/>
      <Metric label={t('夏普比率')} value={product.sharpe===null?'—':product.sharpe.toFixed(2)}/>
      <Metric label={t('期望值')} value={`${fmt(product.expectancy)} ${product.currency}`} detail={`${t('平均報酬率')} ${percentChangeText(product.expectancyPercent)}`} tone={product.expectancy>0?'profit':product.expectancy<0?'loss':undefined} detailTone={product.expectancyPercent===null?undefined:product.expectancyPercent>0?'profit':product.expectancyPercent<0?'loss':undefined}/>
      <Metric label={t('最賺錢的天')} value={product.bestWeekday?`${t(weekdays[product.bestWeekday.weekday])} · ${fmt(product.bestWeekday.net)} ${product.currency}`:'—'} tone={product.bestWeekday&&product.bestWeekday.net!==0?product.bestWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('最賠錢的天')} value={product.worstWeekday?`${t(weekdays[product.worstWeekday.weekday])} · ${fmt(product.worstWeekday.net)} ${product.currency}`:'—'} tone={product.worstWeekday&&product.worstWeekday.net!==0?product.worstWeekday.net>0?'profit':'loss':undefined}/>
      <Metric label={t('平均盈利時間')} value={durationText(product.averageWinDuration,t)}/>
      <Metric label={t('平均虧損時間')} value={durationText(product.averageLossDuration,t)}/>
    </div></section>)}</div>{!data.products.length&&<Empty text={t('所選期間尚無交易。')}/>}<p className="market-metrics-note">{t('夏普比率以逐筆淨損益計算，未年化；期望值金額為每筆平均淨損益，百分比為平均逐筆報酬率。')}</p></section>

    <section className="panel status-card status-full"><header><div><Activity/><h2>{t('交易週報')}</h2></div><button className="primary-button" disabled={!signedIn || demo || summaryBusy} onClick={() => void generate()}><RefreshCw size={15}/>{summaryBusy ? t('生成中…') : t('生成 AI 總結')}</button></header>{summary ? <div className="ai-summary"><h3>{t('期間總結')}</h3><p>{summary.overview}</p><div className="summary-columns"><div><h3>{t('策略總結')}</h3><p>{summary.strategySummary || t('本期間沒有足夠的策略心得。')}</p></div><div><h3>{t('心得總結')}</h3><p>{summary.reflectionSummary || t('本期間沒有足夠的心得內容。')}</p></div></div>{summarySections.map(([title, items]) => <div key={title}><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}</div> : <p className="status-empty">{signedIn && !demo ? t('按右上方按鈕，AI 將依所選期間的交易、策略與心得生成週報。') : t('登入並選擇我的紀錄後即可生成個人 AI 交易週報。')}</p>}{summaryError && <p className="status-error">{summaryError}</p>}</section>

    <section className="panel status-card status-full"><header><div><Clock3/><h2>{t('最佳與最低勝率時間')}</h2></div><div className="status-switch"><button className={timeMode === 'clock' ? 'active' : ''} onClick={() => setTimeMode('clock')}>{t('交易時段')}</button><button className={timeMode === 'holding' ? 'active' : ''} onClick={() => setTimeMode('holding')}>{t('持倉時間')}</button></div></header><p>{timeMode === 'clock' ? `${t(timezoneName(timezone))} · ${utcOffsetLabel(timezone)}` : `${t('滑鼠移至圖表可查看時間與勝率。')} ${t('不足一小時以分鐘顯示。')}`}</p><div className="time-chart-grid">{data.products.map(product => {
      const buckets = timeMode === 'clock' ? product.clock : product.holding;
      const activeBuckets = buckets.filter(item => item.count > 0 && item.winRate !== null);
      const best = [...activeBuckets].sort((a, b) => (b.winRate || 0) - (a.winRate || 0))[0];
      const worst = [...activeBuckets].sort((a, b) => (a.winRate || 0) - (b.winRate || 0))[0];
      return <section className="time-chart-product" key={`${product.market}-${product.currency}`}><header><h3>{t(marketName(product.market))} · {product.currency}</h3><span>{t('總交易筆數')}：{product.count}</span></header>{best && worst && <div className="best-worst"><span>{t('最高勝率')} · {best.label} <b>{best.winRate?.toFixed(1)}%</b></span><span>{t('最低勝率')} · {worst.label} <b>{worst.winRate?.toFixed(1)}%</b></span></div>}<div className="status-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={buckets} margin={{ top: 12, right: 18, bottom: 20, left: 16 }}><CartesianGrid strokeDasharray="1 6"/><XAxis dataKey="label" minTickGap={20} label={{ value: timeMode === 'clock' ? t('交易時間') : t('持倉時間'), position: 'insideBottom', offset: -8 }}/><YAxis width={48} domain={[0, 100]} tickFormatter={value => `${value}%`} label={{ value: t('勝率 (%)'), angle: -90, position: 'insideLeft', dx: -4 }}/><Tooltip cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.92, strokeDasharray: '3 3', strokeWidth: 2 }} isAnimationActive={false} content={({ active, payload, label }) => { const point = payload?.[0]?.payload as TimeBucket | undefined; if (!active || !point || point.winRate === null) return null; return <div className="status-tooltip"><span>{String(label)}</span><strong>{t('勝率')} · {point.winRate.toFixed(1)}%</strong><small>{t('交易筆數')} · {point.count}</small></div>; }}/><Line type="linear" dataKey="winRate" stroke="var(--foreground)" strokeWidth={2.2} dot={{ r: 2.5, strokeWidth: 1, fill: 'var(--background)' }} activeDot={{ r: 4, fill: 'var(--foreground)' }} connectNulls isAnimationActive={false}/></LineChart></ResponsiveContainer></div></section>;
    })}</div>{!data.products.length && <Empty text={t('所選期間尚無交易。')}/>}</section>

    <Card icon={<BarChart3/>} title={t('與前一個等長期間比較')}><Row name={t('平均損益')} value={percentChangeText(averagePnlChange)} className={percentChangeClass(averagePnlChange)}/>{durationComparisons.map(item=><Row key={item.name} name={item.name} value={percentChangeText(item.value)} className={percentChangeClass(item.value)}/>)}<Row name={t('紀律遵守')} value={percentChangeText(disciplineChange)} className={percentChangeClass(disciplineChange)}/></Card>
    <Card icon={<CheckCircle2/>} title={t('所選期間遵守的規則')}>{data.strategies.slice(0, 3).map(rule => { const activeDays = Math.max(new Set(selected.map(trade => trade.exitTime.slice(0, 10))).size, 1); const days = new Set(selected.filter(trade => trade.strategy.includes(rule.name.split('／')[0]) || trade.notes.includes(rule.name.split('／')[0])).map(trade => trade.exitTime.slice(0, 10))).size; const rate = days / activeDays * 100; return <div className="rule-row" key={rule.name}><CheckCircle2 className={rate >= 80 ? 'checked' : ''}/><span>{t(rule.name)}</span><b>{rate.toFixed(0)}%</b></div>; })}{!data.strategies.length && <Empty text={t('先在策略與心得中記下規則，系統才會計算。')}/>}</Card>
  </div>;
}

function Card({ icon, title, children, hidden = false, className = '' }: { icon: React.ReactNode; title: string; children: React.ReactNode; hidden?: boolean; className?: string }) { if (hidden) return null; return <section className={`panel status-card ${className}`}><header><div>{icon}<h2>{title}</h2></div></header>{children}</section>; }
function Metric({label,value,detail,tone,detailTone}:{label:string;value:string;detail?:string;tone?:'profit'|'loss';detailTone?:'profit'|'loss'}){return <div className="market-metric"><span>{label}</span><strong className={tone==='profit'?'profit-value':tone==='loss'?'loss-value':''}>{value}</strong>{detail&&<small className={detailTone==='profit'?'profit-value':detailTone==='loss'?'loss-value':''}>{detail}</small>}</div>;}
function Row({ name, value, className = '' }: { name: string; value: string; className?: string }) { return <div className="status-row"><span>{name}</span><b className={className}>{value}</b></div>; }
function Progress({ name, value, suffix }: { name: string; value: number; suffix: string }) { return <div className="status-progress"><div><span>{name}</span><b>{suffix}</b></div><i><em style={{ width: `${Math.min(value, 100)}%` }}/></i></div>; }
function Empty({ text }: { text: string }) { return <p className="status-empty">{text}</p>; }
