import { z } from 'zod';
import { ApiError, db, failure, identity, json } from '@/lib/server';
import { enforceRateLimit, recordSecurityEvent } from '@/lib/security';
import { hmacSha256Base64, hmacSha256Hex, mapBitgetPosition, mapKucoinUtaPosition, mapOkxPosition, type BitgetHistoryPosition, type KucoinUtaHistoryPosition, type OkxHistoryPosition } from '@/lib/exchange-api';

const inputSchema = z.object({
  apiKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._-]+$/),
  apiSecret: z.string().trim().min(8).max(256).regex(/^[A-Za-z0-9_+/=-]+$/),
  apiPassphrase: z.string().min(1).max(256).regex(/^[^\r\n\u0000-\u001f\u007f]+$/),
  apiKeyVersion: z.enum(['2', '3']).optional(),
  symbol: z.string().trim().max(30).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Params = { params: Promise<{ provider: string }> };
type OkxResponse = { code: string; data?: OkxHistoryPosition[] };
type BitgetResponse = { code: string; data?: { list?: BitgetHistoryPosition[]; endId?: string } };
type KucoinResponse = { code: string; data?: { items?: KucoinUtaHistoryPosition[]; lastId?: string | number } };
const DAY = 86_400_000;

function dateMs(value: string) {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}

function oldestSupportedDate() {
  const date = new Date();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 3);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

async function fetchJson<T>(url: string, headers: HeadersInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000), headers });
  } catch {
    throw new ApiError('交易所暫時無法讀取資料，請稍後重試。', 502);
  }
  if (!response.ok) throw new ApiError(response.status === 429 ? '交易所查詢次數已達上限，請稍後重試。' : '交易所暫時無法讀取資料，請稍後重試。', response.status === 429 ? 429 : 502);
  try { return await response.json() as T; } catch { throw new ApiError('API 回傳資料格式無法辨識；沒有匯入任何資料。', 502); }
}

async function requestOkxPage(apiKey: string, apiSecret: string, passphrase: string, after: string): Promise<OkxHistoryPosition[]> {
  const path = '/api/v5/account/positions-history';
  const params = new URLSearchParams({ instType: 'SWAP', limit: '100', after });
  const query = params.toString(), timestamp = new Date().toISOString();
  const signature = await hmacSha256Base64(apiSecret, `${timestamp}GET${path}?${query}`);
  const data = await fetchJson<OkxResponse>(`https://www.okx.com${path}?${query}`, {
    'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase,
  });
  if (data.code !== '0') throw new ApiError('API 金鑰、Passphrase 或簽章不正確，或缺少唯讀查詢權限。', 400);
  if (!Array.isArray(data.data)) throw new ApiError('API 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  return data.data;
}

async function requestBitgetPage(apiKey: string, apiSecret: string, passphrase: string, start: number, end: number, cursor: string): Promise<{ rows: BitgetHistoryPosition[]; next: string }> {
  const path = '/api/v2/mix/position/history-position';
  const params = new URLSearchParams({ productType: 'USDT-FUTURES', startTime: String(start), endTime: String(end), limit: '100' });
  if (cursor) params.set('idLessThan', cursor);
  const query = params.toString(), timestamp = String(Date.now());
  const signature = await hmacSha256Base64(apiSecret, `${timestamp}GET${path}?${query}`);
  const data = await fetchJson<BitgetResponse>(`https://api.bitget.com${path}?${query}`, {
    'ACCESS-KEY': apiKey, 'ACCESS-SIGN': signature, 'ACCESS-TIMESTAMP': timestamp, 'ACCESS-PASSPHRASE': passphrase,
    'locale': 'en-US', 'Content-Type': 'application/json',
  });
  if (data.code !== '00000') throw new ApiError('API 金鑰、Passphrase 或簽章不正確，或缺少唯讀查詢權限。', 400);
  if (!Array.isArray(data.data?.list)) throw new ApiError('API 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  return { rows: data.data.list, next: data.data.endId ?? '' };
}

async function requestKucoinPage(apiKey: string, apiSecret: string, passphrase: string, keyVersion: string, symbol: string, start: number, end: number, cursor: string): Promise<{ rows: KucoinUtaHistoryPosition[]; next: string }> {
  const path = '/api/ua/v1/position/history';
  const params = new URLSearchParams({ symbol, startAt: String(start), endAt: String(end), pageSize: '100' });
  if (cursor) params.set('lastId', cursor);
  const query = params.toString(), endpoint = `${path}?${query}`, timestamp = String(Date.now());
  const signature = await hmacSha256Base64(apiSecret, `${timestamp}GET${endpoint}`);
  const passphraseSignature = await hmacSha256Base64(apiSecret, passphrase);
  const data = await fetchJson<KucoinResponse>(`https://api.kucoin.com${endpoint}`, {
    'KC-API-KEY': apiKey, 'KC-API-SIGN': signature, 'KC-API-TIMESTAMP': timestamp,
    'KC-API-PASSPHRASE': passphraseSignature, 'KC-API-KEY-VERSION': keyVersion, 'Content-Type': 'application/json',
  });
  if (data.code !== '200000') throw new ApiError('API 金鑰、Passphrase 或簽章不正確，或缺少唯讀查詢權限。', 400);
  if (!Array.isArray(data.data?.items)) throw new ApiError('API 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  return { rows: data.data.items, next: data.data.lastId == null ? '' : String(data.data.lastId) };
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!['bitget', 'okx', 'kucoin'].includes(provider)) throw new ApiError('此 API 來源尚未開放連線。', 404);
    const owner = await identity(request, true);
    await enforceRateLimit(request, { scope: `${provider}-api-import`, limit: 5, windowSeconds: 3600, subject: owner });
    const raw = await request.text();
    if (raw.length > 5000) throw new ApiError('API 匯入資料格式不正確。');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new ApiError('API 匯入資料格式不正確。'); }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('請填寫有效的 API Key、Secret、Passphrase 和日期。');
    const { apiKey, apiSecret, apiPassphrase, apiKeyVersion, symbol, startDate, endDate } = parsed.data;
    const start = dateMs(startDate), endExclusive = dateMs(endDate) + DAY;
    if (!Number.isFinite(start) || !Number.isFinite(endExclusive) || start >= endExclusive || endExclusive > Date.now() + DAY) throw new ApiError('請確認日期順序，結束日期不可晚於今天。');
    if (start < oldestSupportedDate()) throw new ApiError('交易所只保留最近三個月的已平倉資料，請縮短日期區間。');
    if (provider === 'kucoin' && !/^[A-Z0-9]{4,20}USDTM$/.test(symbol ?? '')) throw new ApiError('請輸入 USDT-M 合約代碼，例如 XBTUSDTM。');

    const sourceRows: (BitgetHistoryPosition | OkxHistoryPosition | KucoinUtaHistoryPosition)[] = [];
    if (provider === 'bitget') {
      let cursor = '', pageCount = 0;
      do {
        const page = await requestBitgetPage(apiKey, apiSecret, apiPassphrase, start, endExclusive - 1, cursor);
        sourceRows.push(...page.rows);
        cursor = page.rows.length === 100 ? page.next : '';
        pageCount++;
        if (sourceRows.length > 2000 || pageCount > 20) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
      } while (cursor);
    } else if (provider === 'okx') {
      let cursor = String(endExclusive), pageCount = 0;
      const seenCursors = new Set<string>();
      while (pageCount < 20) {
        const page = await requestOkxPage(apiKey, apiSecret, apiPassphrase, cursor);
        sourceRows.push(...page);
        pageCount++;
        if (sourceRows.length > 2000 || page.length < 100) break;
        const oldest = page.reduce((value, row) => Math.min(value, Number(row.uTime) || Infinity), Infinity);
        const next = String(oldest);
        if (!Number.isFinite(oldest) || oldest < start || seenCursors.has(next)) break;
        seenCursors.add(next);
        cursor = next;
      }
      if (pageCount === 20 && sourceRows.length >= 2000) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
    } else {
      const windowSize = 7 * DAY;
      for (let windowStart = start; windowStart < endExclusive; windowStart += windowSize) {
        const windowEnd = Math.min(windowStart + windowSize - 1, endExclusive - 1);
        let cursor = '', pageCount = 0;
        do {
          const page = await requestKucoinPage(apiKey, apiSecret, apiPassphrase, apiKeyVersion ?? '3', symbol!, windowStart, windowEnd, cursor);
          sourceRows.push(...page.rows);
          cursor = page.rows.length === 100 ? page.next : '';
          pageCount++;
          if (sourceRows.length > 2000 || pageCount > 20) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
        } while (cursor);
      }
    }

    const inRange = sourceRows.filter(row => {
      const close = provider === 'bitget' ? Number((row as BitgetHistoryPosition).utime) : provider === 'okx' ? Number((row as OkxHistoryPosition).uTime) : Number((row as KucoinUtaHistoryPosition).closingTime) / 1_000_000;
      return Number.isFinite(close) && close >= start && close < endExclusive;
    });
    const unique = new Map<string, (typeof inRange)[number]>();
    for (const row of inRange) {
      const id = provider === 'bitget' ? JSON.stringify([(row as BitgetHistoryPosition).positionId, (row as BitgetHistoryPosition).ctime, (row as BitgetHistoryPosition).utime, (row as BitgetHistoryPosition).closeTotalPos])
        : provider === 'okx' ? JSON.stringify([(row as OkxHistoryPosition).posId, (row as OkxHistoryPosition).cTime, (row as OkxHistoryPosition).uTime])
          : (row as KucoinUtaHistoryPosition).closeId;
      unique.set(id, row);
    }
    if (unique.size > 50) throw new ApiError('這次查到超過 50 筆；請縮短日期區間後分批匯入。', 413);

    const preference = await db().prepare('SELECT timezone FROM account_preferences WHERE user_id = ?').bind(owner).first<{ timezone: string }>();
    const timezone = preference?.timezone || 'Asia/Taipei';
    const ordered = [...unique.values()];
    ordered.sort((left, right) => {
      const time = (row: typeof left) => provider === 'bitget' ? Number((row as BitgetHistoryPosition).utime) : provider === 'okx' ? Number((row as OkxHistoryPosition).uTime) : Number((row as KucoinUtaHistoryPosition).closingTime);
      return time(left) - time(right);
    });
    const mapped = await Promise.all(ordered.map(row => provider === 'bitget' ? mapBitgetPosition(row as BitgetHistoryPosition, owner, timezone)
      : provider === 'okx' ? mapOkxPosition(row as OkxHistoryPosition, owner, timezone)
        : mapKucoinUtaPosition(row as KucoinUtaHistoryPosition, owner, timezone)));
    const trades = mapped.filter((trade): trade is NonNullable<typeof trade> => trade !== null);
    await recordSecurityEvent(request, 'api_trade_imported', owner, { provider, count: trades.length, startDate, endDate });
    const warnings = provider === 'bitget'
      ? ['僅匯入 Bitget USDT-M 期貨已平倉部位；損益採用交易所回傳的 netProfit，不會重複扣除費用或資金費。其他市場及未平倉部位不在此範圍。']
      : provider === 'okx'
        ? ['僅匯入 OKX USDT 永續合約已完整平倉部位；忽略部分平倉紀錄。損益採用交易所回傳的 realizedPnl，不會重複扣除費用。其他產品與幣本位合約不在此範圍。']
        : ['僅匯入 KuCoin UTA USDT-M 期貨已平倉部位；損益採用交易所回傳的 realizedPnL，不會重複扣除費用或資金費。每次需輸入一個 USDT-M 合約代碼。'];
    return json({ trades, warnings });
  } catch (error) {
    return failure(error);
  }
}
