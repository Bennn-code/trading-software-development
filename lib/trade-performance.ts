import { convertWallTime, parseExplicitTimestamp } from './display-currency';
import { normalizeStrategyName } from './trade-status';
import { pnl, type Trade } from './trades';

export type PerformanceMarket = Trade['market'] | 'all';
export type PerformanceOptions = {
  combineMarkets?: boolean;
  /** Optional explicit cutoff; only valid settlements at or before this instant are included. */
  asOf?: number;
  /** Only for caller-created conversion copies; preserve their unrounded converted net amounts. */
  readNetOverride?: boolean;
};
type NetSample = { trade: Trade; net: number };
type PerformanceGroup = { market: PerformanceMarket; currency: Trade['currency']; samples: NetSample[] };

/** Filter before conversion so omitted-FX counts use the same valid settled population. */
export function settledPerformanceTrades(trades: Trade[], asOf: number): Trade[] {
  if (!Number.isFinite(asOf)) throw new RangeError('A finite performance observation cutoff is required');
  return trades.filter(trade => {
    const exit = tradeTimestamp(trade.exitTime, trade.timezone);
    return Number.isFinite(exit) && exit <= asOf;
  });
}

/** Inputs are the caller's selected closed trades; currency conversion must precede aggregation. */
function performanceGroups(trades: Trade[], options: PerformanceOptions = {}): PerformanceGroup[] {
  const settled = options.asOf === undefined ? trades : settledPerformanceTrades(trades, options.asOf);
  const groups = new Map<string, PerformanceGroup>();
  for (const trade of settled) {
    const net = options.readNetOverride && trade.profitBasis === 'net' && Number.isFinite(trade.netOverride) ? trade.netOverride! : pnl(trade);
    if (!Number.isFinite(net)) continue;
    const market = options.combineMarkets ? 'all' : trade.market;
    const key = `${market}|${trade.currency}`;
    let group = groups.get(key);
    if (!group) {
      group = { market, currency: trade.currency, samples: [] };
      groups.set(key, group);
    }
    group.samples.push({ trade, net });
  }
  return [...groups.values()].sort((a, b) => a.market.localeCompare(b.market) || a.currency.localeCompare(b.currency));
}

/** Journal wall times use their saved timezone; explicit ISO offsets already identify an instant. */
export function tradeTimestamp(value: string, timezone = 'Asia/Taipei'): number {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return parseExplicitTimestamp(value);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return NaN;
  const minute = match[1];
  const seconds = match[2] ?? '00';
  const milliseconds = (match[3] ?? '').padEnd(3, '0');
  const calendar = Date.parse(`${minute}:${seconds}.${milliseconds}Z`);
  if (!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0, 16) !== minute) return NaN;
  try {
    const utcMinute = convertWallTime(minute, timezone, 'UTC');
    // Invalid calendar times and nonexistent DST wall times are not ordered as real settlements.
    if (convertWallTime(utcMinute, 'UTC', timezone) !== minute) return NaN;
    return Date.parse(`${utcMinute}:${seconds}.${milliseconds}Z`);
  } catch {
    return NaN;
  }
}

export type RealizedDrawdownStat = {
  market: PerformanceMarket;
  currency: Trade['currency'];
  count: number;
  maxDrawdown: number;
  currentDrawdown: number;
  maxRecoveryMinutes: number | null;
  currentRecoveryMinutes: number | null;
  currentRecoveryStart: number | null;
};

/**
 * Period equity starts at zero and changes only at settlement. Same-instant exits settle together.
 * Recovery is measured from the latest prior equity high (initial zero uses the first entry),
 * through recovery settlement or the explicit asOf cutoff. Deposits/open positions are absent.
 */
export function realizedDrawdownStats(trades: Trade[], asOf: number, options: PerformanceOptions = {}): RealizedDrawdownStat[] {
  if (!Number.isFinite(asOf)) throw new RangeError('A finite drawdown observation cutoff is required');
  return performanceGroups(trades, options).flatMap(({ market, currency, samples }) => {
    const ordered = samples.map(sample => ({
      ...sample,
      exit: tradeTimestamp(sample.trade.exitTime, sample.trade.timezone),
      entry: tradeTimestamp(sample.trade.entryTime, sample.trade.timezone),
    })).filter(sample => Number.isFinite(sample.exit) && sample.exit <= asOf)
      .sort((a, b) => a.exit - b.exit || (Number.isFinite(a.entry) ? a.entry : a.exit) - (Number.isFinite(b.entry) ? b.entry : b.exit) || a.trade.id.localeCompare(b.trade.id));
    if (!ordered.length) return [];
    const first = ordered[0];
    let equity = 0;
    let equityCompensation = 0;
    let peak = 0;
    let peakTime = Number.isFinite(first.entry) && first.entry <= first.exit ? first.entry : first.exit;
    let maxDrawdown = 0;
    let currentRecoveryStart: number | null = null;
    let maxRecoveryMinutes: number | null = null;
    for (let index = 0; index < ordered.length;) {
      const exit = ordered[index].exit;
      let settlementNet = 0;
      while (index < ordered.length && ordered[index].exit === exit) settlementNet += ordered[index++].net;
      // Preserve conversion precision between settlements; round only the displayed amounts.
      const adjusted = settlementNet - equityCompensation;
      const nextEquity = equity + adjusted;
      equityCompensation = (nextEquity - equity) - adjusted;
      equity = nextEquity;
      const tolerance = Number.EPSILON * 4 * Math.max(1, Math.abs(equity), Math.abs(peak));
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
      if (equity < peak - tolerance && currentRecoveryStart === null) currentRecoveryStart = peakTime;
      if (equity >= peak - tolerance) {
        if (currentRecoveryStart !== null) {
          const elapsed = Math.max(0, (exit - currentRecoveryStart) / 60000);
          maxRecoveryMinutes = maxRecoveryMinutes === null ? elapsed : Math.max(maxRecoveryMinutes, elapsed);
        }
        peak = equity;
        peakTime = exit;
        currentRecoveryStart = null;
      }
    }
    return [{ market, currency, count: ordered.length, maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      currentDrawdown: Math.max(0, Math.round((peak - equity) * 100) / 100),
      maxRecoveryMinutes, currentRecoveryStart,
      currentRecoveryMinutes: currentRecoveryStart === null ? null : Math.max(0, (asOf - currentRecoveryStart) / 60000) }];
  });
}

export type StrategyPerformanceRow = { key: string; name: string; count: number; wins: number; winRate: number; net: number; expectancy: number };
export type StrategyPerformanceGroup = {
  market: PerformanceMarket;
  currency: Trade['currency'];
  /** Trades with at least one entered strategy. */
  count: number;
  /** Each strategy receives its tagged trade's full net result, so strategy totals overlap. */
  overlappingTradeCount: number;
  rows: StrategyPerformanceRow[];
};

function distinctStrategies(value: string): { key: string; name: string }[] {
  const names = new Map<string, { key: string; name: string }>();
  for (const part of value.split(/[、,，;；\n]+/)) {
    const normalized = normalizeStrategyName(part);
    if (normalized.key && !names.has(normalized.key)) names.set(normalized.key, normalized);
  }
  return [...names.values()];
}

/** Actual outcomes of tagged trades, with breakevens included in the win-rate denominator. */
export function strategyPerformanceStats(trades: Trade[], options: PerformanceOptions = {}): StrategyPerformanceGroup[] {
  // Keep one display spelling across market/currency groups, like enteredStrategyStats.
  const labels = new Map<string, string>();
  for (const trade of trades) for (const item of distinctStrategies(trade.strategy || '')) {
    if (!labels.has(item.key)) labels.set(item.key, item.name);
  }
  return performanceGroups(trades, options).flatMap(({ market, currency, samples }) => {
    const strategyRows = new Map<string, StrategyPerformanceRow>();
    let count = 0;
    let overlappingTradeCount = 0;
    for (const { trade, net } of samples) {
      const names = distinctStrategies(trade.strategy || '');
      if (!names.length) continue;
      count++;
      if (names.length > 1) overlappingTradeCount++;
      for (const { key } of names) {
        let row = strategyRows.get(key);
        if (!row) {
          row = { key, name: labels.get(key)!, count: 0, wins: 0, winRate: 0, net: 0, expectancy: 0 };
          strategyRows.set(key, row);
        }
        row.count++;
        if (net > 0) row.wins++;
        row.net += net;
      }
    }
    if (!count) return [];
    const rows = [...strategyRows.values()].map(row => ({ ...row, net: Math.round(row.net * 100) / 100,
      winRate: row.wins / row.count * 100, expectancy: row.net / row.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return [{ market, currency, count, overlappingTradeCount, rows }];
  });
}

export type DirectionMean = { count: number; wins: number; winRate: number | null; net: number | null; meanNet: number | null };
export type ProductDirectionStat = { market: PerformanceMarket; currency: Trade['currency']; symbol: string; long: DirectionMean; short: DirectionMean };
export type ProductDirectionSummary = { market: PerformanceMarket; currency: Trade['currency']; count: number; long: DirectionMean; short: DirectionMean };

function directionMean(count: number, wins: number, net: number): DirectionMean {
  return { count, wins, winRate: count ? wins / count * 100 : null, net: count ? net : null, meanNet: count ? net / count : null };
}

export function productDirectionStats(trades: Trade[], options: PerformanceOptions = {}): ProductDirectionStat[] {
  return performanceGroups(trades, options).flatMap(({ market, currency, samples }) => {
    const symbols = new Map<string, { long: number[]; short: number[] }>();
    for (const { trade, net } of samples) {
      const symbol = trade.symbol.normalize('NFKC').trim().toUpperCase();
      if (!symbol || (trade.side !== 'long' && trade.side !== 'short')) continue;
      let sides = symbols.get(symbol);
      if (!sides) { sides = { long: [], short: [] }; symbols.set(symbol, sides); }
      sides[trade.side].push(net);
    }
    const mean = (values: number[]): DirectionMean => directionMean(values.length, values.filter(value => value > 0).length, values.reduce((sum, value) => sum + value, 0));
    return [...symbols].map(([symbol, sides]) => ({ market, currency, symbol, long: mean(sides.long), short: mean(sides.short) }))
      .sort((a, b) => (b.long.count + b.short.count) - (a.long.count + a.short.count) || a.symbol.localeCompare(b.symbol));
  });
}

/** Direction summaries weight every trade equally, including breakevens in the win-rate denominator. */
export function productDirectionSummaryStats(rows: ProductDirectionStat[]): ProductDirectionSummary[] {
  const groups = new Map<string, { market: PerformanceMarket; currency: Trade['currency']; long: { count: number; wins: number; net: number }; short: { count: number; wins: number; net: number } }>();
  for (const row of rows) {
    const key = `${row.market}|${row.currency}`;
    let group = groups.get(key);
    if (!group) {
      group = { market: row.market, currency: row.currency, long: { count: 0, wins: 0, net: 0 }, short: { count: 0, wins: 0, net: 0 } };
      groups.set(key, group);
    }
    for (const side of ['long', 'short'] as const) {
      group[side].count += row[side].count;
      group[side].wins += row[side].wins;
      group[side].net += row[side].net ?? 0;
    }
  }
  return [...groups.values()].sort((a, b) => a.market.localeCompare(b.market) || a.currency.localeCompare(b.currency))
    .map(group => ({ market: group.market, currency: group.currency, count: group.long.count + group.short.count,
      long: directionMean(group.long.count, group.long.wins, group.long.net), short: directionMean(group.short.count, group.short.wins, group.short.net) }));
}

export type NetPnlBin = { key: string; sign: 'loss' | 'flat' | 'profit'; min: number; max: number; count: number; minInclusive: boolean; maxInclusive: boolean };
export type NetPnlDistributionStat = {
  market: PerformanceMarket;
  currency: Trade['currency'];
  count: number;
  bins: NetPnlBin[];
  mean: number | null;
  median: number | null;
  maxProfit: number | null;
  /** Signed negative result; null when no losing trade exists. */
  maxLoss: number | null;
};

function sideBins(values: number[], sign: 'loss' | 'profit', maxSideBins: number): NetPnlBin[] {
  if (!values.length) return [];
  const extent = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const targetCount = Math.min(maxSideBins, Math.ceil(Math.sqrt(values.length)));
  const rawWidth = extent / targetCount;
  const exponent = Math.floor(Math.log10(rawWidth));
  const step = 10 ** exponent;
  const widthUnits = Math.ceil(rawWidth / step);
  let width = Number(`${widthUnits}e${exponent}`);
  let count = Math.min(targetCount, Math.ceil(extent / width));
  // Build decimal boundaries directly, avoiding repeated 0.1 + 0.1 style artifacts.
  let edge = (multiple: number) => Number(`${multiple * widthUnits}e${exponent}`);
  let extentUpper = edge(count);
  if (!(width > 0) || !Number.isFinite(width) || !Number.isFinite(extentUpper) || extentUpper < extent) {
    // Only extreme finite conversion values can underflow/overflow the readable step.
    count = rawWidth > 0 ? targetCount : 1;
    width = extent / count;
    extentUpper = extent;
    edge = (multiple: number) => Math.abs(multiple) === count ? Math.sign(multiple) * extentUpper : multiple * width;
  }
  const bins = Array.from({ length: count }, (_, index): NetPnlBin => ({
    key: `${sign}-${index}`, sign,
    min: edge(sign === 'loss' ? index - count : index),
    max: edge(sign === 'loss' ? index + 1 - count : index + 1),
    count: 0, minInclusive: sign === 'loss', maxInclusive: sign === 'profit',
  }));
  // Loss bins are [min,max); profit bins are (min,max]. The zero bucket is independent.
  for (const value of values) {
    const estimatedIndex = sign === 'loss' ? Math.floor((value + extentUpper) / width) : Math.ceil(value / width) - 1;
    let index = Math.min(count - 1, Math.max(0, estimatedIndex));
    // Decimal division can land beside a boundary; actual comparisons keep inclusivity exact.
    while (index > 0 && (value < bins[index].min || (value === bins[index].min && !bins[index].minInclusive))) index--;
    while (index < count - 1 && (value > bins[index].max || (value === bins[index].max && !bins[index].maxInclusive))) index++;
    bins[index].count++;
  }
  return bins;
}

export function netPnlDistributionStats(trades: Trade[], options: PerformanceOptions & { maxSideBins?: number } = {}): NetPnlDistributionStat[] {
  const requestedBins = options.maxSideBins ?? 6;
  const maxSideBins = Number.isFinite(requestedBins) ? Math.max(1, Math.min(20, Math.floor(requestedBins))) : 6;
  return performanceGroups(trades, options).map(({ market, currency, samples }) => {
    const values = samples.map(sample => sample.net).sort((a, b) => a - b);
    const losses = values.filter(value => value < 0);
    const profits = values.filter(value => value > 0);
    const zeroCount = values.length - losses.length - profits.length;
    const middle = Math.floor(values.length / 2);
    return { market, currency, count: values.length,
      bins: [...sideBins(losses, 'loss', maxSideBins),
        ...(zeroCount ? [{ key: 'flat', sign: 'flat' as const, min: 0, max: 0, count: zeroCount, minInclusive: true, maxInclusive: true }] : []),
        ...sideBins(profits, 'profit', maxSideBins)],
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
      maxProfit: profits.length ? profits[profits.length - 1] : null,
      maxLoss: losses.length ? losses[0] : null };
  });
}
