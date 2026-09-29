import { z } from 'zod';
import { ApiError, db, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit, recordSecurityEvent } from '@/lib/security';
import { writableProfile } from '@/lib/profiles';
import { readBoundedText, ResponseTooLargeError } from '@/lib/bounded-response';
import { hmacSha256Base64, hmacSha256Hex, mapBingxPosition, mapBitgetPosition, mapKucoinUtaPosition, mapMexcPosition, mapOkxPosition, preserveLargeJsonPositionIds, type BingxHistoryPosition, type BitgetHistoryPosition, type KucoinUtaHistoryPosition, type MexcHistoryPosition, type OkxHistoryPosition } from '@/lib/exchange-api';

const inputSchema = z.object({
  apiKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._-]+$/),
  apiSecret: z.string().trim().min(8).max(256).regex(/^[A-Za-z0-9_+/=-]+$/),
  apiPassphrase: z.string().min(1).max(256).regex(/^[^\r\n\u0000-\u001f\u007f]+$/).optional(),
  apiKeyVersion: z.enum(['2', '3']).optional(),
  profileId: z.string().uuid().optional(),
  symbol: z.string().trim().max(30).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Params = { params: Promise<{ provider: string }> };
type OkxResponse = { code: string; data?: OkxHistoryPosition[] };
type BitgetResponse = { code: string; data?: { list?: BitgetHistoryPosition[]; endId?: string } };
type KucoinResponse = { code: string; data?: { items?: KucoinUtaHistoryPosition[]; lastId?: string | number } };
type BingxResponse = { code: number; data?: BingxHistoryPosition[] | { list?: BingxHistoryPosition[]; total?: number } };
type MexcResponse = { success: boolean; code: number; data?: MexcHistoryPosition[] | { resultList?: MexcHistoryPosition[]; totalPage?: number } };
const DAY = 86_400_000;
const APPROVED_API_HOSTS = new Set(['www.okx.com', 'api.bitget.com', 'api.kucoin.com', 'open-api.bingx.com', 'contract.mexc.com']);

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

async function fetchJson<T>(url: string, headers: HeadersInit, preservePositionIds = false): Promise<T> {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || !APPROVED_API_HOSTS.has(endpoint.hostname)) throw new ApiError('交易所 API 連線目標無效。', 502);
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000), headers });
  } catch {
    throw new ApiError('交易所暫時無法讀取資料，請稍後重試。', 502);
  }
  if (!response.ok) throw new ApiError(response.status === 429 ? '交易所查詢次數已達上限，請稍後重試。' : '交易所暫時無法讀取資料，請稍後重試。', response.status === 429 ? 429 : 502);
  try {
    const body = await readBoundedText(response, 2 * 1024 * 1024);
    return JSON.parse(preservePositionIds ? preserveLargeJsonPositionIds(body) : body) as T;
  } catch (error) {
    if (error instanceof ResponseTooLargeError) throw new ApiError('交易所回傳資料過大，請縮短日期區間後再試。', 502);
    throw new ApiError('API 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  }
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

async function requestBingxPage(apiKey: string, apiSecret: string, symbol: string, start: number, end: number, pageIndex: number): Promise<BingxHistoryPosition[]> {
  const path = '/openApi/swap/v1/trade/positionHistory';
  const values = { currency: 'USDT', endTs: String(end), pageIndex: String(pageIndex), pageSize: '100', startTs: String(start), symbol, timestamp: String(Date.now()) };
  const canonical = Object.entries(values).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  const signature = await hmacSha256Hex(apiSecret, canonical);
  const data = await fetchJson<BingxResponse>(`https://open-api.bingx.com${path}?${canonical}&signature=${signature}`, {
    'X-BX-APIKEY': apiKey, 'X-SOURCE-KEY': 'BX-AI-SKILL',
  }, true);
  if (data.code !== 0) throw new ApiError('BingX API Key、簽章或唯讀查詢權限不正確。', 400);
  const rows = Array.isArray(data.data) ? data.data : data.data?.list;
  if (!Array.isArray(rows)) throw new ApiError('BingX 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  return rows;
}

async function requestMexcPage(apiKey: string, apiSecret: string, symbol: string, pageNum: number): Promise<MexcHistoryPosition[]> {
  const path = '/api/v1/private/position/list/history_positions';
  const values: Record<string, string> = { page_num: String(pageNum), page_size: '100' };
  if (symbol) values.symbol = symbol;
  const canonical = Object.entries(values).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const requestTime = String(Date.now());
  const signature = await hmacSha256Hex(apiSecret, `${apiKey}${requestTime}${canonical}`);
  const data = await fetchJson<MexcResponse>(`https://contract.mexc.com${path}?${canonical}`, {
    ApiKey: apiKey, 'Request-Time': requestTime, Signature: signature, 'Content-Type': 'application/json',
  });
  if (Number(data.code) !== 0) throw new ApiError('MEXC API Key、簽章或 Trade Read 權限不正確。', 400);
  const rows = Array.isArray(data.data) ? data.data : data.data?.resultList;
  if (!Array.isArray(rows)) throw new ApiError('MEXC 回傳資料格式無法辨識；沒有匯入任何資料。', 502);
  return rows;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!['bitget', 'okx', 'kucoin', 'bingx', 'mexc'].includes(provider)) throw new ApiError('此 API 來源尚未開放連線。', 404);
    const owner = await identity(request, true);
    await enforceRateLimit(request, { scope: `${provider}-api-import`, limit: 5, ipLimit: 20, windowSeconds: 3600, subject: owner });
    const body = await readJson(request, 5000);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('請填寫有效的 API Key、Secret 和日期。');
    const profileId = await writableProfile(owner, parsed.data.profileId);
    const { apiKey, apiSecret, apiPassphrase, apiKeyVersion, symbol, startDate, endDate } = parsed.data;
    if (['bitget', 'okx', 'kucoin'].includes(provider) && !apiPassphrase) throw new ApiError('此交易所需要 API Passphrase。');
    const passphrase = apiPassphrase ?? '';
    const start = dateMs(startDate), endExclusive = dateMs(endDate) + DAY;
    if (!Number.isFinite(start) || !Number.isFinite(endExclusive) || start >= endExclusive || endExclusive > Date.now() + DAY) throw new ApiError('請確認日期順序，結束日期不可晚於今天。');
    if (provider !== 'mexc' && start < oldestSupportedDate()) throw new ApiError('交易所只保留最近三個月的已平倉資料，請縮短日期區間。');
    if (provider === 'kucoin' && !/^[A-Z0-9]{4,20}USDTM$/.test(symbol ?? '')) throw new ApiError('請輸入 USDT-M 合約代碼，例如 XBTUSDTM。');
    if (provider === 'bingx' && !/^[A-Z0-9]{2,20}-USDT$/.test(symbol ?? '')) throw new ApiError('請輸入 USDT 永續合約代碼，例如 BTC-USDT。');
    if (provider === 'mexc' && symbol && !/^[A-Z0-9]{2,20}_USDT$/.test(symbol)) throw new ApiError('請輸入 MEXC USDT 合約代碼，例如 BTC_USDT。');

    const sourceRows: (BitgetHistoryPosition | OkxHistoryPosition | KucoinUtaHistoryPosition | BingxHistoryPosition | MexcHistoryPosition)[] = [];
    if (provider === 'bitget') {
      let cursor = '', pageCount = 0;
      do {
        const page = await requestBitgetPage(apiKey, apiSecret, passphrase, start, endExclusive - 1, cursor);
        sourceRows.push(...page.rows);
        cursor = page.rows.length === 100 ? page.next : '';
        pageCount++;
        if (sourceRows.length > 2000 || pageCount > 20) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
      } while (cursor);
    } else if (provider === 'okx') {
      let cursor = String(endExclusive), pageCount = 0;
      const seenCursors = new Set<string>();
      while (pageCount < 20) {
        const page = await requestOkxPage(apiKey, apiSecret, passphrase, cursor);
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
    } else if (provider === 'kucoin') {
      const windowSize = 7 * DAY;
      for (let windowStart = start; windowStart < endExclusive; windowStart += windowSize) {
        const windowEnd = Math.min(windowStart + windowSize - 1, endExclusive - 1);
        let cursor = '', pageCount = 0;
        do {
          const page = await requestKucoinPage(apiKey, apiSecret, passphrase, apiKeyVersion ?? '3', symbol!, windowStart, windowEnd, cursor);
          sourceRows.push(...page.rows);
          cursor = page.rows.length === 100 ? page.next : '';
          pageCount++;
          if (sourceRows.length > 2000 || pageCount > 20) throw new ApiError('查詢頁數過多，請縮短日期區間後分批匯入。', 413);
        } while (cursor);
      }
    } else if (provider === 'bingx') {
      let pageIndex = 1;
      while (pageIndex <= 20) {
        const rows = await requestBingxPage(apiKey, apiSecret, symbol!, start, endExclusive - 1, pageIndex);
        sourceRows.push(...rows);
        if (sourceRows.length > 2000) throw new ApiError('查詢筆數過多，請縮短日期區間後分批匯入。', 413);
        if (rows.length < 100) break;
        pageIndex++;
      }
      if (pageIndex > 20 && sourceRows.length >= 2000) throw new ApiError('查詢筆數超過 2,000 筆，請縮短日期區間後分批匯入。', 413);
    } else {
      for (let pageNum = 1; pageNum <= 21; pageNum++) {
        const rows = await requestMexcPage(apiKey, apiSecret, symbol ?? '', pageNum);
        if (pageNum === 21) {
          if (rows.length) throw new ApiError('MEXC 近期歷史持倉超過 2,000 筆；請在交易所縮小商品範圍或改用 CSV 匯入。', 413);
          break;
        }
        sourceRows.push(...rows);
        if (rows.length < 100) break;
      }
    }

    const inRange = sourceRows.filter(row => {
      const close = provider === 'bitget' ? Number((row as BitgetHistoryPosition).utime)
        : provider === 'okx' ? Number((row as OkxHistoryPosition).uTime)
          : provider === 'kucoin' ? Number((row as KucoinUtaHistoryPosition).closingTime) / 1_000_000
            : provider === 'bingx' ? Number((row as BingxHistoryPosition).updateTime) : Number((row as MexcHistoryPosition).updateTime);
      return Number.isFinite(close) && close >= start && close < endExclusive;
    });
    const unique = new Map<string, (typeof inRange)[number]>();
    for (const row of inRange) {
      const id = provider === 'bitget' ? JSON.stringify([(row as BitgetHistoryPosition).positionId, (row as BitgetHistoryPosition).ctime, (row as BitgetHistoryPosition).utime, (row as BitgetHistoryPosition).closeTotalPos])
        : provider === 'okx' ? JSON.stringify([(row as OkxHistoryPosition).posId, (row as OkxHistoryPosition).cTime, (row as OkxHistoryPosition).uTime])
          : provider === 'kucoin' ? (row as KucoinUtaHistoryPosition).closeId
            : provider === 'bingx' ? String((row as BingxHistoryPosition).positionId) : String((row as MexcHistoryPosition).positionId);
      unique.set(id, row);
    }
    if (unique.size > 50) throw new ApiError('這次查到超過 50 筆；請縮短日期區間後分批匯入。', 413);

    const preference = await db().prepare('SELECT timezone FROM account_preferences WHERE user_id = ?').bind(owner).first<{ timezone: string }>();
    const timezone = preference?.timezone || 'Asia/Taipei';
    const ordered = [...unique.values()];
    ordered.sort((left, right) => {
      const time = (row: typeof left) => provider === 'bitget' ? Number((row as BitgetHistoryPosition).utime)
        : provider === 'okx' ? Number((row as OkxHistoryPosition).uTime)
          : provider === 'kucoin' ? Number((row as KucoinUtaHistoryPosition).closingTime)
            : provider === 'bingx' ? Number((row as BingxHistoryPosition).updateTime) : Number((row as MexcHistoryPosition).updateTime);
      return time(left) - time(right);
    });
    const profileScope = `${owner}:${profileId}`;
    const mapped = await Promise.all(ordered.map(row => provider === 'bitget' ? mapBitgetPosition(row as BitgetHistoryPosition, profileScope, timezone)
      : provider === 'okx' ? mapOkxPosition(row as OkxHistoryPosition, profileScope, timezone)
        : provider === 'kucoin' ? mapKucoinUtaPosition(row as KucoinUtaHistoryPosition, profileScope, timezone)
          : provider === 'bingx' ? mapBingxPosition(row as BingxHistoryPosition, profileScope, timezone)
            : mapMexcPosition(row as MexcHistoryPosition, profileScope, timezone)));
    const trades = mapped.filter((trade): trade is NonNullable<typeof trade> => trade !== null);
    await recordSecurityEvent(request, 'api_trade_imported', owner, { provider, count: trades.length, startDate, endDate });
    const warnings = provider === 'bitget'
      ? ['僅匯入 Bitget USDT-M 期貨已平倉部位；損益採用交易所回傳的 netProfit，不會重複扣除費用或資金費。其他市場及未平倉部位不在此範圍。']
      : provider === 'okx'
        ? ['僅匯入 OKX USDT 永續合約已完整平倉部位；忽略部分平倉紀錄。損益採用交易所回傳的 realizedPnl，不會重複扣除費用。其他產品與幣本位合約不在此範圍。']
        : provider === 'kucoin'
          ? ['僅匯入 KuCoin UTA USDT-M 期貨已平倉部位；損益採用交易所回傳的 realizedPnL，不會重複扣除費用或資金費。每次需輸入一個 USDT-M 合約代碼。']
          : provider === 'bingx'
            ? ['僅匯入 BingX USDT 永續合約已完整平倉部位；損益採用交易所回傳的 netProfit。每次需指定一個合約代碼；其他產品與未平倉部位不在此範圍。']
            : ['僅匯入 MEXC USDT 合約已完整平倉部位；損益採用交易所回傳的 realised，持倉歷史端點未提供逐筆交易手續費，本站不會自行推算。歷史查詢最多掃描近期 2,000 筆，再依日期篩選；其他市場及未平倉部位不在此範圍。'];
    return json({ trades, warnings });
  } catch (error) {
    return failure(error);
  }
}
