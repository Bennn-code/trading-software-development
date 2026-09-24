import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import ts from 'typescript';

globalThis.crypto ??= webcrypto;
const source = fs.readFileSync('lib/exchange-api.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mockRequire = name => name === './screenshot-import'
  ? { stableImportId: async (owner, value) => `${owner}:${value}` }
  : { localTime: value => value.toISOString().slice(0, 19) };
const apiModule = { exports: {} };
new Function('require', 'exports', 'module', compiled)(mockRequire, apiModule.exports, apiModule);
const { hmacSha256Base64, hmacSha256Hex, mapBitgetPosition, mapOkxPosition, mapKucoinUtaPosition } = apiModule.exports;

const message = 'fixed read-only request';
assert.equal(await hmacSha256Hex('secret', message), createHmac('sha256', 'secret').update(message).digest('hex'));
assert.equal(await hmacSha256Base64('secret', message), createHmac('sha256', 'secret').update(message).digest('base64'));

const bitget = await mapBitgetPosition({
  positionId: 'bg-1', symbol: 'BTCUSDT', marginCoin: 'USDT', holdSide: 'long', openAvgPrice: '60000', closeAvgPrice: '61000',
  openTotalPos: '0.1', closeTotalPos: '0.1', netProfit: '99.5', openFee: '-0.1', closeFee: '-0.2', totalFunding: '0.05', ctime: '1700000000000', utime: '1700003600000',
}, 'owner', 'Asia/Taipei');
assert.equal(bitget.netOverride, 99.5);
assert.equal(bitget.fees, null);
assert.equal(bitget.commission, 0.30000000000000004);
assert.equal(bitget.side, 'long');
assert.equal(await mapBitgetPosition({ symbol: 'BTCUSDT', marginCoin: 'BTC', holdSide: 'long', openAvgPrice: '1', closeAvgPrice: '1', openTotalPos: '1', closeTotalPos: '1', netProfit: '1', ctime: '1700000000000', utime: '1700003600000' }, 'owner', 'UTC'), null);

const okx = await mapOkxPosition({
  instId: 'BTC-USDT-SWAP', instType: 'SWAP', ccy: 'USDT', direction: 'short', type: '2', posId: 'okx-1', cTime: '1700000000000', uTime: '1700003600000',
  openAvgPx: '60000', closeAvgPx: '59000', closeTotalPos: '1', realizedPnl: '12.5', fee: '-0.5', fundingFee: '0.2', liqPenalty: '0',
}, 'owner', 'UTC');
assert.equal(okx.netOverride, 12.5);
assert.equal(okx.side, 'short');
assert.equal(await mapOkxPosition({ instId: 'BTC-USDT-SWAP', instType: 'SWAP', ccy: 'USDT', direction: 'long', type: '1', posId: 'partial', cTime: '1700000000000', uTime: '1700003600000', openAvgPx: '1', closeAvgPx: '1', closeTotalPos: '1', realizedPnl: '1' }, 'owner', 'UTC'), null);

const kucoin = await mapKucoinUtaPosition({
  symbol: 'XBTUSDTM', closeId: 'kc-1', side: 'LONG', entryPrice: '60000', avgClosePrice: '61000', closePrice: '61000', maxSize: '1',
  realizedPnL: '9.5', fee: '0.1', tax: '0', fundingFee: '0.2', creationTime: '1700000000000000000', closingTime: '1700003600000000000',
}, 'owner', 'UTC');
assert.equal(kucoin.netOverride, 9.5);
assert.equal(kucoin.entryTime, '2023-11-14T22:13:20');
assert.equal(kucoin.exitTime, '2023-11-14T23:13:20');
assert.equal(kucoin.side, 'long');

const route = fs.readFileSync('app/api/imports/api/[provider]/route.ts', 'utf8');
assert.match(route, /\['bitget', 'okx', 'kucoin'\]/);
assert.match(route, /fetch\(url,\s*\{\s*method:\s*'GET'/);
for (const host of ['https:\/\/api.bitget.com', 'https:\/\/www.okx.com', 'https:\/\/api.kucoin.com']) assert.ok(route.includes(host), `missing fixed provider host ${host}`);
assert.match(route, /redirect:\s*'error'/);
assert.match(route, /AbortSignal\.timeout\(8000\)/);
assert.match(route, /enforceRateLimit\(request,\s*\{\s*scope:\s*`\$\{provider\}-api-import`,\s*limit:\s*5/);
assert.doesNotMatch(route, /apiSecret[^\n]{0,120}(?:INSERT|UPDATE|DELETE)|(?:INSERT|UPDATE|DELETE)[^\n]{0,120}apiSecret/i);
assert.doesNotMatch(route, /fetch\([^\n]*(?:body|apiKey|apiSecret)/i, 'outbound exchange fetches must use fixed GET URLs, not user-provided URLs or request bodies');

console.log('Passed HMAC signing, position mapping, closed-position filters, and fixed read-only provider-route checks.');
