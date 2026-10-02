import { displayTrades } from './display-currency';
import { inDateRange, validDate, type DateRange } from './report-period';
import { settledPerformanceTrades, tradeTimestamp } from './trade-performance';
import { inEntryDateRange } from './trade-status';
import { pnl, type Trade } from './trades';

/** Use saved instants, not display wall times: DST transitions cannot change elapsed time. */
export function holdingMinutes(trade: Trade): number {
  const entry = tradeTimestamp(trade.entryTime, trade.timezone);
  const exit = tradeTimestamp(trade.exitTime, trade.timezone);
  return Number.isFinite(entry) && Number.isFinite(exit) && exit >= entry ? (exit - entry) / 60000 : NaN;
}

export function averageHoldingMinutes(trades: Trade[]): number | null {
  const values = trades.map(holdingMinutes).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** An inclusive local end date, including 23/25-hour DST days; never observe future settlements. */
export function reportObservationCutoff(endDate: string, timezone: string, now: number): number {
  if (!Number.isFinite(now)) throw new RangeError('A finite observation time is required');
  if (!validDate(endDate)) return now;
  const following = new Date(`${endDate}T00:00:00Z`);
  following.setUTCDate(following.getUTCDate() + 1);
  const target = following.toISOString().slice(0, 10);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDay = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const read = (type: string) => parts.find(part => part.type === type)!.value;
    return `${read('year')}-${read('month')}-${read('day')}`;
  };
  let nextMidnight = tradeTimestamp(`${target}T00:00`, timezone);
  // Some zones skip or repeat midnight. Find the first instant of the next local date.
  if (!Number.isFinite(nextMidnight) || localDay(nextMidnight - 1) >= target || localDay(nextMidnight) < target) {
    let lower = following.getTime() - 2 * 86400000;
    let upper = following.getTime() + 2 * 86400000;
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      if (localDay(middle) >= target) upper = middle;
      else lower = middle;
    }
    nextMidnight = upper;
  }
  return Math.min(now, nextMidnight - 1);
}

/** Restrict to the displayed account/population; canonical records retain saved source timezones. */
export function reportTradeCohorts(displayed: Trade[], canonical: Trade[], range: DateRange, timezone: string, now: number) {
  const sourceById = new Map(canonical.map(trade => [trade.id, trade]));
  const source = displayed.map(trade => sourceById.get(trade.id) ?? trade);
  const rawById = new Map(source.map(trade => [trade.id, trade]));
  const bounded = Boolean(range.start || range.end);
  const valid = !bounded || (validDate(range.start) && validDate(range.end) && range.start <= range.end);
  const observedAt = reportObservationCutoff(range.end, timezone, now);
  const historyTrades = valid ? settledPerformanceTrades(source, observedAt) : [];
  const historyDisplayed = displayTrades(historyTrades, timezone);
  const selected = bounded ? inDateRange(historyDisplayed, range) : historyDisplayed;
  const quoteTrades = selected.map(trade => rawById.get(trade.id)!);
  // Entry cohorts can close after the selected period, but their outcome must already be known now.
  const validClosed = valid ? settledPerformanceTrades(source, now).filter(trade => Number.isFinite(holdingMinutes(trade)) && Number.isFinite(pnl(trade))) : [];
  const closedDisplayed = displayTrades(validClosed, timezone);
  const timeSelected = bounded ? inEntryDateRange(closedDisplayed, range.start, range.end) : closedDisplayed;
  return { selected, quoteTrades, timeSelected, historyTrades, historyDisplayed, observedAt };
}

export function currentLossStreaks(trades: Trade[]) {
  const groups = new Map<string, { market: Trade['market']; currency: Trade['currency']; count: number; streak: number }>();
  const ordered = trades.filter(trade => Number.isFinite(tradeTimestamp(trade.exitTime, trade.timezone)) && Number.isFinite(pnl(trade)))
    .toSorted((a, b) => tradeTimestamp(a.exitTime, a.timezone) - tradeTimestamp(b.exitTime, b.timezone) || tradeTimestamp(a.entryTime, a.timezone) - tradeTimestamp(b.entryTime, b.timezone) || a.id.localeCompare(b.id));
  for (const trade of ordered) {
    const key = `${trade.market}|${trade.currency}`;
    const row = groups.get(key) ?? { market: trade.market, currency: trade.currency, count: 0, streak: 0 };
    row.count++;
    row.streak = pnl(trade) < 0 ? row.streak + 1 : 0;
    groups.set(key, row);
  }
  return [...groups.values()];
}
