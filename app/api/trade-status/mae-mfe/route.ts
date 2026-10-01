import { z } from 'zod';
import { calculateMaeMfe } from '@/lib/trade-status';
import { historicalCandles, QuoteBudgetError, QuoteError, type CryptoCursor } from '@/lib/market-candles';
import { tradeSchema } from '@/lib/validation';
import { ApiError, db, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';
import { excursionInput, fillExcursions, savedExcursions } from '@/lib/trade-excursions';
import { validExcursionScan, type ExcursionScan } from '@/lib/mae-mfe-state';
import { confirmStoredProduct, saveExcursionPatch, storedExcursionTrades, type StoredExcursionTrade } from '@/lib/mae-mfe-persistence';
import { pnl, type Trade } from '@/lib/trades';

// Secrets are request-scoped: never persisted, echoed, cached or logged.
const key = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_.-]+$/).optional();
const provider = z.enum(['okx', 'bybit', 'bingx']);
const timeframe = z.enum(['1m','5m','15m','30m','1h','4h','1d']);
const cursorSchema = z.object({ version: z.literal(2), provider, timeframe, scanned: z.array(z.object({ provider, timeframe }).strict()).max(21), unavailable: z.array(provider).max(3), complete: z.boolean().optional() }).strict();
const legacyCursorSchema = z.object({ providerIndex: z.number().int().min(0).max(3), intervalIndex: z.number().int().min(0).max(6) }).strict();
const inputSchema = z.object({
  trades: z.array(tradeSchema).min(1).max(3),
  cryptoSource: z.enum(['auto', 'okx', 'bybit', 'bingx']).default('auto'),
  resume: z.record(z.string().uuid(), z.union([cursorSchema, legacyCursorSchema])).optional(),
  quoteKeys: z.object({ fugle: key, twelveData: key, databento: key }).strict().optional(),
  persist: z.boolean().default(false), profileId: z.string().uuid().optional(), retry: z.boolean().default(false),
  confirmations: z.record(z.string().uuid(), z.enum(['spot','perpetual'])).optional(),
}).strict().refine(input => new Set(input.trades.map(trade => trade.id)).size === input.trades.length && [...Object.keys(input.resume ?? {}), ...Object.keys(input.confirmations ?? {})].every(id => input.trades.some(trade => trade.id === id && trade.market === 'crypto')));
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
    const stored = parsed.data.persist ? await storedExcursionTrades(owner, parsed.data.trades.map(trade => trade.id), parsed.data.profileId) : null;
    const records = new Map(stored?.records.map(record => [record.trade.id, record]));
    const trades = stored ? stored.records.map(record => confirmStoredProduct(record.trade, parsed.data.confirmations?.[record.trade.id])) : parsed.data.trades;
    const rows = [], skipped: { id: string; reason: string; retryable?: boolean; diagnostic?: { provider: string; status: number } }[] = [], deferred: { id: string; resume?: CryptoCursor }[] = [], completed: string[] = [], persistedTrades: Trade[] = [], conflicts: string[] = [];
    const context: Parameters<typeof historicalCandles>[2] = { fetch, reserve: reserveOutboundSlot, requests: 0, maxRequests: 32, cryptoSource: parsed.data.cryptoSource };
    async function persist(trade: Trade, scan: ExcursionScan) {
      if (!stored) return true;
      const record = records.get(trade.id) as StoredExcursionTrade;
      const saved = await saveExcursionPatch(owner, stored.profile, record, { ...trade, excursionScan: scan });
      if (saved) { persistedTrades.push(saved); return true; }
      conflicts.push(trade.id);
      return false;
    }
    const scan = (trade: Trade, status: ExcursionScan['status'], details: Partial<ExcursionScan> = {}): ExcursionScan => ({ version: 2, input: excursionInput(trade), source: parsed.data.cryptoSource, status, updatedAt: new Date().toISOString(), ...details });
    let stopped = false, budgetExhausted = false;
    for (const trade of trades) {
      const saved = savedExcursions(trade), prior = stored ? validExcursionScan(trade) : null;
      // Successful and permanently exhausted results survive reloads; they never issue another quote.
      if (prior?.status === 'complete') {
        if (saved.estimate) rows.push({ id: trade.id, market: trade.market, symbol: trade.symbol, currency: trade.currency, entryTime: trade.entryTime, ...saved.estimate, mae: saved.mae.amount, mfe: saved.mfe.amount, actual: pnl(trade) });
        completed.push(trade.id); persistedTrades.push(trade); continue;
      }
      if (prior?.status === 'missing' && (prior.resume?.complete || !parsed.data.retry && prior.source === parsed.data.cryptoSource)) { skipped.push({ id: trade.id, reason: prior.reason ?? '已查完可用來源，仍缺少完整持倉行情。' }); completed.push(trade.id); persistedTrades.push(trade); continue; }
      if (prior?.status === 'blocked' && !parsed.data.retry && prior.source === parsed.data.cryptoSource) {
        skipped.push({ id: trade.id, reason: prior.reason ?? '行情來源暫時無法查詢，請稍後手動續查。', retryable: true, ...(prior.diagnostic ? { diagnostic: prior.diagnostic } : {}) }); persistedTrades.push(trade); stopped = true; continue;
      }
      const resume = prior?.resume ?? (!stored ? parsed.data.resume?.[trade.id] : undefined);
      if (budgetExhausted || stopped) { deferred.push({ id: trade.id, ...(resume && 'version' in resume ? { resume } : {}) }); continue; }
      // Complete manual values also require no history lookup; occurrence times remain unknown.
      if (saved.mae.amount !== null && saved.mfe.amount !== null) {
        if (await persist(trade, scan(trade, 'complete'))) completed.push(trade.id);
        continue;
      }
      // Known profit alone cannot establish position size. Reject before querying.
      if (!calculateMaeMfe(trade, [{ high: Math.max(trade.entry, trade.exit), low: Math.min(trade.entry, trade.exit) }])) {
        const reason = '缺少有效進出場價格、部位大小或商品乘數，無法把行情換算為 MAE／MFE 金額。';
        if (await persist(trade, scan(trade, 'missing', { reason }))) { skipped.push({ id: trade.id, reason }); completed.push(trade.id); } continue;
      }
      try {
        context.cryptoCursor = undefined;
        const result = await historicalCandles(trade, parsed.data.quoteKeys ?? {}, context, resume);
        if (!result) {
          const reason = '已查完可用來源與週期，仍缺少完整持倉行情；可能是商品未掛牌、歷史期限或 K 線缺口，未估算 MAE／MFE。';
          if (await persist(trade, scan(trade, 'missing', { reason, ...(context.cryptoCursor ? { resume: context.cryptoCursor } : {}) }))) { skipped.push({ id: trade.id, reason }); completed.push(trade.id); } continue;
        }
        const stats = calculateMaeMfe(trade, result.candles, result.intervalMinutes);
        if (!stats) {
          const reason = '交易部位或行情數值無效，未估算 MAE／MFE。';
          if (await persist(trade, scan(trade, 'missing', { reason, ...(result.cryptoScan ? { resume: result.cryptoScan } : {}) }))) { skipped.push({ id: trade.id, reason }); completed.push(trade.id); } continue;
        }
        const row = { id: trade.id, market: trade.market, symbol: trade.symbol, currency: trade.currency, entryTime: trade.entryTime, provider: result.provider, timeframe: result.timeframe, referenceSymbol: result.referenceSymbol, productType: result.productType, ...stats };
        const filled = fillExcursions(trade, trade, row, new Set());
        if (await persist(filled, scan(filled, 'complete', { ...(result.cryptoScan ? { resume: result.cryptoScan } : {}) }))) {
          // The visible result respects existing manual values, just as the stored result does.
          const effective = savedExcursions(filled);
          rows.push({ ...row, mae: effective.mae.amount, mfe: effective.mfe.amount, maeTime: effective.mae.automatic ? effective.estimate?.maeTime ?? null : null, mfeTime: effective.mfe.automatic ? effective.estimate?.mfeTime ?? null : null }); completed.push(trade.id);
        }
      } catch (error) {
        if (!(error instanceof QuoteError)) throw error;
        if (error instanceof QuoteBudgetError) {
          const next = error.cursor ?? context.cryptoCursor;
          if (await persist(trade, scan(trade, 'pending', { ...(next ? { resume: next } : {}) }))) deferred.push({ id: trade.id, ...(next ? { resume: next } : {}) });
          budgetExhausted = true; continue;
        }
        const retryable = error.stop || error.retryable;
        const next = error.cursor ?? context.cryptoCursor;
        if (await persist(trade, scan(trade, retryable ? 'blocked' : 'missing', { reason: error.message, ...(next ? { resume: next } : {}), ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) }))) {
          skipped.push({ id: trade.id, reason: error.message, retryable, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) });
          if (!retryable) completed.push(trade.id);
        }
        stopped = retryable;
      }
    }
    return json({ rows, skipped, deferred, completed, stopped, ...(stored ? { persistedTrades, conflicts } : {}) });
  } catch (error) { return failure(error); }
}
