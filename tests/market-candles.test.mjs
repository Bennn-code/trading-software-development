import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const compiledModule = { exports: {} }; modules.set(name, compiledModule.exports);
  const code = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}})`)(path => path.startsWith('./') ? load(path.slice(2)) : require(path), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { historicalCandles, cryptoPair, taiwanContract, coversHolding, overlaps, QuoteError, utcTradeTime } = load('market-candles');
const { calculateMaeMfe } = load('trade-status');
const { tradeSchema } = load('validation');
const trade = (symbol, patch = {}) => ({ id: crypto.randomUUID(), market: 'crypto', currency: 'USDT', cryptoProductType: 'perpetual', symbol, side: 'long', account: 'test', timezone: 'UTC', entryTime: '2026-09-21T10:00', exitTime: '2026-09-21T10:02', entry: 100, exit: 103, quantity: 2, multiplier: 1, fees: null, funding: null, strategy: '', notes: '', imageId: null, netOverride: null, ...patch });
function context(handler, maxRequests = 24) {
  const calls = [], reserved = [];
  const ctx = { requests: 0, maxRequests, reserve: async provider => reserved.push(provider), fetch: async (url, init) => { calls.push({ url: new URL(url), init }); return handler(new URL(url), init); } };
  return { ctx, calls, reserved };
}
const start = Date.parse('2026-09-21T10:00:00Z');
const rows = [[start, '100', '104', '98'], [start + 60_000, '102', '106', '99']];
const fixture = context(() => Response.json(rows));
const first = await historicalCandles(trade('ALPHAUSDT'), {}, fixture.ctx);
assert.equal(first.provider, 'binance'); assert.equal(first.timeframe, '1m');
assert.equal(fixture.calls[0].url.hostname, 'fapi.binance.com');
assert.equal(fixture.calls[0].url.pathname, '/fapi/v1/klines');
assert.equal(fixture.calls[0].init.method, 'GET'); assert.equal(fixture.calls[0].init.redirect, 'error');
assert.deepEqual(calculateMaeMfe(trade('ALPHAUSDT'), first.candles), { mae: -4, mfe: 12, actual: 6, candleCount: 2 });
await historicalCandles(trade('ALPHAUSDT'), {}, fixture.ctx);
assert.equal(fixture.calls.length, 1, 'public reference candles reuse a bounded cache');

const spot = context(() => Response.json(rows));
await historicalCandles(trade('SPOTUSDT', { cryptoProductType: 'spot' }), {}, spot.ctx);
assert.equal(spot.calls[0].url.hostname, 'api.binance.com');
assert.equal(spot.calls[0].url.pathname, '/api/v3/klines');
assert.equal(cryptoPair(trade('BTC-USD')), null, 'USD/inverse is not rewritten to USDT');
assert.equal(cryptoPair(trade('BTCUSDT', { currency: 'USD' })), null);
assert.deepEqual(cryptoPair(trade('1000PEPE-USDT-SWAP')), { base: '1000PEPE', product: 'perpetual' });
assert.equal(cryptoPair(trade('BTCUSDT', { exchangeSource: 'bybit', cryptoProductType: null })), null, 'explicit unknown type overrides legacy source');
assert.equal(cryptoPair(trade('BTCUSDT', { exchangeSource: 'bybit', cryptoProductType: undefined })).product, 'perpetual', 'legacy field was exclusively a perpetual candle source');

const fallback = context(url => {
  if (url.hostname === 'fapi.binance.com') return Response.json([]);
  if (url.hostname === 'www.okx.com') return Response.json({ code: '0', data: [] });
  if (url.hostname === 'api.bybit.com') return Response.json({ retCode: 0, result: { list: [] } });
  return Response.json({ code: 0, data: rows });
});
const fallbackResult = await historicalCandles(trade('1000PEPEUSDT'), {}, fallback.ctx);
assert.equal(fallbackResult.provider, 'bingx');
assert.deepEqual([...new Set(fallback.calls.map(call => call.url.hostname))], ['fapi.binance.com', 'www.okx.com', 'api.bybit.com', 'open-api.bingx.com']);
assert.equal(fallback.calls.at(-1).url.searchParams.get('symbol'), '1000PEPE-USDT');
const coarse = context(url => Response.json(url.searchParams.get('interval') === '1m' ? [rows[1]] : [rows[0]]));
assert.equal((await historicalCandles(trade('COARSEUSDT'), {}, coarse.ctx)).timeframe, '5m', 'partial minute history is rejected before trying a complete coarser bucket');

const banned = context(() => new Response('rate limited', { status: 429 }));
await assert.rejects(() => historicalCandles(trade('BANUSDT'), {}, banned.ctx), error => error instanceof QuoteError && error.stop);
assert.equal(banned.calls.length, 1, 'a ban must not trigger a different venue or interval');
const limited = context(() => Response.json([]), 2);
await assert.rejects(() => historicalCandles(trade('CAPUSDT'), {}, limited.ctx), error => error instanceof QuoteError && error.stop);
assert.equal(limited.calls.length, 2, 'request caps apply before a network call');
const unknown = context(() => { throw new Error('must not fetch'); });
await assert.rejects(() => historicalCandles(trade('UNKNOWNUSDT', { cryptoProductType: null }), {}, unknown.ctx));
await assert.rejects(() => historicalCandles(trade('AAPL', { market: 'us-stocks', currency: 'USD' }), {}, unknown.ctx));
assert.equal(unknown.calls.length, 0);
assert.equal(overlaps({ time: start + 120_000, high: 2, low: 1 }, start, start + 120_000, 1), false, 'candle beginning exactly at exit is excluded');
assert.equal(coversHolding([{ time: start + 60_000, high: 2, low: 1 }], start, start + 120_000, 1), false, 'missing entry history is not silently accepted');
assert.equal(coversHolding([{ time: start, high: 2, low: 1 }, { time: start + 120_000, high: 2, low: 1 }], start, start + 180_000, 1, 'us-stocks'), false, 'a missing bar inside the same session is not silently accepted');
assert.equal(coversHolding([{ time: Date.parse('2026-09-21T03:59:00Z'), high: 2, low: 1 }, { time: Date.parse('2026-09-21T05:00:00Z'), high: 2, low: 1 }], Date.parse('2026-09-21T03:59:00Z'), Date.parse('2026-09-21T05:01:00Z'), 1, 'hk-stocks'), true, 'the Hong Kong lunch closure separates natural market sessions');
assert.equal(utcTradeTime('2026-07-01T09:30', 'America/New_York'), Date.parse('2026-07-01T13:30:00Z'));
assert.equal(utcTradeTime('2026-01-01T09:30', 'America/New_York'), Date.parse('2026-01-01T14:30:00Z'));

const key = 'fixture-key-not-a-real-credential';
const stock = context((url, init) => {
  assert.equal(url.hostname, 'api.fugle.tw'); assert.equal(init.headers['X-API-KEY'], key); assert.ok(!String(url).includes(key));
  return url.searchParams.get('timeframe') === '60' ? Response.json({ symbol: '2330', data: [{ date: '2026-09-21T09:00:00+08:00', high: 104, low: 98 }] }) : new Response(null, { status: 404 });
});
const stockResult = await historicalCandles(trade('2330', { market: 'tw-stocks', currency: 'TWD', timezone: 'Asia/Taipei', entryTime: '2026-09-21T09:30', exitTime: '2026-09-21T10:00' }), { fugle: key }, stock.ctx);
assert.equal(stockResult.timeframe, '1h'); assert.ok(!JSON.stringify(stockResult).includes(key));
assert.deepEqual(taiwanContract('TXFA6', 2025), { product: 'TXF', month: '202601' });
assert.deepEqual(taiwanContract('MXFL9', 2030), { product: 'MXF', month: '202912' });
assert.equal(taiwanContract('TXF1!', 2026), null, 'continuous contracts are not substituted');
assert.equal(taiwanContract('TXF', 2026), null, 'a root alone is insufficient');
const night = context(url => {
  assert.equal(url.searchParams.get('contractMonth'), '202601');
  assert.equal(url.searchParams.get('to'), '2026-01-07', 'night queries include the next trading date across a weekend');
  return Response.json({ product: 'TXF', contractMonth: '202601', data: url.searchParams.get('session') === 'afterhours' ? [{ contractMonth: '202601', date: '2026-01-02T23:59:00+08:00', high: 110, low: 95 }, { contractMonth: '202601', date: '2026-01-03T00:00:00+08:00', high: 112, low: 98 }] : [] });
});
const nightResult = await historicalCandles(trade('TXFA6', { market: 'tw-index-futures', currency: 'TWD', timezone: 'Asia/Taipei', entryTime: '2026-01-02T23:59', exitTime: '2026-01-03T00:01', multiplier: 200 }), { fugle: key }, night.ctx);
assert.equal(nightResult.candles.length, 2); assert.equal(night.calls.length, 2);
assert.equal(calculateMaeMfe(trade('TXFA6', { market: 'tw-index-futures', multiplier: 200 }), nightResult.candles).mae, -2000);

const overseas = context((url, init) => {
  assert.equal(url.hostname, 'api.twelvedata.com'); assert.equal(init.headers.Authorization, `apikey ${key}`); assert.ok(!String(url).includes(key));
  return Response.json(url.searchParams.get('interval') === '1day' ? { meta: { symbol: 'AAPL', currency: 'USD', mic_code: 'XNAS', exchange_timezone: 'America/New_York' }, values: [{ datetime: '2026-09-21', high: '110', low: '90' }] } : { status: 'error', code: 400 });
});
const daily = await historicalCandles(trade('AAPL', { market: 'us-stocks', currency: 'USD', timezone: 'America/New_York', entryTime: '2026-09-21T09:30', exitTime: '2026-09-21T10:00' }), { twelveData: key }, overseas.ctx);
assert.equal(daily.timeframe, '1d'); assert.equal(daily.candles[0].time, Date.parse('2026-09-21T04:00:00Z'), 'daily stock candles use exchange timezone, not forced UTC');
const wrongMarket = context(() => Response.json({ meta: { symbol: 'AAPL', currency: 'HKD', mic_code: 'XHKG', exchange_timezone: 'Asia/Hong_Kong' }, values: [] }));
await assert.rejects(() => historicalCandles(trade('AAPL', { market: 'us-stocks', currency: 'USD', timezone: 'America/New_York', entryTime: '2026-09-21T09:30', exitTime: '2026-09-21T10:00' }), { twelveData: key }, wrongMarket.ctx), error => error.stop);
assert.equal(wrongMarket.calls.length, 1);
await assert.rejects(() => historicalCandles(trade('AAPL', { market: 'us-stocks', currency: 'USD', timezone: 'America/New_York', entryTime: '2026-09-21T08:00', exitTime: '2026-09-21T09:00' }), { twelveData: key }, unknown.ctx), error => error instanceof QuoteError);
assert.equal(unknown.calls.length, 0, 'regular-session prices must not pretend to cover premarket trades');

const futures = context((url, init) => {
  assert.equal(String(url), 'https://hist.databento.com/v0/timeseries.get_range'); assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Basic ${btoa(`${key}:`)}`);
  const params = new URLSearchParams(init.body);
  assert.equal(params.get('dataset'), 'GLBX.MDP3'); assert.equal(params.get('stype_in'), 'raw_symbol'); assert.equal(params.get('symbols'), 'MNQZ6');
  assert.equal(params.get('schema'), 'ohlcv-1m'); assert.equal(params.get('pretty_px'), 'true');
  return new Response(rows.map(row => JSON.stringify({ symbol: 'MNQZ6', hd: { ts_event: new Date(row[0]).toISOString() }, high: row[2], low: row[3] })).join('\n'));
});
const futureResult = await historicalCandles(trade('MNQ', { market: 'futures', currency: 'USD', priceSymbol: 'MNQZ6', multiplier: 2 }), { databento: key }, futures.ctx);
assert.equal(futureResult.referenceSymbol, 'MNQZ6'); assert.ok(!JSON.stringify(futureResult).includes(key));
await assert.rejects(() => historicalCandles(trade('MNQ', { market: 'futures', currency: 'USD' }), { databento: key }, unknown.ctx));
const parsed = tradeSchema.parse(trade('BTCUSDT', { cryptoProductType: 'spot', priceSymbol: 'BTC/USDT' }));
assert.equal(parsed.cryptoProductType, 'spot'); assert.equal(parsed.priceSymbol, 'BTC/USDT');
assert.equal(tradeSchema.safeParse(trade('BTCUSDT', { priceSymbol: 'https://evil.example' })).success, false);
console.log('Passed ordered crypto fallback, product/pair isolation, partial history, rate stops, request caps, DST, session/contract boundaries, quote header isolation, market validation, and exact futures adapters.');


