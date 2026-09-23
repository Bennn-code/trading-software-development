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
}: {
  trades: Trade[];
  market: string;
  currency: CurrencyFilter;
  timezone?: string;
  baseCurrency?: string;
  onAll: () => void;
  onCalendar: (date: string) => void;
  onRange: (start: string, end: string) => void;
}) {
  const { t: tx } = useI18n();
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

  return <section className="period-section">
    <div className="period-heading">
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
    <div className="total-metrics summary-cards">
      <TotalPnl trades={scoped} currency={currency} />
      <article className="metric daily-metric">
        <div className="metric-label">{date === today ? tx('今日') : tx('當日')}{tx('淨損益')}<button className="metric-icon" aria-label={tx('開啟當日損益日曆')} onClick={() => onCalendar(date)}><CalendarDays size={18} /></button></div>
        {groups.map(g => <div className="currency-stat" key={g.currency}><span>{g.currency}</span><strong className={g.daily.net < 0 ? 'negative' : 'positive'}>{amount(g.daily.net)}<ConvertedMoney amount={g.daily.net} currency={g.currency} /></strong></div>)}
        <button className="metric-meta metric-count" onClick={() => onRange(date, date)}>{date} · {groups.reduce((s, g) => s + g.daily.count, 0)} {tx(' 筆交易 →')}</button>
        <CombinedProfit trades={dailyTrades} />
      </article>
      <TotalTradeCount trades={scoped} onAll={onAll} />
      <article className="metric">
        <div className="metric-label">{date === today ? tx('本週') : tx('該週')}{tx('淨損益')}<button className="metric-icon" aria-label={tx('開啟該週損益日曆')} onClick={() => onCalendar(date)}><CalendarRange size={18} /></button></div>
        {groups.map(g => <div className="currency-stat" key={g.currency}><span>{g.currency}</span><strong className={g.weekly.net < 0 ? 'negative' : 'positive'}>{amount(g.weekly.net)}<ConvertedMoney amount={g.weekly.net} currency={g.currency} /></strong></div>)}
        <button className="metric-meta metric-count" onClick={() => onRange(week.start, week.end)}>{week.start} ～ {week.end} · {groups.reduce((s, g) => s + g.weekly.count, 0)} {tx(' 筆 →')}</button>
      </article>
    </div>
    <p className="period-hint">{tx('已扣除已知費用；未知費用未計入。週一至週日，含跨月交易。')}</p>
  </section>;
}
