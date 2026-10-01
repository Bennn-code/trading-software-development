import type { ExchangeRates } from './display-currency';

type Sample = { currency: string; mae: number | null; mfe: number | null };

/** Convert each observed sample to USD before averaging; never average currency means. */
export function overallMaeMfe(rows: Sample[], target: string, quote: ExchangeRates | null, now = Date.now()) {
  const fresh = quote && !quote.stale && Number.isFinite(quote.updatedAt) && quote.updatedAt <= now + 60000 && now - quote.updatedAt <= 3600000;
  const verifiedUsdt = fresh && quote.pricingVersion === 2 && typeof quote.usdtUpdatedAt === 'number' && quote.usdtUpdatedAt <= now + 60000 && now - quote.usdtUpdatedAt <= 3600000;
  const usd = { mae: 0, mfe: 0, maeCount: 0, mfeCount: 0 };
  let missingRates = 0;
  for (const row of rows) {
    const rate = row.currency === 'USD' ? 1 : fresh && (row.currency !== 'USDT' || verifiedUsdt) ? quote.rates[row.currency] : NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      if (row.mae !== null || row.mfe !== null) missingRates++;
      continue;
    }
    if (row.mae !== null && Number.isFinite(row.mae)) { usd.mae += row.mae / rate; usd.maeCount++; }
    if (row.mfe !== null && Number.isFinite(row.mfe)) { usd.mfe += row.mfe / rate; usd.mfeCount++; }
  }
  const requested = target === 'auto' ? 'USD' : target;
  const targetRate = requested === 'USD' ? 1 : fresh && (requested !== 'USDT' || verifiedUsdt) ? quote.rates[requested] : NaN;
  const conversionMissing = !Number.isFinite(targetRate) || targetRate <= 0;
  const factor = conversionMissing ? 1 : targetRate;
  return { currency: conversionMissing ? 'USD' : requested, count: rows.length,
    maeCount: usd.maeCount, mfeCount: usd.mfeCount,
    mae: usd.maeCount ? usd.mae / usd.maeCount * factor : null,
    mfe: usd.mfeCount ? usd.mfe / usd.mfeCount * factor : null,
    missingRates, conversionMissing };
}
