import type { ExchangeRates } from './display-currency';
import { pnl, type Trade } from './trades';

/** A current, verified quote is required only when currencies differ. */
export function performanceFxFactor(source: string, target: string, rates: ExchangeRates | null, now: number): number | null {
  if (source === target) return 1;
  const fresh = !!rates && !rates.stale && Number.isFinite(now) && Number.isFinite(rates.updatedAt) && rates.updatedAt <= now + 60_000 && now - rates.updatedAt <= 3_600_000;
  const verifiedUsdt = fresh && rates?.pricingVersion === 2 && typeof rates.usdtUpdatedAt === 'number' && Number.isFinite(rates.usdtUpdatedAt) && rates.usdtUpdatedAt <= now + 60_000 && now - rates.usdtUpdatedAt <= 3_600_000;
  const rate = (currency: string) => currency === 'USD' ? 1 : fresh && (currency !== 'USDT' || verifiedUsdt) ? rates!.rates[currency] : NaN;
  const from = rate(source), to = rate(target), factor = to / from;
  return Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0 && Number.isFinite(factor) && factor > 0 ? factor : null;
}

/**
 * Display-only copies for realized-performance statistics. Original-currency mode
 * must still be grouped by currency by the caller; it is not a common-currency sum.
 * The caller must show omitted sample counts whenever conversion is incomplete.
 * Only realized net P&L is converted, not fees, prices or optional MAE/MFE fields.
 */
export function performanceCurrencyTrades(trades: Trade[], target: string, rates: ExchangeRates | null, now = Date.now()): { trades: Trade[]; omitted: number; currency: string | null } {
  if (target === 'auto') return { trades, omitted: 0, currency: null };
  const output: Trade[] = [];
  for (const trade of trades) {
    const net = pnl(trade);
    if (!Number.isFinite(net)) continue;
    // Matching currencies need no FX quote, including USDT-to-USDT.
    if (trade.currency === target) { output.push({ ...trade, netOverride: net, profitBasis: 'net' }); continue; }
    const factor = performanceFxFactor(trade.currency, target, rates, now);
    if (factor === null) continue;
    const converted = net * factor;
    if (!Number.isFinite(converted)) continue;
    // Keep conversion precision until chart formatting; the original trade is untouched.
    output.push({ ...trade, currency: target as Trade['currency'], netOverride: converted, profitBasis: 'net' });
  }
  return { trades: output, omitted: trades.length - output.length, currency: target };
}
