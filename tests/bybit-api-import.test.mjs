import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../work/', import.meta.url));
for (const name of ['trades', 'screenshot-import', 'validation', 'bybit-api']) {
  let code = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replaceAll('"./trades"', '"./trades.cjs"').replaceAll('"./screenshot-import"', '"./screenshot-import.cjs"');
  fs.writeFileSync(`work/${name}.cjs`, code);
}
const { bybitHmacSha256, mapBybitClosedOption, mapBybitClosedPnl } = require('./bybit-api.cjs');
const { tradeSchema } = require('./validation.cjs');
const { pnl } = require('./trades.cjs');

assert.equal(
  await bybitHmacSha256('key', 'The quick brown fox jumps over the lazy dog'),
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  'Bybit HMAC must use HMAC-SHA256 and lower-case hexadecimal output',
);

const source = {
  symbol: 'BTC-12JUN25-104019-C-USDT', side: 'Buy', totalOpenFee: '0.10', deliveryFee: '0.02', totalCloseFee: '0.08',
  qty: '0.02', closeTime: Date.parse('2026-09-10T02:00:00.000Z'), avgExitPrice: '4300.5',
  openTime: Date.parse('2026-09-10T01:00:00.000Z'), avgEntryPrice: '4200.25', totalPnl: '1.25',
};
const trade = await mapBybitClosedOption(source, 'test-user', 'Asia/Taipei');
assert.ok(trade);
assert.equal(trade.side, 'long');
assert.equal(trade.entryTime, '2026-09-10T09:00');
assert.equal(trade.exitTime, '2026-09-10T10:00');
assert.equal(trade.currency, 'USDT');
assert.equal(trade.commission, 0.18);
assert.equal(trade.fees, 0.02);
assert.equal(trade.netOverride, 1.25);
assert.equal(tradeSchema.parse(trade).netOverride, 1.25);
assert.equal(pnl(trade), 1.25, 'the exchange net P&L must not have fees deducted twice');
assert.equal((await mapBybitClosedOption(source, 'test-user', 'Asia/Taipei')).id, trade.id, 're-import IDs must stay stable');
assert.equal(await mapBybitClosedOption({ ...source, symbol: source.symbol.replace('-USDT', '-USDC') }, 'test-user', 'UTC'), null, 'unsupported settlement currencies are skipped');
assert.equal(await mapBybitClosedOption({ ...source, closeTime: source.openTime - 1 }, 'test-user', 'UTC'), null, 'invalid position time order is skipped');
assert.equal(await mapBybitClosedOption({ ...source, totalPnl: 'not-a-number' }, 'test-user', 'UTC'), null, 'invalid P&L rows are skipped');

const closedPosition = {
  symbol: 'BTCUSDT', side: 'Sell', qty: '0.2', closedSize: '0.2', avgEntryPrice: '60000', avgExitPrice: '61000',
  closedPnl: '8.25', openFee: '0.10', closeFee: '0.12', createdTime: String(Date.parse('2026-09-11T02:00:00.000Z')),
  updatedTime: String(Date.parse('2026-09-11T02:00:01.000Z')), orderId: 'close-order-1', execType: 'Trade',
};
const linearTrade = await mapBybitClosedPnl(closedPosition, 'test-user', 'Asia/Taipei');
assert.ok(linearTrade);
assert.equal(linearTrade.side, 'long', 'a Sell closing order closes a long position');
assert.equal(linearTrade.currency, 'USDT');
assert.equal(linearTrade.entryTime, '2026-09-11T10:00');
assert.equal(linearTrade.exitTime, linearTrade.entryTime, 'the closed-PnL endpoint does not provide original position open time');
assert.equal(linearTrade.commission, 0.22);
assert.equal(linearTrade.netOverride, 8.25);
assert.equal(pnl(linearTrade), 8.25, 'exchange-reported closed P&L must not have fees deducted twice');
assert.equal(tradeSchema.parse(linearTrade).currency, 'USDT');
assert.equal((await mapBybitClosedPnl(closedPosition, 'test-user', 'Asia/Taipei')).id, linearTrade.id, 'linear re-import IDs must stay stable');
assert.equal(await mapBybitClosedPnl({ ...closedPosition, symbol: 'BTCUSDC' }, 'test-user', 'UTC'), null, 'unsupported settlement currencies are skipped');
assert.equal(await mapBybitClosedPnl({ ...closedPosition, execType: 'SessionSettlePnL' }, 'test-user', 'UTC'), null, 'settlement events are not mapped as closed trades');
assert.equal(await mapBybitClosedPnl({ ...closedPosition, closedPnl: 'not-a-number' }, 'test-user', 'UTC'), null, 'invalid closed P&L rows are skipped');

console.log('Passed Bybit HMAC, option and USDT-linear mapping, timezone conversion, exchange P&L, stable IDs, and invalid-row guards.');
