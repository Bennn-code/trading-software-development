'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea } from 'recharts';
import { marketName, type Trade } from '@/lib/trades';
import type { EnteredStrategyStats } from '@/lib/trade-status';
import type { NetPnlDistributionStat, ProductDirectionStat, StrategyPerformanceGroup } from '@/lib/trade-performance';
import { productDirectionSummaryStats } from '@/lib/trade-performance';
import { histogramBarGeometry, histogramHover } from '@/lib/histogram-hover';
import { useI18n } from './language-provider';
import { Choice } from './trade-fields';
import { PlotCrosshair, type PlotCursor } from './plot-crosshair';
import './trade-performance.css';

type Translate = (text: string, values?: unknown[]) => string;
type Scope = 'markets' | 'overall';
type GroupProps<T> = { groups: T[]; overall?: T[]; originalGroups?: T[] };
type DistributionBin = NetPnlDistributionStat['bins'][number];

const money = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 2 })}`;
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: Math.abs(value) < 1 && value !== 0 ? 4 : 2 });
const axisNumber = (value: number) => value === 0 ? '0' : value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const valueClass = (value: number | null) => value === null || value === 0 ? '' : value > 0 ? 'profit-value' : 'loss-value';
const valueColor = (value: number | null) => value === null || value === 0 ? 'var(--muted-foreground)' : value > 0 ? 'var(--profit-color)' : 'var(--loss-color)';
const groupLabel = (market: Trade['market'] | 'all', t: Translate) => market === 'all' ? t('整體') : t(marketName(market));
const rowPageSize = 12;

function useRowLimits() {
  const [limits, setLimits] = useState<Record<string, number>>({});
  return {
    limit: (key: string) => limits[key] ?? rowPageSize,
    more: (key: string) => setLimits(current => ({ ...current, [key]: (current[key] ?? rowPageSize) + rowPageSize })),
    collapse: (key: string) => setLimits(current => ({ ...current, [key]: rowPageSize })),
  };
}

function RowLimitControls({ shown, total, onMore, onCollapse }: { shown: number; total: number; onMore: () => void; onCollapse: () => void }) {
  const { t } = useI18n();
  if (total <= rowPageSize) return null;
  return <div className="performance-list-controls">
    <span aria-live="polite">{t('顯示 {0}／{1} 項', [shown, total])}</span>
    <div>{shown < total && <button type="button" className="outline-button" onClick={onMore}>{t('顯示更多')}</button>}{shown > rowPageSize && <button type="button" className="outline-button" onClick={onCollapse}>{t('收起')}</button>}</div>
  </div>;
}

function signedDomain(values: (number | null)[]): [number, number] {
  const largest = Math.max(0, ...values.filter((value): value is number => value !== null && Number.isFinite(value)).map(Math.abs));
  if (!largest) return [-1, 1];
  const step = 10 ** Math.floor(Math.log10(largest));
  const limit = Math.ceil(largest / step * 1.1) * step;
  return [-limit, limit];
}

function ScopeSwitch({ value, onChange, available, t }: { value: Scope; onChange: (value: Scope) => void; available: boolean; t: Translate }) {
  if (!available) return null;
  return <div className="status-switch" role="group" aria-label={t('統計範圍')}>
    <button type="button" className={value === 'markets' ? 'active' : ''} aria-pressed={value === 'markets'} onClick={() => onChange('markets')}>{t('分市場')}</button>
    <button type="button" className={value === 'overall' ? 'active' : ''} aria-pressed={value === 'overall'} onClick={() => onChange('overall')}>{t('整體')}</button>
  </div>;
}

function MoneyBar({ value, domain, currency, name, valueLabel, showAxis = false }: { value: number | null; domain: [number, number]; currency: string; name: string; valueLabel: string; showAxis?: boolean }) {
  const { t } = useI18n();
  const data = [{ value }];
  return <div className={`performance-money-bar ${showAxis ? 'with-axis' : ''}`} role="img" aria-label={t('{0}：{1} {2}', [name, money(value), currency])}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 9, bottom: 0, left: 9 }} accessibilityLayer={false}>
        <XAxis type="number" domain={domain} ticks={[domain[0], domain[0] / 2, 0, domain[1] / 2, domain[1]]} axisLine={false} tickLine={false} tickFormatter={axisNumber} hide={!showAxis} height={22} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
        <YAxis type="category" hide />
        <ReferenceLine x={0} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1} />
        <Tooltip cursor={false} shared={false} isAnimationActive={false} animationDuration={0} content={({ active }) => active && value !== null ? <div className="status-tooltip"><strong>{name}</strong><span>{valueLabel}</span><b className={valueClass(value)}>{money(value)} {currency}</b></div> : null} />
        <Bar dataKey="value" fill={valueColor(value)} barSize={13} radius={3} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
    {value === null && <span className="performance-bar-empty">{t('無交易')}</span>}
  </div>;
}

function DataTable({ caption, headings, rows }: { caption: string; headings: string[]; rows: (string | number)[][] }) {
  const { t } = useI18n();
  return <details className="performance-data-details">
    <summary>{t('查看數據表')}</summary>
    <div className="performance-data-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="performance-data-table">
        <caption>{caption}</caption>
        <thead><tr>{headings.map((heading, index) => <th key={index} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>;
}

function OriginalStrategyTable({ groups }: { groups?: StrategyPerformanceGroup[] }) {
  const { t } = useI18n();
  if (!groups?.length) return null;
  return <DataTable caption={t('原幣別策略績效')} headings={[t('市場'), t('幣別'), t('策略'), t('交易筆數'), t('淨損益'), t('每筆期望值')]} rows={groups.flatMap(group => group.rows.map(row => [groupLabel(group.market, t), group.currency, row.name, row.count, money(row.net), money(row.expectancy)]))} />;
}

export function StrategyPerformanceCharts({ groups, overall, originalGroups }: GroupProps<StrategyPerformanceGroup>) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>('markets');
  const [metric, setMetric] = useState<'net' | 'expectancy'>('net');
  const rowLimits = useRowLimits();
  const visible = scope === 'overall' && overall ? overall : groups;
  const metricLabel = t(metric === 'net' ? '淨損益' : '每筆期望值');
  return <div className="performance-card-content">
    <div className="performance-toolbar">
      <ScopeSwitch value={scope} onChange={setScope} available={!!overall} t={t} />
      <div className="status-switch" role="group" aria-label={t('策略績效指標')}>
        <button type="button" className={metric === 'net' ? 'active' : ''} aria-pressed={metric === 'net'} onClick={() => setMetric('net')}>{t('淨損益')}</button>
        <button type="button" className={metric === 'expectancy' ? 'active' : ''} aria-pressed={metric === 'expectancy'} onClick={() => setMetric('expectancy')}>{t('每筆期望值')}</button>
      </div>
    </div>
    {visible.length === 0 ? <p className="status-empty">{t('尚無已填寫策略的交易')}</p> : <div className="performance-group-grid">{visible.map(group => {
      const key = `${group.market}|${group.currency}`;
      const displayedRows = group.rows.slice(0, rowLimits.limit(key));
      const domain = signedDomain(group.rows.map(row => row[metric]));
      return <section className="performance-group" key={key}>
        <header><h3>{groupLabel(group.market, t)} · {group.currency}</h3><span>{t('{0} 筆交易', [group.count])}</span></header>
        <p className="performance-axis-title">{t('{0}（{1}）', [metricLabel, group.currency])}</p>
        <div className="performance-horizontal-list">{displayedRows.map((row, index) => <div className="performance-horizontal-row" key={row.key}>
          <div className="performance-row-heading"><strong>{row.name}</strong><b className={valueClass(row[metric])}>{money(row[metric])} {group.currency}</b></div>
          <div className="performance-row-meta"><span>{t('{0} 筆交易', [row.count])}</span><span>{t('勝率 {0}%', [number(row.winRate)])}</span>{row.count < 5 && <small className="performance-sample-warning">{t('少量樣本')}</small>}</div>
          <MoneyBar value={row[metric]} domain={domain} currency={group.currency} name={row.name} valueLabel={metricLabel} showAxis={index === displayedRows.length - 1} />
        </div>)}</div>
        <RowLimitControls shown={displayedRows.length} total={group.rows.length} onMore={() => rowLimits.more(key)} onCollapse={() => rowLimits.collapse(key)} />
        {group.overlappingTradeCount > 0 && <p className="performance-note">{t('{0} 筆交易含多個策略；各策略納入完整該筆損益，策略金額不可直接加總。', [group.overlappingTradeCount])}</p>}
        <DataTable caption={`${t('策略實際績效')} · ${groupLabel(group.market, t)} · ${group.currency}`} headings={[t('策略'), t('交易筆數'), t('勝率'), t('淨損益'), t('每筆期望值')]} rows={group.rows.map(row => [row.name, row.count, `${number(row.winRate)}%`, `${money(row.net)} ${group.currency}`, `${money(row.expectancy)} ${group.currency}`])} />
      </section>;
    })}</div>}
    <p className="performance-note">{t('少於 5 筆只作介面提醒，不代表統計顯著性。')}</p>
    <OriginalStrategyTable groups={originalGroups} />
  </div>;
}

export function ProductDirectionCharts({ groups, overall, originalGroups }: GroupProps<ProductDirectionStat>) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>('markets');
  const rowLimits = useRowLimits();
  const visible = scope === 'overall' && overall ? overall : groups;
  const grouped = new Map<string, ProductDirectionStat[]>();
  for (const row of visible) {
    const key = `${row.market}|${row.currency}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  const summaries = new Map(productDirectionSummaryStats(visible).map(row => [`${row.market}|${row.currency}`, row]));
  return <div className="performance-card-content">
    <div className="performance-toolbar"><ScopeSwitch value={scope} onChange={setScope} available={!!overall} t={t} /></div>
    {grouped.size === 0 ? <p className="status-empty">{t('所選期間尚無交易')}</p> : <div className="performance-group-grid">{[...grouped].map(([key, rows]) => {
      const first = rows[0];
      const summary = summaries.get(key)!;
      const displayedRows = rows.slice(0, rowLimits.limit(key));
      const domain = signedDomain(rows.flatMap(row => [row.long.meanNet, row.short.meanNet]));
      return <section className="performance-group" key={key}>
        <header><h3>{groupLabel(first.market, t)} · {first.currency}</h3><span>{t('{0} 個商品', [rows.length])}</span></header>
        <div className="performance-direction-summary">{(['long', 'short'] as const).map(side => {
          const stat = summary[side];
          return <section key={side}>
            <header><strong>{t(side === 'long' ? '做多' : '做空')}</strong><span>{t('{0} 筆交易', [stat.count])}</span></header>
            <dl>
              <div><dt>{t('勝率')}</dt><dd>{stat.winRate === null ? '—' : `${number(stat.winRate)}%`}</dd></div>
              <div><dt>{t('總淨損益')}</dt><dd className={valueClass(stat.net)}>{stat.net === null ? '—' : `${money(stat.net)} ${first.currency}`}</dd></div>
              <div><dt>{t('平均每筆淨損益')}</dt><dd className={valueClass(stat.meanNet)}>{stat.meanNet === null ? '—' : `${money(stat.meanNet)} ${first.currency}`}</dd></div>
            </dl>
            {stat.count > 0 && stat.count < 5 && <small className="performance-sample-warning">{t('少量樣本')}</small>}
          </section>;
        })}</div>
        <p className="performance-note">{t('勝率＝該方向獲利筆數 ÷ 該方向總筆數，打平交易也計入；各商品依總交易筆數由多到少排列。')}</p>
        <p className="performance-axis-title">{t('平均每筆淨損益（{0}）', [first.currency])}</p>
        <div className="performance-horizontal-list">{displayedRows.map((row, index) => <section className="performance-direction-product" key={row.symbol}>
          <h4>{row.symbol}<span>{t('{0} 筆交易', [row.long.count + row.short.count])}</span></h4>
          {(['long', 'short'] as const).map(side => <div className="performance-direction-row" key={side}>
            <div className="performance-row-heading"><span>{t(side === 'long' ? '做多' : '做空')} <small>{t('{0} 筆交易', [row[side].count])}</small></span><b className={valueClass(row[side].meanNet)}>{row[side].meanNet === null ? '—' : `${money(row[side].meanNet)} ${row.currency}`}</b></div>
            {row[side].winRate !== null && <div className="performance-row-meta"><span>{t('勝率 {0}%', [number(row[side].winRate!)])}</span></div>}
            <MoneyBar value={row[side].meanNet} domain={domain} currency={row.currency} name={`${row.symbol} · ${t(side === 'long' ? '做多' : '做空')}`} valueLabel={t('平均每筆淨損益')} showAxis={index === displayedRows.length - 1 && side === 'short'} />
          </div>)}
        </section>)}</div>
        <RowLimitControls shown={displayedRows.length} total={rows.length} onMore={() => rowLimits.more(key)} onCollapse={() => rowLimits.collapse(key)} />
        <DataTable caption={`${t('商品方向績效')} · ${groupLabel(first.market, t)} · ${first.currency}`} headings={[t('商品'), t('方向'), t('交易筆數'), t('勝率'), t('總淨損益'), t('平均每筆淨損益')]} rows={rows.flatMap(row => (['long', 'short'] as const).map(side => [row.symbol, t(side === 'long' ? '做多' : '做空'), row[side].count, row[side].winRate === null ? '—' : `${number(row[side].winRate!)}%`, row[side].net === null ? '—' : `${money(row[side].net)} ${row.currency}`, row[side].meanNet === null ? '—' : `${money(row[side].meanNet)} ${row.currency}`]))} />
      </section>;
    })}</div>}
    {originalGroups?.length ? <DataTable caption={t('原幣別商品方向績效')} headings={[t('市場'), t('幣別'), t('商品'), t('方向'), t('交易筆數'), t('平均每筆淨損益')]} rows={originalGroups.flatMap(row => (['long', 'short'] as const).map(side => [groupLabel(row.market, t), row.currency, row.symbol, t(side === 'long' ? '做多' : '做空'), row[side].count, money(row[side].meanNet)]))} /> : null}
  </div>;
}

function HistogramBar({ y = 0, height = 0, payload, domain }: { x?: number; y?: number; width?: number; height?: number; payload?: DistributionBin; domain: [number, number] }) {
  const area = usePlotArea();
  if (!area || !payload || payload.count === 0 || !Number.isFinite(y) || !Number.isFinite(height)) return null;
  const { x, width } = histogramBarGeometry(payload, domain, area);
  return <rect className="performance-histogram-bar" x={x} y={y} width={width} height={height} fill={payload.sign === 'profit' ? 'var(--profit-color)' : payload.sign === 'loss' ? 'var(--loss-color)' : 'var(--muted-foreground)'} rx={2} />;
}

function binRange(bin: DistributionBin, currency: string, t: Translate) {
  if (bin.sign === 'flat') return t('0 {0}（打平）', [currency]);
  const boundary = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: value === 0 ? 2 : Math.min(20, Math.max(2, 1 - Math.floor(Math.log10(Math.abs(value))))) });
  const lower = boundary(bin.min);
  const upper = boundary(bin.max);
  if (bin.minInclusive && bin.maxInclusive) return t('{0} 至 {1} {2}（含兩端）', [lower, upper, currency]);
  if (bin.minInclusive) return t('{0} 至未滿 {1} {2}', [lower, upper, currency]);
  if (bin.maxInclusive) return t('超過 {0} 至 {1} {2}', [lower, upper, currency]);
  return t('超過 {0}、未滿 {1} {2}', [lower, upper, currency]);
}

const binOutcome = (bin: DistributionBin, t: Translate) => t(bin.sign === 'loss' ? '虧損交易' : bin.sign === 'profit' ? '獲利交易' : '打平交易');
const binShare = (bin: DistributionBin, count: number) => `${number(count > 0 ? bin.count / count * 100 : 0)}%`;

function HistogramInteraction({ group, domain, cursor }: { group: NetPnlDistributionStat; domain: [number, number]; cursor: PlotCursor }) {
  const { t } = useI18n();
  const area = usePlotArea();
  const selected = histogramHover(group.bins, domain, area, cursor);
  const bin = selected?.bin;
  const tooltipWidth = area ? Math.min(260, area.width) : 260;
  const position = selected && area && cursor ? {
    x: Math.max(area.x, Math.min(selected.center + 10, area.x + area.width - tooltipWidth)),
    y: Math.max(area.y + 8, Math.min(cursor.y + 10, area.y + area.height - 150)),
  } : undefined;
  return <>
    <Tooltip active={!!selected} defaultIndex={selected?.index} position={position} wrapperStyle={{ width: tooltipWidth, pointerEvents: 'none' }} cursor={false} shared={false} isAnimationActive={false} animationDuration={0} content={({ active }) => {
      return active && bin ? <div className="status-tooltip performance-histogram-tooltip"><strong>{binOutcome(bin, t)}</strong><span>{t('單筆淨損益區間')}</span><b className={bin.sign === 'flat' ? '' : bin.sign === 'profit' ? 'profit-value' : 'loss-value'}>{binRange(bin, group.currency, t)}</b><span>{t('這個金額區間有 {0} 筆交易', [bin.count])}</span><small>{t('占本組 {0} 筆交易的 {1}', [group.count, binShare(bin, group.count)])}</small></div> : null;
    }} />
    <PlotCrosshair cursor={selected && cursor ? { x: selected.center, y: cursor.y } : cursor} />
  </>;
}

function NetPnlHistogram({ group }: { group: NetPnlDistributionStat }) {
  const { t } = useI18n();
  const [cursor, setCursor] = useState<PlotCursor>(null);
  const domain = signedDomain(group.bins.flatMap(bin => [bin.min, bin.max]));
  const bins = group.bins.map(bin => ({ ...bin, midpoint: (bin.min + bin.max) / 2 }));
  return <div className="status-chart performance-histogram" role="img" aria-label={t('單筆淨損益分布（{0}）', [groupLabel(group.market, t)])}
    onPointerMove={event => {
      const box = event.currentTarget.getBoundingClientRect();
      setCursor({ x: event.clientX - box.left, y: event.clientY - box.top });
    }}
    onPointerLeave={() => setCursor(null)}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} />
        <XAxis type="number" dataKey="midpoint" domain={domain} ticks={[domain[0], domain[0] / 2, 0, domain[1] / 2, domain[1]]} tickFormatter={axisNumber} axisLine={false} tickLine={false} height={26} />
        <YAxis allowDecimals={false} domain={[0, 'auto']} axisLine={false} tickLine={false} width={32} />
        <ReferenceLine x={0} stroke="var(--foreground)" strokeOpacity={0.6} strokeWidth={1} />
        <Bar dataKey="count" shape={<HistogramBar domain={domain} />} activeBar={false} isAnimationActive={false}>{bins.map(bin => <Cell key={bin.key} fill={bin.sign === 'profit' ? 'var(--profit-color)' : bin.sign === 'loss' ? 'var(--loss-color)' : 'var(--muted-foreground)'} />)}</Bar>
        <HistogramInteraction group={group} domain={domain} cursor={cursor} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function NetPnlDistributionCharts({ groups, overall, originalGroups }: GroupProps<NetPnlDistributionStat>) {
  const { t } = useI18n();
  const [scope, setScope] = useState<Scope>('markets');
  const visible = scope === 'overall' && overall ? overall : groups;
  return <div className="performance-card-content">
    <div className="performance-toolbar"><ScopeSwitch value={scope} onChange={setScope} available={!!overall} t={t} /></div>
    {visible.length === 0 ? <p className="status-empty">{t('所選期間尚無交易')}</p> : <div className="performance-group-grid">{visible.map(group => {
      return <section className="performance-group" key={`${group.market}|${group.currency}`}>
        <header><h3>{groupLabel(group.market, t)} · {group.currency}</h3><span>{t('{0} 筆交易', [group.count])}</span></header>
        <div className="performance-distribution-summary">{([['單筆淨損益中位數', group.median], ['平均每筆淨損益', group.mean], ['最大單筆獲利', group.maxProfit], ['最大單筆虧損', group.maxLoss]] as const).map(([label, value]) => <div key={label}><span>{t(label)}</span><strong className={valueClass(value)}>{value === null ? '—' : `${money(value)} ${group.currency}`}</strong></div>)}</div>
        <p className="performance-histogram-guide">{t('每根柱子代表一個金額區間；柱子越高，落在該區間的交易越多。')}</p>
        <div className="analytics-horizontal-axis-labels performance-distribution-labels"><span>{t('柱高：交易筆數')}</span></div>
        <NetPnlHistogram group={group} />
        <p className="performance-histogram-x-title">{t('橫軸：單筆淨損益（{0}）', [group.currency])}</p>
        <p className="performance-histogram-direction">{t('零線左側是虧損，右側是獲利；0 代表打平。')}</p>
        <div className="analytics-chart-legend performance-distribution-legend"><span><i className="loss-legend" />{t('虧損交易')}</span><span><i className="performance-flat-legend" />{t('打平交易')}</span><span><i className="profit-legend" />{t('獲利交易')}</span></div>
        <DataTable caption={`${t('每個金額區間的交易筆數')} · ${groupLabel(group.market, t)} · ${group.currency}`} headings={[t('交易結果'), t('單筆淨損益區間'), t('區間內交易筆數'), t('占本組交易比例')]} rows={group.bins.map(bin => [binOutcome(bin, t), binRange(bin, group.currency, t), bin.count, binShare(bin, group.count)])} />
        <p className="performance-note">{t('表格中的筆數是落在該金額區間的交易數量；比例以本組全部 {0} 筆交易為分母，包含打平交易。', [group.count])}</p>
        <p className="performance-note">{t('中位數是將單筆損益由低到高排列後的中間值；平均每筆淨損益是總淨損益除以交易筆數。')}</p>
      </section>;
    })}</div>}
    <p className="performance-note">{t('使用每筆已平倉交易的淨損益，按金額區間統計筆數；這不是累積損益圖。')}</p>
    {originalGroups?.length ? <DataTable caption={t('原幣別損益分布摘要')} headings={[t('市場'), t('幣別'), t('交易筆數'), t('中位數'), t('平均值'), t('最大單筆獲利'), t('最大單筆虧損')]} rows={originalGroups.map(group => [groupLabel(group.market, t), group.currency, group.count, money(group.median), money(group.mean), money(group.maxProfit), money(group.maxLoss)])} /> : null}
  </div>;
}

export function StrategyPreferenceChart({ stats }: { stats: EnteredStrategyStats }) {
  const { t } = useI18n();
  const [market, setMarket] = useState('all');
  const rowLimits = useRowLimits();
  const group = stats.markets.find(item => item.market === market);
  const activeMarket = group ? market : 'all';
  const rows = activeMarket === 'all' ? stats.overall : group?.rows ?? [];
  const displayedRows = rows.slice(0, rowLimits.limit(activeMarket));
  const denominator = rows.reduce((sum, row) => sum + row.count, 0);
  const label = activeMarket === 'all' ? t('整體') : group ? t(marketName(group.market)) : t('分市場');
  return <div className="performance-card-content performance-preference">
    <div className="performance-toolbar"><Choice label={t('統計範圍')} value={activeMarket} options={[["all", t('整體')], ...stats.markets.map(item => [item.market, t(marketName(item.market))] as [string, string])]} onChange={setMarket} /></div>
    {rows.length === 0 ? <p className="status-empty">{t('尚無已填寫策略的交易')}</p> : <>
      <p className="performance-preference-total">{t('{0} · {1} 次策略使用', [label, denominator])}</p>
      <div className="performance-horizontal-list">{displayedRows.map(row => <div className="performance-preference-row" key={row.name}>
        <div className="performance-row-heading"><strong>{row.name}</strong><b>{number(row.percent)}%</b></div>
        <small>{t('{0} 筆交易', [row.count])}</small>
        <div className="performance-preference-bar" role="img" aria-label={t('{0}：{1}%，{2} 筆交易', [row.name, number(row.percent), row.count])}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" hide /><Bar dataKey="percent" barSize={10} fill="var(--profit-color)" background={{ fill: 'var(--border)', radius: 3 }} radius={3} isAnimationActive={false} /></BarChart></ResponsiveContainer>
        </div>
      </div>)}</div>
      <RowLimitControls shown={displayedRows.length} total={rows.length} onMore={() => rowLimits.more(activeMarket)} onCollapse={() => rowLimits.collapse(activeMarket)} />
      <DataTable caption={`${t('交易策略偏好')} · ${label}`} headings={[t('策略'), t('交易筆數'), t('占比')]} rows={rows.map(row => [row.name, row.count, `${number(row.percent)}%`])} />
    </>}
    <p className="performance-note">{t('占比以所選範圍各策略使用次數合計為分母；同筆同策略只計一次，多策略交易會各計一次。')}</p>
  </div>;
}
