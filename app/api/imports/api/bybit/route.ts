import { z } from 'zod';
import { db, identity, json, failure, ApiError } from '@/lib/server';
import { enforceRateLimit, recordSecurityEvent } from '@/lib/security';
import { bybitHmacSha256, mapBybitClosedOption, type BybitClosedOption } from '@/lib/bybit-api';

const inputSchema = z.object({
  apiKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
  apiSecret: z.string().trim().min(8).max(256).regex(/^[A-Za-z0-9_-]+$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type BybitResponse = {
  retCode: number;
  result?: { list?: BybitClosedOption[]; nextPageCursor?: string };
};

async function requestPage(apiKey: string, apiSecret: string, startMs: number, endMs: number, cursor: string) {
  const params = new URLSearchParams({ category: 'option', startTime: String(startMs), endTime: String(endMs), limit: '100' });
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  const timestamp = String(Date.now()), receiveWindow = '5000';
  const signature = await bybitHmacSha256(apiSecret, `${timestamp}${apiKey}${receiveWindow}${query}`);
  const url = `https://api.bybit.com/v5/position/get-closed-positions?${query}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': receiveWindow,
        'X-BAPI-SIGN': signature,
      },
    });
  } catch {
    throw new ApiError('Bybit 連線逾時或暫時無法連線，請稍後重試。', 502);
  }
  if (!response.ok) throw new ApiError('Bybit API 暫時無法讀取資料，請確認 API 金鑰與 Bybit 服務狀態。', 502);
  let data: BybitResponse;
  try { data = await response.json() as BybitResponse; } catch { throw new ApiError('Bybit 回傳格式無法辨識，沒有匯入任何資料。', 502); }
  if (data.retCode !== 0) {
    const message = data.retCode === 10003 || data.retCode === 10004
      ? 'API 金鑰或簽章無效，請檢查 Key／Secret。'
      : data.retCode === 10005
        ? '此 API Key 沒有查詢權限；請在 Bybit 設定唯讀權限。'
        : data.retCode === 10006
          ? 'Bybit API 查詢次數已達限制，請稍後重試。'
          : 'Bybit API 拒絕了查詢，請確認帳戶地區與 API 權限。';
    throw new ApiError(message, 400);
  }
  return data.result ?? {};
}

function dateMs(value: string) {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

export async function POST(request: Request) {
  try {
    const owner = await identity(request, true);
    await enforceRateLimit(request, { scope: 'bybit-api-import', limit: 5, windowSeconds: 3600, subject: owner });
    const raw = await request.text();
    if (raw.length > 3000) throw new ApiError('API 匯入資料格式不正確。');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ApiError('API 匯入資料格式不正確。'); }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('請填寫正確的 Bybit API Key、Secret 和日期。');
    const { apiKey, apiSecret, startDate, endDate } = parsed.data;
    const start = dateMs(startDate), endExclusive = dateMs(endDate) + 86_400_000;
    const now = Date.now(), oldestDate = new Date(now), oldestDay = oldestDate.getUTCDate();
    oldestDate.setUTCDate(1);
    oldestDate.setUTCMonth(oldestDate.getUTCMonth() - 6);
    oldestDate.setUTCDate(Math.min(oldestDay, new Date(Date.UTC(oldestDate.getUTCFullYear(), oldestDate.getUTCMonth() + 1, 0)).getUTCDate()));
    oldestDate.setUTCHours(0, 0, 0, 0);
    if (!Number.isFinite(start) || !Number.isFinite(endExclusive) || start > now || start >= endExclusive || endExclusive > now + 86_400_000) throw new ApiError('請確認日期順序，結束日期不可晚於今天。');
    if (start < oldestDate.getTime()) throw new ApiError('Bybit 選擇權 API 最多查詢最近六個月，請縮短日期區間。');

    const rows = new Map<string, BybitClosedOption>();
    const maxWindow = 7 * 86_400_000 - 1;
    for (let windowStart = start; windowStart < endExclusive; windowStart += maxWindow + 1) {
      const windowEnd = Math.min(windowStart + maxWindow, endExclusive - 1);
      let cursor = '';
      let pages = 0;
      do {
        const result = await requestPage(apiKey, apiSecret, windowStart, windowEnd, cursor);
        for (const row of result.list ?? []) {
          if (!row.symbol.endsWith('-USDT') || !Number.isFinite(row.openTime) || !Number.isFinite(row.closeTime)) continue;
          const fingerprint = JSON.stringify([row.symbol, row.side, row.openTime, row.closeTime, row.qty, row.avgEntryPrice, row.avgExitPrice, row.totalPnl]);
          rows.set(fingerprint, row);
          if (rows.size > 50) throw new ApiError('這次查到超過 50 筆；請縮短日期區間後分批匯入。', 413);
        }
        cursor = result.nextPageCursor ?? '';
        pages++;
        if (pages > 20) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
      } while (cursor);
    }

    const preference = await db().prepare('SELECT timezone FROM account_preferences WHERE user_id = ?').bind(owner).first<{ timezone: string }>();
    const timezone = preference?.timezone || 'Asia/Taipei';
    const trades = (await Promise.all([...rows.values()].sort((a, b) => a.closeTime - b.closeTime).map(row => mapBybitClosedOption(row, owner, timezone)))).filter((trade) => trade !== null);
    await recordSecurityEvent(request, 'api_trade_imported', owner, { provider: 'bybit-options', count: trades.length, startDate, endDate });
    return json({ trades, warnings: ['目前 Bybit 直連只匯入 USDT 選擇權已平倉紀錄；totalPnl 是交易所回傳的結算損益，手續費只作明細顯示，不會重複扣除。未平倉、現貨及其他合約類型不在此匯入範圍。'] });
  } catch (error) {
    return failure(error);
  }
}
