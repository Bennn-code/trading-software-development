import { db, json, ApiError, failure } from '@/lib/server';
import { currencyOptions } from '@/lib/preferences';
import { createUsdRateLoader } from '@/lib/exchange-rate';
import { readBoundedText } from '@/lib/bounded-response';
const HOUR = 60 * 60 * 1000;
const loadUsdt = createUsdRateLoader();
type Quote = { rates: Record<string, number>; updatedAt: number; provider: string; pricingVersion: number; usdtUpdatedAt?: number };
function usable(q: Quote) { return q && q.pricingVersion === 2 && typeof q.updatedAt === 'number' && q.updatedAt <= Date.now() + 60000 && q.rates?.USD === 1; }
function valid(q: Quote) { return usable(q) && Date.now() - q.updatedAt < HOUR && (!q.rates.USDT || (typeof q.usdtUpdatedAt === 'number' && Date.now() - q.usdtUpdatedAt < HOUR)); }
export async function GET() {
  try {
    const database = db(), cached = await database.prepare("SELECT payload FROM exchange_rates WHERE pair='DISPLAY_USD'").first<{ payload: string }>();
    const previous = cached ? JSON.parse(cached.payload) as Quote : null;
    if (previous && valid(previous)) return json(previous);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD', { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('fiat provider');
      const fiat = JSON.parse(await readBoundedText(response, 64000)) as { rates?: Record<string, number> };
      if (!fiat.rates) throw new Error('fiat payload');
      const rates: Record<string, number> = { USD: 1 };
      for (const [code] of currencyOptions) { const value = fiat.rates[code]; if (Number.isFinite(value) && value > 0 && code !== 'USDT') rates[code] = value; }
      let usdtUpdatedAt: number | undefined;
      try { const usdt = await loadUsdt(); rates.USDT = 1 / usdt.rate; usdtUpdatedAt = usdt.updatedAt; } catch { /* Never assume a peg. */ }
      const quote: Quote = { rates, updatedAt: Date.now(), pricingVersion: 2, provider: usdtUpdatedAt ? 'ExchangeRate-API / Coinbase' : 'ExchangeRate-API', ...(usdtUpdatedAt ? { usdtUpdatedAt } : {}) };
      await database.prepare("INSERT INTO exchange_rates(pair,payload,fetched_at) VALUES('DISPLAY_USD',?,?) ON CONFLICT(pair) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at").bind(JSON.stringify(quote), quote.updatedAt).run();
      return json(quote);
    } catch {
      if (previous && usable(previous)) return json({ ...previous, stale: true });
      throw new ApiError('暫時無法取得今日匯率', 503);
    }
  } catch (error) { return failure(error); }
}
