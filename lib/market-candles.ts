import { convertWallTime } from './display-currency';
import { readBoundedText } from './bounded-response';
import { cryptoProductForTrade, type Trade } from './trades';

export type QuoteKeys = { fugle?: string; twelveData?: string; databento?: string };
type CryptoVenue = 'binance' | 'okx' | 'bybit' | 'bingx';
type QuoteProvider = CryptoVenue | 'fugle' | 'twelve-data' | 'databento';
export type PriceCandle = { time: number; high: number; low: number; end?: number };
type Context = { fetch: typeof fetch; reserve: (provider: QuoteProvider) => Promise<void>; requests: number; maxRequests: number };
export type CandleResult = { provider: string; timeframe: string; candles: PriceCandle[]; referenceSymbol: string; productType: string };
export class QuoteError extends Error {
  constructor(message: string, public stop = false, public retryable = false) { super(message); }
}
export type CryptoCursor = { providerIndex: number; intervalIndex: number };
export class QuoteBudgetError extends QuoteError {
  constructor(public cursor?: CryptoCursor) { super('本次行情查詢額度已用完，交易仍在佇列中，將接續查詢。'); }
}
class InstrumentUnavailable extends QuoteError {}
const intervals = [1, 5, 15, 30, 60, 240, 1440];
const cryptoOrder: CryptoVenue[] = ['binance', 'okx', 'bybit', 'bingx'];
const minute = 60_000;
const publicCache = new Map<string, { until: number; result: CandleResult }>();

export function utcTradeTime(value: string, timezone = 'Asia/Taipei') {
  try { return Date.parse(`${convertWallTime(value, timezone, 'UTC')}:00Z`); } catch { return NaN; }
}
export function cryptoPair(trade: Pick<Trade, 'symbol' | 'priceSymbol' | 'currency' | 'cryptoProductType' | 'exchangeSource'>) {
  const product = cryptoProductForTrade({ ...trade, market:'crypto' } as Trade);
  if (!product || trade.currency !== 'USDT') return null;
  let symbol = (trade.priceSymbol || trade.symbol).trim().toUpperCase().replace(/\.P$/, '');
  if (trade.exchangeSource === 'kucoin' && symbol.endsWith('USDTM')) symbol = symbol.slice(0, -1);
  symbol = symbol.replace(/-SWAP$/, '').replace(/[-_/]/g, '');
  // Keep contract units (e.g. 1000PEPE) intact. Never turn USD/inverse into USDT.
  if (!/^[A-Z0-9]{1,20}USDT$/.test(symbol)) return null;
  return { base: symbol.slice(0, -4), product };
}
export function quoteKeyForMarket(market: Trade['market'], keys: QuoteKeys) {
  if (market === 'crypto') return true;
  if (market === 'tw-stocks' || market === 'tw-index-futures') return !!keys.fugle;
  if (market === 'futures') return !!keys.databento;
  return !!keys.twelveData;
}
export function taiwanContract(symbol: string, year: number) {
  const explicit = /^(TXF|MXF|TMF)(\d{4})(0[1-9]|1[0-2])$/.exec(symbol);
  if (explicit) return { product: explicit[1], month: explicit[2] + explicit[3] };
  const code = /^(TXF|MXF|TMF)([A-L])(\d)$/.exec(symbol);
  if (!code) return null;
  const candidates = [Math.floor(year / 10) * 10 - 10, Math.floor(year / 10) * 10, Math.floor(year / 10) * 10 + 10].map(decade => decade + Number(code[3]));
  const contractYear = candidates.sort((a, b) => Math.abs(a - year) - Math.abs(b - year))[0];
  return { product: code[1], month: `${contractYear}${String(code[2].charCodeAt(0) - 64).padStart(2, '0')}` };
}
export function overlaps(candle: PriceCandle, start: number, end: number, minutes: number) {
  return candle.time < end && (candle.end ?? candle.time + minutes * minute) > start;
}
function validCandle(time: number, high: unknown, low: unknown, end?: number): PriceCandle[] {
  const h = Number(high), l = Number(low);
  return Number.isFinite(time) && Number.isFinite(h) && Number.isFinite(l) && h > 0 && l > 0 && h >= l ? [{ time, high: h, low: l, ...(end ? { end } : {}) }] : [];
}
function unique(candles: PriceCandle[]) { return [...new Map(candles.map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time); }
function sessionKey(time: number, market: Trade['market']) {
  const zone = market === 'us-stocks' ? 'America/New_York' : market === 'futures' ? 'America/Chicago' : market === 'cn-stocks' ? 'Asia/Shanghai' : market === 'hk-stocks' ? 'Asia/Hong_Kong' : 'Asia/Taipei';
  const local = convertWallTime(new Date(time).toISOString().slice(0, 16), 'UTC', zone), hour = Number(local.slice(11, 13));
  if (market === 'tw-index-futures' || market === 'futures') {
    const rollover = market === 'futures' ? 17 : 15;
    const day = hour < (market === 'futures' ? 16 : 5) ? dateShift(local.slice(0, 10), -1) : local.slice(0, 10);
    return `${day}|${market === 'futures' || hour < 5 || hour >= rollover ? 'night' : 'day'}`;
  }
  return `${local.slice(0, 10)}|${market === 'cn-stocks' || market === 'hk-stocks' ? hour >= 13 ? 'afternoon' : 'morning' : 'session'}`;
}
export function coversHolding(candles: PriceCandle[], start: number, end: number, minutes: number, market?: Trade['market']) {
  const sorted = unique(candles);
  if (!sorted.length || sorted[0].time > start || (sorted.at(-1)!.end ?? sorted.at(-1)!.time + minutes * minute) < end) return false;
  // Reject an unexplained gap within one market session. Closures between sessions
  // are possible; coarse/daily and cross-session results remain explicitly estimates.
  return sorted.every((candle, index) => index === 0 || candle.time <= (sorted[index - 1].end ?? sorted[index - 1].time + minutes * minute) || (!!market && (minutes >= 1440 || sessionKey(candle.time, market) !== sessionKey(sorted[index - 1].time, market))));
}
function label(minutes: number) { return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${minutes / 60}h` : '1d'; }
function localDate(time: number, zone: string) { return convertWallTime(new Date(time).toISOString().slice(0, 16), 'UTC', zone).slice(0, 10); }
function dateShift(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
function stockSession(time: number, zone: string, market: Trade['market']) {
  const local = convertWallTime(new Date(time).toISOString().slice(0, 16), 'UTC', zone), clock = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  return market === 'us-stocks' ? clock >= 570 && clock <= 960 : market === 'tw-stocks' ? clock >= 540 && clock <= 810 : market === 'hk-stocks' ? (clock >= 570 && clock <= 720) || (clock >= 780 && clock <= 960) : (clock >= 570 && clock <= 690) || (clock >= 780 && clock <= 900);
}

async function request(ctx: Context, provider: QuoteProvider, url: URL, headers: Record<string, string> = {}, body?: URLSearchParams) {
  const allowed = provider === 'binance' ? (url.hostname === 'fapi.binance.com' && url.pathname === '/fapi/v1/klines') || (url.hostname === 'api.binance.com' && url.pathname === '/api/v3/klines')
    : provider === 'okx' ? url.hostname === 'www.okx.com' && url.pathname === '/api/v5/market/history-candles'
    : provider === 'bybit' ? url.hostname === 'api.bybit.com' && url.pathname === '/v5/market/kline'
    : provider === 'bingx' ? url.hostname === 'open-api.bingx.com' && ['/openApi/spot/v2/market/kline', '/openApi/swap/v3/quote/klines'].includes(url.pathname)
    : provider === 'fugle' ? url.hostname === 'api.fugle.tw' && /^\/marketdata\/v1\.0\/(stock|futopt)\/historical\/candles\/[A-Z0-9]+$/.test(url.pathname)
    : provider === 'twelve-data' ? url.hostname === 'api.twelvedata.com' && url.pathname === '/time_series'
    : url.hostname === 'hist.databento.com' && url.pathname === '/v0/timeseries.get_range';
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || (!!body !== (provider === 'databento'))) throw new QuoteError('行情查詢端點不在唯讀白名單內。', true);
  if (ctx.requests >= ctx.maxRequests) throw new QuoteBudgetError();
  ctx.requests++;
  await ctx.reserve(provider);
  let response: Response;
  try {
    response = await ctx.fetch(url, { method: body ? 'POST' : 'GET', headers: { accept: 'application/json', ...headers, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, ...(body ? { body: body.toString() } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch { throw new QuoteError('市場行情連線失敗或逾時，請稍後再試。', false, true); }
  // Do not route around authentication, IP bans, or provider throttling.
  if ([401, 403, 418, 429].includes(response.status)) throw new QuoteError('行情供應商拒絕授權或限制查詢；已停止本次請求，請檢查金鑰、方案或稍後再試。', true);
  if (response.status === 400 && provider === 'binance') {
    const data = parseJson(await readBoundedText(response, 16_000));
    if (data && !Array.isArray(data) && String(data.code) === '-1121') throw new InstrumentUnavailable('此來源沒有相同商品。');
    return null;
  }
  if ([400, 404, 422].includes(response.status)) return null;
  if (!response.ok) throw new QuoteError('行情供應商暫時無法提供資料。', false, true);
  try { return await readBoundedText(response, 1_500_000); } catch { throw new QuoteError('行情回應過大或格式無效，請縮短分析期間。', true); }
}
function parseJson(text: string | null): Record<string, unknown> | unknown[] | null {
  if (text === null) return null;
  try { return JSON.parse(text); } catch { throw new QuoteError('行情回應格式無法辨識。', false, true); }
}

async function cryptoPage(ctx: Context, provider: CryptoVenue, base: string, product: 'spot' | 'perpetual', start: number, end: number, minutes: number, limit: number) {
  const code = label(minutes), params = new URLSearchParams();
  let host: string, path: string;
  if (provider === 'binance') {
    host = product === 'spot' ? 'api.binance.com' : 'fapi.binance.com'; path = product === 'spot' ? '/api/v3/klines' : '/fapi/v1/klines';
    params.set('symbol', `${base}USDT`); params.set('interval', code); params.set('startTime', String(start)); params.set('endTime', String(end - 1)); params.set('limit', String(limit));
  } else if (provider === 'okx') {
    host = 'www.okx.com'; path = '/api/v5/market/history-candles';
    params.set('instId', `${base}-USDT${product === 'perpetual' ? '-SWAP' : ''}`); params.set('bar', minutes === 1440 ? '1Dutc' : minutes >= 60 ? code.toUpperCase() : code); params.set('after', String(end)); params.set('limit', String(limit));
  } else if (provider === 'bybit') {
    host = 'api.bybit.com'; path = '/v5/market/kline';
    params.set('category', product === 'spot' ? 'spot' : 'linear'); params.set('symbol', `${base}USDT`); params.set('interval', minutes === 1440 ? 'D' : String(minutes)); params.set('start', String(start)); params.set('end', String(end - 1)); params.set('limit', String(limit));
  } else {
    host = 'open-api.bingx.com'; path = product === 'spot' ? '/openApi/spot/v2/market/kline' : '/openApi/swap/v3/quote/klines';
    params.set('symbol', `${base}-USDT`); params.set('interval', code); params.set('startTime', String(start)); params.set('endTime', String(end - 1)); params.set('limit', String(limit)); params.set('timestamp', String(Date.now()));
  }
  const payload = parseJson(await request(ctx, provider, new URL(`https://${host}${path}?${params}`)));
  if (!payload) return [];
  let rows: unknown[] = [];
  if (provider === 'binance') {
    if (!Array.isArray(payload) && String(payload.code) === '-1121') throw new InstrumentUnavailable('此來源沒有相同商品。');
    rows = Array.isArray(payload) ? payload : [];
  }
  else {
    const record = payload as Record<string, unknown>, status = String(provider === 'bybit' ? record.retCode : record.code);
    if (['10006', '10009', '10010', '10003', '10004', '50011', '50040'].includes(status)) throw new QuoteError('行情供應商限制查詢；已停止本次請求。', true);
    if (provider === 'okx' && status === '51001' || provider === 'bybit' && status === '10029') throw new InstrumentUnavailable('此來源沒有相同商品。');
    if (status !== '0') return [];
    rows = provider === 'bybit' ? ((record.result as { list?: unknown[] })?.list ?? []) : Array.isArray(record.data) ? record.data : [];
  }
  return rows.flatMap(row => {
    if (Array.isArray(row)) return validCandle(Number(row[0]), row[2], row[3]);
    if (!row || typeof row !== 'object') return [];
    const c = row as Record<string, unknown>, time = Number(c.time ?? c.timestamp);
    return validCandle(time < 1e12 ? time * 1000 : time, c.high, c.low);
  }).filter(c => c.time >= start && c.time < end);
}

async function cryptoCandles(ctx: Context, trade: Trade, start: number, end: number, cursor?: CryptoCursor): Promise<CandleResult | null> {
  const pair = cryptoPair(trade);
  if (!pair) throw new QuoteError('請確認加密商品是 USDT 現貨或永續合約，並填寫商品類型；不會用不同產品的價格代替。');
  for (let providerIndex = cursor?.providerIndex ?? 0; providerIndex < cryptoOrder.length; providerIndex++) {
    const provider = cryptoOrder[providerIndex];
    const limit = provider === 'okx' ? 300 : provider === 'binance' && pair.product === 'perpetual' ? 1500 : provider === 'bingx' ? 1440 : 1000;
    for (let intervalIndex = providerIndex === cursor?.providerIndex ? cursor.intervalIndex : 0; intervalIndex < intervals.length; intervalIndex++) {
      const minutes = intervals[intervalIndex];
      const step = minutes * minute, first = Math.floor(start / step) * step, last = Math.floor((end - 1) / step) * step;
      const count = Math.floor((last - first) / step) + 1;
      if (count > limit * 3) continue;
      const cacheKey = `${provider}|${pair.product}|${pair.base}|${minutes}|${first}|${last}`;
      const cached = publicCache.get(cacheKey);
      if (cached && cached.until > Date.now()) return cached.result;
      // Reserve room for this bounded interval so a continuation never discards
      // partially fetched pages. Each fresh request still has the same 32-call cap.
      if (ctx.maxRequests - ctx.requests < Math.ceil(count / limit)) throw new QuoteBudgetError({ providerIndex, intervalIndex });
      let all: PriceCandle[] = [];
      try {
        for (let page = first; page <= last; page += limit * step) {
          const values = await cryptoPage(ctx, provider, pair.base, pair.product, page, Math.min(last + step, page + limit * step), minutes, limit);
          if (!values.length) { all = []; break; }
          all.push(...values);
        }
      } catch (error) {
        if (error instanceof QuoteBudgetError) throw new QuoteBudgetError({ providerIndex, intervalIndex });
        if (error instanceof InstrumentUnavailable) break;
        if (error instanceof QuoteError && error.stop) throw error;
        if (error instanceof QuoteError) throw error; // Do not disguise transport failures as missing history.
        throw error;
      }
      all = unique(all);
      // Reject partial old history and missing buckets instead of silently understating excursions.
      if (all.length !== count || all[0].time !== first || all.at(-1)?.time !== last) continue;
      const result = { provider, timeframe: label(minutes), candles: all, referenceSymbol: `${pair.base}/USDT`, productType: pair.product };
      publicCache.set(cacheKey, { until: Date.now() + 3600000, result });
      if (publicCache.size > 250) publicCache.delete(publicCache.keys().next().value!);
      return result;
    }
  }
  return null;
}

async function fugleCandles(ctx: Context, trade: Trade, key: string, start: number, end: number): Promise<CandleResult | null> {
  const futures = trade.market === 'tw-index-futures', symbol = (trade.priceSymbol || trade.symbol).trim().toUpperCase();
  if (trade.currency !== 'TWD') throw new QuoteError('行情報價幣別與交易幣別不符，未進行估算。');
  if (!futures && (!stockSession(start, 'Asia/Taipei', trade.market) || !stockSession(end, 'Asia/Taipei', trade.market))) throw new QuoteError('目前股票行情只估算一般交易時段；盤前、盤後或非交易時段不會以日線代替。');
  const contract = futures ? taiwanContract(symbol, Number(localDate(start, 'Asia/Taipei').slice(0, 4))) : null;
  if (futures ? !contract : !/^\d{4,6}$/.test(symbol)) throw new QuoteError('請填寫正確行情商品代號；台指期須含確切合約月份，例如 TXF202610 或 TXFJ6。');
  const from = localDate(start, 'Asia/Taipei'), to = localDate(end - 1, 'Asia/Taipei');
  if (end - start > 360 * 86400000) throw new QuoteError('Fugle 單次歷史查詢須少於一年，請縮短持倉期間。');
  for (const minutes of [1, 5, 15, 30, 60, 1440]) {
    if ((end - start) / (minutes * minute) > 4000) continue;
    if (minutes !== 1440 && from < (futures ? '2017-06-01' : '2023-05-23')) continue;
    const candles: PriceCandle[] = [];
    for (const session of futures ? ['regular', 'afterhours'] : ['regular']) {
      // Date-only night-session bars do not carry enough information to resolve holiday/weekend trade dates safely.
      if (futures && minutes === 1440 && session === 'afterhours') continue;
      const path = `/marketdata/v1.0/${futures ? 'futopt' : 'stock'}/historical/candles/${contract?.product ?? symbol}`;
      const params = new URLSearchParams({ from, to: futures ? dateShift(to, 4) : to, timeframe: minutes === 1440 ? 'D' : String(minutes), fields: 'high,low', sort: 'asc' });
      if (futures) { params.set('contractMonth', contract!.month); params.set('session', session); }
      else if (minutes === 1440) params.set('adjusted', 'false');
      const payload = parseJson(await request(ctx, 'fugle', new URL(`https://api.fugle.tw${path}?${params}`), { 'X-API-KEY': key })) as { symbol?: string; product?: string; contractMonth?: string; data?: Record<string, unknown>[] } | null;
      if (!payload) continue;
      if (futures ? payload.product !== contract!.product || payload.contractMonth !== contract!.month : payload.symbol !== symbol) throw new QuoteError('行情回傳的商品與交易不相符，已停止分析。', true);
      for (const row of payload.data ?? []) {
        if (futures && row.contractMonth !== contract!.month) continue;
        const date = String(row.date), daily = minutes === 1440;
        const time = daily ? Date.parse(`${date}T${futures ? '08:45' : '00:00'}:00+08:00`) : Date.parse(date);
        candles.push(...validCandle(time, row.high, row.low, daily && futures ? Date.parse(`${date}T13:45:00+08:00`) : undefined));
      }
    }
    const included = unique(candles).filter(c => overlaps(c, start, end, minutes));
    if (coversHolding(included, start, end, minutes, trade.market)) {
      if (futures && minutes === 1440 && (localDate(start, 'Asia/Taipei') !== localDate(end - 1, 'Asia/Taipei') || start < included[0].time || end > included.at(-1)!.end!)) continue;
      return { provider: 'Fugle', timeframe: label(minutes), candles: included, referenceSymbol: symbol, productType: futures ? 'future' : 'stock' };
    }
  }
  return null;
}

async function twelveCandles(ctx: Context, trade: Trade, key: string, start: number, end: number): Promise<CandleResult | null> {
  const markets = { 'us-stocks': { country: 'United States', zone: 'America/New_York', currency: 'USD', mics: ['XNAS', 'XNYS', 'XASE', 'ARCX', 'BATS', 'IEXG'] }, 'hk-stocks': { country: 'Hong Kong', zone: 'Asia/Hong_Kong', currency: 'HKD', mics: ['XHKG'] }, 'cn-stocks': { country: 'China', zone: 'Asia/Shanghai', currency: 'CNY', mics: ['XSHG', 'XSHE', 'XBEI'] } };
  const market = markets[trade.market as keyof typeof markets];
  if (!market || trade.currency !== market.currency) throw new QuoteError('行情報價幣別與交易幣別不符，未進行估算。');
  if (!stockSession(start, market.zone, trade.market) || !stockSession(end, market.zone, trade.market)) throw new QuoteError('目前股票行情只估算一般交易時段；盤前、盤後或非交易時段不會以日線代替。');
  const symbol = (trade.priceSymbol || trade.symbol).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol)) throw new QuoteError('行情商品代號無效。');
  for (const minutes of intervals) {
    if ((end - start) / (minutes * minute) > 4000) continue;
    // Fetch one preceding interval to cover exchange/session-aligned candles containing entry.
    const params = new URLSearchParams({ symbol, country: market.country, interval: minutes < 60 ? `${minutes}min` : minutes < 1440 ? `${minutes / 60}h` : '1day', start_date: new Date(start - minutes * minute).toISOString().slice(0, 19), end_date: new Date(end).toISOString().slice(0, 19), timezone: 'UTC', order: 'asc', outputsize: '5000', adjust: 'none' });
    if (minutes === 1440) { params.set('start_date', localDate(start, market.zone)); params.set('end_date', localDate(end - 1, market.zone)); }
    const payload = parseJson(await request(ctx, 'twelve-data', new URL(`https://api.twelvedata.com/time_series?${params}`), { Authorization: `apikey ${key}` })) as { status?: string; code?: number; meta?: { symbol?: string; currency?: string; mic_code?: string; exchange_timezone?: string }; values?: Record<string, unknown>[] } | null;
    if (!payload) continue;
    if (payload.status === 'error') {
      if ([401, 403, 429].includes(payload.code ?? 0)) throw new QuoteError('行情供應商拒絕授權或限制查詢；已停止本次請求，請檢查金鑰、方案或稍後再試。', true);
      continue;
    }
    const meta = payload.meta;
    if (!meta || meta.symbol?.toUpperCase() !== symbol || meta.currency !== trade.currency || !market.mics.includes(meta.mic_code ?? '')) throw new QuoteError('行情回傳的商品、市場或幣別與交易不相符，已停止分析。', true);
    const candles = (payload.values ?? []).flatMap(row => {
      const date = String(row.datetime);
      // Daily timestamps use exchange time even when timezone=UTC was requested.
      const time = minutes === 1440 ? utcTradeTime(`${date.slice(0, 10)}T00:00`, meta.exchange_timezone || '') : Date.parse(`${date.replace(' ', 'T')}Z`);
      const dailyEnd = minutes === 1440 ? utcTradeTime(`${dateShift(date.slice(0, 10), 1)}T00:00`, meta.exchange_timezone || '') : undefined;
      return validCandle(time, row.high, row.low, dailyEnd);
    }).filter(c => overlaps(c, start, end, minutes));
    if (coversHolding(candles, start, end, minutes, trade.market)) return { provider: 'Twelve Data', timeframe: label(minutes), candles: unique(candles), referenceSymbol: symbol, productType: 'stock' };
  }
  return null;
}

async function databentoCandles(ctx: Context, trade: Trade, key: string, start: number, end: number): Promise<CandleResult | null> {
  const symbol = (trade.priceSymbol || trade.symbol).trim().toUpperCase();
  if (trade.currency !== 'USD') throw new QuoteError('行情報價幣別與交易幣別不符，未進行估算。');
  // Exact CME contracts only; reject roots and continuous contracts to avoid rollover prices.
  if (!/^[A-Z0-9]{1,5}[FGHJKMNQUVXZ]\d{1,2}$/.test(symbol)) throw new QuoteError('美股期貨行情須填寫確切 CME 合約代號，例如 MNQZ6；不會以連續合約代替。');
  for (const minutes of [1, 60, 1440]) {
    const step = minutes * minute, first = Math.floor(start / step) * step;
    if ((end - first) / step > 4000) continue;
    const params = new URLSearchParams({ dataset: 'GLBX.MDP3', symbols: symbol, stype_in: 'raw_symbol', stype_out: 'raw_symbol', schema: `ohlcv-${label(minutes)}`, start: new Date(first).toISOString(), end: new Date(end).toISOString(), encoding: 'json', compression: 'none', pretty_px: 'true', pretty_ts: 'true', map_symbols: 'true', limit: '5000' });
    const text = await request(ctx, 'databento', new URL('https://hist.databento.com/v0/timeseries.get_range'), { Authorization: `Basic ${btoa(`${key}:`)}` }, params);
    if (!text) continue;
    const candles: PriceCandle[] = [];
    try {
      for (const line of text.trim().split('\n')) {
        const row = JSON.parse(line) as { symbol?: string; hd?: { ts_event?: string }; ts_event?: string; high?: unknown; low?: unknown };
        if (row.symbol !== symbol) throw new QuoteError('行情回傳的期貨合約與交易不相符，已停止分析。', true);
        const stamp = row.hd?.ts_event ?? row.ts_event;
        candles.push(...validCandle(Date.parse(String(stamp)), row.high, row.low));
      }
    } catch (error) { if (error instanceof QuoteError) throw error; throw new QuoteError('行情回應格式無法辨識。'); }
    const included = unique(candles).filter(c => overlaps(c, start, end, minutes));
    if (coversHolding(included, start, end, minutes, trade.market)) return { provider: 'Databento · GLBX.MDP3', timeframe: label(minutes), candles: included, referenceSymbol: symbol, productType: 'future' };
  }
  return null;
}

export async function historicalCandles(trade: Trade, keys: QuoteKeys, context: Context, cursor?: CryptoCursor): Promise<CandleResult | null> {
  const start = utcTradeTime(trade.entryTime, trade.timezone), end = utcTradeTime(trade.exitTime, trade.timezone);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new QuoteError('進出場時間無效或相同；請先確認交易時間。');
  if (end > Date.now()) throw new QuoteError('出場時間在未來，歷史行情尚未產生；請確認交易日期與時區。');
  if (!quoteKeyForMarket(trade.market, keys)) throw new QuoteError('此市場需要行情金鑰與對應資料授權；請先設定本次行情金鑰。');
  if (trade.market === 'crypto') return cryptoCandles(context, trade, start, end, cursor);
  if (trade.market === 'tw-stocks' || trade.market === 'tw-index-futures') return fugleCandles(context, trade, keys.fugle!, start, end);
  if (trade.market === 'futures') return databentoCandles(context, trade, keys.databento!, start, end);
  return twelveCandles(context, trade, keys.twelveData!, start, end);
}
