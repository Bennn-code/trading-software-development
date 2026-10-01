import { z } from 'zod';
import { calculateMaeMfe } from '@/lib/trade-status';
import { historicalCandles, QuoteBudgetError, QuoteError, type CryptoCursor } from '@/lib/market-candles';
import { tradeSchema } from '@/lib/validation';
import { ApiError, db, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';

// Secrets are request-scoped: never persisted, echoed, cached or logged.
const key = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_.-]+$/).optional();
const cursorSchema = z.object({ providerIndex: z.number().int().min(0).max(3), intervalIndex: z.number().int().min(0).max(6) }).strict();
const inputSchema = z.object({ trades: z.array(tradeSchema).min(1).max(3), cryptoSource: z.enum(['auto', 'binance', 'okx', 'bybit', 'bingx']).default('auto'), resume: z.record(z.string().uuid(), cursorSchema).optional(), quoteKeys: z.object({ fugle: key, twelveData: key, databento: key }).strict().optional() }).strict().refine(input => Object.entries(input.resume ?? {}).every(([id,cursor]) => input.trades.some(trade => trade.id === id && trade.market === 'crypto') && (input.cryptoSource === 'auto' || cursor.providerIndex === 0)));
async function reserveOutboundSlot(provider: string) {
  const bucket = `market-candle-egress:${provider}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = Math.floor(Date.now() / 1000);
    const row = await db().prepare(`INSERT INTO security_rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN security_rate_limits.expires_at<=? THEN 1 ELSE security_rate_limits.hits+1 END,expires_at=CASE WHEN security_rate_limits.expires_at<=? THEN ? ELSE security_rate_limits.expires_at END RETURNING hits,expires_at`).bind(bucket, now + 1, now, now, now + 1).first<{ hits: number; expires_at: number }>();
    if (row?.hits === 1) return;
    await new Promise(resolve => setTimeout(resolve, Math.max(80, (Number(row?.expires_at ?? now + 1) - now) * 1000 - (Date.now() % 1000) + 20)));
  }
  throw new QuoteError('市場資料查詢目前繁忙，請稍後再分析。', true);
}

export async function POST(request: Request) {
  try {
    const owner = await identity(request, true);
    await enforceRateLimit(request, { scope: 'trade-status-mae-mfe', limit: 60, ipLimit: 240, windowSeconds: 3600, subject: owner });
    const parsed = inputSchema.safeParse(await readJson(request, 32_000));
    if (!parsed.success) throw new ApiError('每次分析最多三筆有效交易；請檢查交易欄位與行情金鑰格式。');
    const rows = [], skipped: { id: string; reason: string; retryable?: boolean; diagnostic?: { provider: string; status: number } }[] = [], deferred: { id: string; resume?: CryptoCursor }[] = [], completed: string[] = [];
    const context = { fetch, reserve: reserveOutboundSlot, requests: 0, maxRequests: 32, cryptoSource: parsed.data.cryptoSource };
    let stopped = false, budgetExhausted = false;
    for (const trade of parsed.data.trades) {
      if (budgetExhausted || stopped) { deferred.push({ id: trade.id, resume: parsed.data.resume?.[trade.id] }); continue; }
      // Known profit alone cannot establish position size. Reject before querying.
      if (!calculateMaeMfe(trade, [{ high: Math.max(trade.entry, trade.exit), low: Math.min(trade.entry, trade.exit) }])) {
        skipped.push({ id: trade.id, reason: '缺少有效進出場價格、部位大小或商品乘數，無法把行情換算為 MAE／MFE 金額。' }); completed.push(trade.id); continue;
      }
      try {
        const result = await historicalCandles(trade, parsed.data.quoteKeys ?? {}, context, parsed.data.resume?.[trade.id]);
        if (!result) { skipped.push({ id: trade.id, reason: '已查完可用來源與週期，仍缺少完整持倉行情；可能是商品未掛牌、歷史期限或 K 線缺口，未估算 MAE／MFE。' }); completed.push(trade.id); continue; }
        const stats = calculateMaeMfe(trade, result.candles);
        if (!stats) { skipped.push({ id: trade.id, reason: '交易部位或行情數值無效，未估算 MAE／MFE。' }); completed.push(trade.id); continue; }
        rows.push({ id: trade.id, market: trade.market, symbol: trade.symbol, currency: trade.currency, entryTime: trade.entryTime, provider: result.provider, timeframe: result.timeframe, referenceSymbol: result.referenceSymbol, productType: result.productType, ...stats });
        completed.push(trade.id);
      } catch (error) {
        if (!(error instanceof QuoteError)) throw error;
        if (error instanceof QuoteBudgetError) { deferred.push({ id: trade.id, resume: error.cursor ?? parsed.data.resume?.[trade.id] }); budgetExhausted = true; continue; }
        const retryable = error.stop || error.retryable;
        skipped.push({ id: trade.id, reason: error.message, retryable, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) }); stopped = retryable;
        if (!retryable) completed.push(trade.id);
      }
    }
    return json({ rows, skipped, deferred, completed, stopped });
  } catch (error) { return failure(error); }
}
