'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { useI18n } from './language-provider';
import { Input } from '@/components/ui/input';
import { localTime, type Trade } from '@/lib/trades';
import { TotalPnl, TotalTradeCount } from './dashboard-overview';
import CombinedProfit from './combined-profit';
import ConvertedMoney from './converted-money';
import { selectMarket, currencyGroups, type CurrencyFilter } from '@/lib/dashboard';
import { periodSummary, weekBounds } from '@/lib/periods';
import { currencyName, timezoneName, utcOffsetLabel } from '@/lib/preferences';
import FavoriteStar from '@/components/favorite-star';
import { favoriteFeatureDomId } from '@/lib/trade-status-favorites';
import { CardLayoutItem, useCardLayoutActive } from '@/components/card-layout-editor';

const amount = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PeriodSummary({
  trades,
  market,
  currency,
  timezone = 'Asia/Taipei',
  baseCurrency = 'auto',
  onCalendar,
  onRange,
  onAll,
  favoriteIds,
  onToggleFavorite,
  favoriteOnly = false,
}: {
  trades: Trade[];
  market: string;
  currency: CurrencyFilter;
  timezone?: string;
  baseCurrency?: string;
  onAll: () => void;
  onCalendar: (date: string) => void;
  onRange: (start: string, end: string) => void;
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
  favoriteOnly?: boolean;
}) {
  const { t: tx } = useI18n();
  const layoutActive = useCardLayoutActive();
  const [today, setToday] = useState(() => localTime(new Date(), timezone).slice(0, 10));
  const [selected, setSelected] = useState('');

  useEffect(() => {
    const update = () => setToday(localTime(new Date(), timezone).slice(0, 10));
    update();
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [timezone]);

  const scoped = selectMarket(trades, market, currency);
  const date = selected || today;
  const dailyTrades = scoped.filter(t => t.exitTime.slice(0, 10) === date);
  const week = weekBounds(date);
  const groups = currencyGroups(trades, currency).map(g => ({ currency: g.currency, ...periodSummary(g.trades, date, market, g.currency) }));
  const place = `${tx(timezoneName(timezone))}（${utcOffsetLabel(timezone)}）`;
  const displayCurrency = baseCurrency === 'auto' ? tx('依交易原幣別') : `${tx(currencyName(baseCurrency))} ${baseCurrency}`;

  return <section className={`period-section${layoutActive ? ' card-layout-surface' : ''}`}>
    <div className="period-heading" hidden={favoriteOnly}>
      <div>
        <h2>{tx('交易損益與筆數')}</h2>
        <p>{tx('依市場篩選 · {0}出場日期 · 主要換算：{1}', [place, displayCurrency])}</p>
      </div>
      <div className="period-date">
        <label htmlFor="period-date">{tx('查看日期')}</label>
        <Input id="period-date" type="date" value={date} max={today} onChange={e => { try { weekBounds(e.target.value); setSelected(e.target.value); } catch {} }} />
        {selected && selected !== today && <button className="text-button" onClick={() => setSelected('')}>{tx('回到今天')}</button>}
      </div>
    </div>
    <div className={`total-metrics summary-cards${layoutActive ? ' card-layout-surface' : ''}`}>
      {(!favoriteOnly || favoriteIds.includes('overview:total-pnl')) && <CardLayoutItem id="overview:total-pnl" columns={3} height={190}><TotalPnl trades={scoped} currency={currency} baseCurrency={baseCurrency} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /></CardLayoutItem>}
      {(!favoriteOnly || favoriteIds.includes('overview:daily-pnl')) && <CardLayoutItem id="overview:daily-pnl" columns={3} height={190}><article id={favoriteFeatureDomId('overview:daily-pnl')} className="metric daily-metric">
        <div className="metric-label favorite-metric-label"><FavoriteStar active={favoriteIds.includes('overview:daily-pnl')} title={tx('今日淨損益')} onToggle={() => onToggleFavorite('overview:daily-pnl')} /><span>{date === today ? tx('今日') : tx('當日')}{tx('淨損益')}</span><button className="metric-icon metric-heading-icon" aria-label={tx('開啟當日損益日曆')} onClick={() => onCalendar(date)}><CalendarDays size={18} /></button></div>
        {groups.map(g => <div className="currency-stat" key={g.currency}><span>{g.currency}</span><strong className={g.daily.net < 0 ? 'negative' : 'positive'}>{amount(g.daily.net)}<ConvertedMoney amount={g.daily.net} currency={g.currency} baseCurrency={baseCurrency} /></strong></div>)}
        <button className="metric-meta metric-count" onClick={() => onRange(date, date)}>{date} · {groups.reduce((s, g) => s + g.daily.count, 0)} {tx(' 筆交易 →')}</button>
        <CombinedProfit trades={dailyTrades} baseCurrency={baseCurrency} />
      </article></CardLayoutItem>}
      {(!favoriteOnly || favoriteIds.includes('overview:trade-count')) && <CardLayoutItem id="overview:trade-count" columns={3} height={190}><TotalTradeCount trades={scoped} onAll={onAll} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} /></CardLayoutItem>}
      {(!favoriteOnly || favoriteIds.includes('overview:weekly-pnl')) && <CardLayoutItem id="overview:weekly-pnl" columns={3} height={190}><article id={favoriteFeatureDomId('overview:weekly-pnl')} className="metric">
        <div className="metric-label favorite-metric-label"><FavoriteStar active={favoriteIds.includes('overview:weekly-pnl')} title={tx('本週淨損益')} onToggle={() => onToggleFavorite('overview:weekly-pnl')} /><span>{date === today ? tx('本週') : tx('該週')}{tx('淨損益')}</span><button className="metric-icon metric-heading-icon" aria-label={tx('開啟該週損益日曆')} onClick={() => onCalendar(date)}><CalendarRange size={18} /></button></div>
        {groups.map(g => <div className="currency-stat" key={g.currency}><span>{g.currency}</span><strong className={g.weekly.net < 0 ? 'negative' : 'positive'}>{amount(g.weekly.net)}<ConvertedMoney amount={g.weekly.net} currency={g.currency} baseCurrency={baseCurrency} /></strong></div>)}
        <button className="metric-meta metric-count" onClick={() => onRange(week.start, week.end)}>{week.start} ～ {week.end} · {groups.reduce((s, g) => s + g.weekly.count, 0)} {tx(' 筆 →')}</button>
      </article></CardLayoutItem>}
    </div>
    <p className="period-hint" hidden={favoriteOnly}>{tx('已扣除已知費用；未知費用未計入。週一至週日，含跨月交易。')}</p>
  </section>;
}
