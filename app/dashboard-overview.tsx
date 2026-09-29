'use client';

import { useI18n } from './language-provider';
import CombinedProfit from './combined-profit';
import ConvertedMoney from './converted-money';
import { BookOpen, CalendarDays, TrendingUp } from 'lucide-react';
import InfoTooltip from '@/components/info-tooltip';
import FavoriteStar from '@/components/favorite-star';
import { favoriteFeatureDomId } from '@/lib/trade-status-favorites';
import { currencyGroups, dashboardStats, busiestDay, type CurrencyFilter } from '@/lib/dashboard';
import { pnl, type Trade } from '@/lib/trades';

const amount = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FavoriteProps = { favoriteIds: string[]; onToggleFavorite: (id: string) => void };

function MetricFavorite({ id, title, favoriteIds, onToggleFavorite }: FavoriteProps & { id: string; title: string }) {
  return <FavoriteStar active={favoriteIds.includes(id)} title={title} onToggle={() => onToggleFavorite(id)} />;
}

export function TotalPnl({ trades, currency, baseCurrency = 'auto', favoriteIds, onToggleFavorite }: {
  trades: Trade[];
  currency: CurrencyFilter;
  baseCurrency?: string;
} & FavoriteProps) {
  const { t: tx } = useI18n();
  return <section id={favoriteFeatureDomId('overview:total-pnl')} className="metric primary-metric">
    <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:total-pnl" title={tx('總損益')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx('總損益 ')}</span><TrendingUp className="metric-heading-icon" size={18} /></div>
    {currencyGroups(trades, currency).map(group => <div className="currency-stat" key={group.currency}><span>{group.currency}</span><strong className={dashboardStats(group.trades).net >= 0 ? 'positive' : 'negative'}>{amount(dashboardStats(group.trades).net)}<ConvertedMoney amount={dashboardStats(group.trades).net} currency={group.currency} baseCurrency={baseCurrency} /></strong></div>)}
    <p className="metric-meta">{tx('全部期間 · 已扣除已知費用')}</p>
    <CombinedProfit trades={trades} baseCurrency={baseCurrency} />
  </section>;
}

export function TotalTradeCount({ trades, onAll, favoriteIds, onToggleFavorite }: { trades: Trade[]; onAll: () => void } & FavoriteProps) {
  const { t: tx } = useI18n();
  const rows = ([
    ['futures', tx('美股期貨')], ['tw-index-futures', tx('台指期')], ['crypto', tx('加密貨幣')], ['us-stocks', tx('美股現貨')], ['tw-stocks', tx('台股')], ['cn-stocks', tx('A股')], ['hk-stocks', tx('港股')], ['all', tx('全部')],
  ] as const).map(([market, label]) => ({ market, label, count: market === 'all' ? trades.length : trades.filter(trade => trade.market === market).length })).filter(row => row.count > 0);
  return <article id={favoriteFeatureDomId('overview:trade-count')} className="metric total-trade-count-card">
    <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:trade-count" title={tx('總交易筆數')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx('總交易筆數 ')}</span><BookOpen className="metric-heading-icon" size={18} /></div>
    <button type="button" className="metric-count-body" onClick={onAll}>
      {rows.map(row => <div key={row.market} className={`currency-stat ${row.market === 'all' ? 'count-all' : ''}`}><span>{row.label}</span><strong>{row.count}<em>{tx('筆')}</em></strong></div>)}
      <p className="metric-meta">{tx('全部期間 · 點選查看交易')}</p>
    </button>
  </article>;
}

export default function DashboardOverview({ trades, currency, baseCurrency = 'auto', onTrade, onMonth, onDay, onCalendar, periodCaption = '本月', favoriteIds, onToggleFavorite, favoriteOnly = false }: {
  trades: Trade[];
  currency: CurrencyFilter;
  baseCurrency?: string;
  periodCaption?: string;
  onTrade: (t: Trade) => void;
  onMonth: () => void;
  onDay: (date: string) => void;
  onCalendar: () => void;
  favoriteOnly?: boolean;
} & FavoriteProps) {
  const { t: tx } = useI18n();
  const groups = currencyGroups(trades, currency), busy = busiestDay(trades);
  return <>
    <div className="metrics overview-metrics">
      <section id={favoriteFeatureDomId('overview:selected-period-pnl')} className="metric" hidden={favoriteOnly && !favoriteIds.includes('overview:selected-period-pnl')}>
        <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:selected-period-pnl" title={tx('所選期間淨損益')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx(periodCaption)}{tx('淨損益 ')}</span><button className="metric-icon metric-heading-icon" aria-label={tx('查看所選期間損益日曆')} onClick={onCalendar}><CalendarDays size={18} /></button></div>
        {groups.map(group => <div className="currency-stat" key={group.currency}><span>{group.currency}</span><strong className={dashboardStats(group.trades).net >= 0 ? 'positive' : 'negative'}>{amount(dashboardStats(group.trades).net)}<ConvertedMoney amount={dashboardStats(group.trades).net} currency={group.currency} baseCurrency={baseCurrency} /></strong></div>)}
      </section>
      <section id={favoriteFeatureDomId('overview:win-rate')} className="metric" hidden={favoriteOnly && !favoriteIds.includes('overview:win-rate')}>
        <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:win-rate" title={tx('交易勝率')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx('交易勝率')}</span></div>
        <div className="currency-stat total-breakdown"><span>{tx('總勝率')}</span><strong>{trades.length ? dashboardStats(trades).winRate.toFixed(1) : '—'}<em>%</em></strong></div>
        {groups.map(group => <div className="metric-breakdown" key={group.currency}><span>{group.currency}</span><b>{group.trades.length ? `${dashboardStats(group.trades).winRate.toFixed(1)}%` : '—'}</b></div>)}
        <p className="metric-meta">{tx('獲利筆數 ÷ 總筆數（含打平）')}</p>
      </section>
      <section id={favoriteFeatureDomId('overview:profit-factor')} className="metric" hidden={favoriteOnly && !favoriteIds.includes('overview:profit-factor')}>
        <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:profit-factor" title={tx('獲利因子')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx('獲利因子 ')}</span><InfoTooltip label={tx('獲利因子說明')}><strong>{tx('獲利因子＝獲利交易總額 ÷ 虧損交易總額的絕對值')}</strong><p>{tx('例如獲利 300、虧損 200，獲利因子為 1.50。大於 1 表示總獲利高於總虧損；小於 1 則相反。只有獲利、沒有虧損時顯示 ∞；沒有盈虧樣本時顯示 —。各幣別分別計算，採扣除已知費用後的損益。')}</p></InfoTooltip></div>
        {groups.map(group => { const stats = dashboardStats(group.trades); return <div className="currency-stat" key={group.currency}><span>{group.currency}</span><strong>{stats.factor === Infinity ? '∞' : stats.factor === 0 && !stats.avgLoss ? '—' : stats.factor.toFixed(2)}</strong></div>; })}
      </section>
      <article id={favoriteFeatureDomId('overview:period-count')} className="metric total-trade-count-card" hidden={favoriteOnly && !favoriteIds.includes('overview:period-count')}>
        <div className="metric-label favorite-metric-label"><MetricFavorite id="overview:period-count" title={tx('交易筆數')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><span>{tx(periodCaption)}{tx('交易筆數 ')}</span><BookOpen className="metric-heading-icon" size={18} /></div>
        <button type="button" className="metric-count-body" onClick={onMonth}>
          <div className="currency-stat total-breakdown"><span>{tx('總筆數')}</span><strong>{trades.length}<em>{tx('筆')}</em></strong></div>
          {([['futures', tx('美股期貨')], ['tw-index-futures', tx('台指期')], ['crypto', tx('加密貨幣')], ['us-stocks', tx('美股現貨')], ['tw-stocks', tx('台股')], ['cn-stocks', tx('A股')], ['hk-stocks', tx('港股')]] as const).map(([market, label]) => <div className="metric-breakdown" key={market}><span>{label}</span><b>{trades.filter(trade => trade.market === market).length} {tx(' 筆')}</b></div>)}
          <p className="metric-meta">{tx('點選查看所選期間交易')}</p>
        </button>
      </article>
    </div>
    <div className="performance-grid">
      <section id={favoriteFeatureDomId('overview:average-results')} className="panel performance-panel" hidden={favoriteOnly && !favoriteIds.includes('overview:average-results')}>
        <div className="panel-title-with-star"><MetricFavorite id="overview:average-results" title={tx('平均獲利／平均虧損')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><h2>{tx('平均獲利／平均虧損')}</h2></div>
        {groups.map(group => { const stats = dashboardStats(group.trades); return <div className="average-row" key={group.currency}><h3>{group.currency}</h3><div><span>{tx('平均獲利')}</span><strong className="positive">{stats.avgWin ? amount(stats.avgWin) : '—'}{stats.avgWin ? <ConvertedMoney amount={stats.avgWin} currency={group.currency} baseCurrency={baseCurrency} /> : null}</strong></div><div><span>{tx('平均虧損')}</span><strong className="negative">{stats.avgLoss ? amount(stats.avgLoss) : '—'}{stats.avgLoss ? <ConvertedMoney amount={stats.avgLoss} currency={group.currency} baseCurrency={baseCurrency} /> : null}</strong></div><div><span>{tx('平均盈虧比')}</span><strong>{stats.winLossRatio === null ? '—' : stats.winLossRatio.toFixed(2)}</strong></div></div>; })}
        <p className="field-hint">{tx(periodCaption)} {tx(' · 打平交易不計入平均獲利或平均虧損。')}</p>
      </section>
      <section id={favoriteFeatureDomId('overview:best-worst-trade')} className="panel performance-panel" hidden={favoriteOnly && !favoriteIds.includes('overview:best-worst-trade')}>
        <div className="panel-title-with-star"><MetricFavorite id="overview:best-worst-trade" title={tx('最好與最差的一筆交易')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /><h2>{tx('最好與最差的一筆交易')}</h2></div>
        {groups.map(group => { const stats = dashboardStats(group.trades); return <div key={group.currency} className="best-worst"><h3>{group.currency}</h3>{([[tx('最好'), stats.best], [tx('最差'), stats.worst]] as const).map(([label, trade]) => <button key={label} disabled={!trade} onClick={() => trade && onTrade(trade)}><span>{label}<small>{trade ? `${trade.symbol} · ${trade.exitTime.replace('T', ' ')}` : tx('所選期間尚無交易')}</small></span><strong className={trade && pnl(trade) < 0 ? 'negative' : 'positive'}>{trade ? amount(pnl(trade)) : '—'}{trade ? <ConvertedMoney amount={pnl(trade)} currency={trade.currency} baseCurrency={baseCurrency} /> : null}</strong></button>)}</div>; })}
      </section>
    </div>
    <section id={favoriteFeatureDomId('overview:busiest-day')} className="panel busiest-panel" hidden={favoriteOnly && !favoriteIds.includes('overview:busiest-day')}>
      <MetricFavorite id="overview:busiest-day" title={tx('交易最多的一天')} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />
      <div><h2>{tx('交易最多的一天')}</h2><p>{busy ? tx('{0} · {1} 筆{2}', [busy.date, busy.trades.length, busy.ties > 1 ? tx('（同筆數取最近一天）') : '']) : tx('所選期間尚無交易')}</p></div>
      {busy && <><div className="busiest-trades">{[...new Set(busy.trades.map(trade => trade.symbol))].map(symbol => <span key={symbol}>{symbol} × {busy.trades.filter(trade => trade.symbol === symbol).length}</span>)}</div><button className="outline-button" onClick={() => onDay(busy.date)}>{tx('查看當天交易')}</button></>}
    </section>
  </>;
}
