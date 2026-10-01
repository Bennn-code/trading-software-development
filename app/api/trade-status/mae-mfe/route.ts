import { z } from 'zod';
import { calculateMaeMfe } from '@/lib/trade-status';
import { historicalCandles, QuoteError } from '@/lib/market-candles';
import { tradeSchema } from '@/lib/validation';
import { ApiError, db, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';

// Secrets are request-scoped: never persisted, echoed, cached or logged.
const key = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_.-]+$/).optional();
const inputSchema = z.object({ trades: z.array(tradeSchema).min(1).max(3), quoteKeys: z.object({ fugle: key, twelveData: key, databento: key }).strict().optional() }).strict();
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
    const rows = [], skipped = [];
    const context = { fetch, reserve: reserveOutboundSlot, requests: 0, maxRequests: 24 };
    let stopped = false;
    for (const trade of parsed.data.trades) {
      if (stopped) { skipped.push({ id: trade.id, reason: '本批行情查詢已停止，未再送出請求。' }); continue; }
      try {
        const result = await historicalCandles(trade, parsed.data.quoteKeys ?? {}, context);
        if (!result) { skipped.push({ id: trade.id, reason: '所有可用週期或來源均未提供完整持倉期間行情，未估算 MAE／MFE。' }); continue; }
        const stats = calculateMaeMfe(trade, result.candles);
        if (!stats) { skipped.push({ id: trade.id, reason: '交易部位或行情數值無效，未估算 MAE／MFE。' }); continue; }
        rows.push({ id: trade.id, market: trade.market, symbol: trade.symbol, currency: trade.currency, entryTime: trade.entryTime, provider: result.provider, timeframe: result.timeframe, referenceSymbol: result.referenceSymbol, productType: result.productType, ...stats });
      } catch (error) {
        if (!(error instanceof QuoteError)) throw error;
        skipped.push({ id: trade.id, reason: error.message }); stopped = error.stop;
      }
    }
    return json({ rows, skipped, stopped });
  } catch (error) { return failure(error); }
}
