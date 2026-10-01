import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// An isolated directory avoids the other test suites' shared transpilation files.
const outputDirectory = path.resolve('work/trade-performance-tests');
fs.mkdirSync(outputDirectory, { recursive: true });
for (const name of ['trades', 'display-currency', 'trade-status', 'trade-performance']) {
  const source = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/require\("\.\/([^"/]+)"\)/g, 'require("./$1.cjs")');
  fs.writeFileSync(path.join(outputDirectory, `${name}.cjs`), source);
}
const require = createRequire(path.join(outputDirectory, 'runner.cjs'));
const { settledPerformanceTrades, realizedDrawdownStats, strategyPerformanceStats, productDirectionStats, netPnlDistributionStats } = require('./trade-performance.cjs');
const { pnl } = require('./trades.cjs');

const trade = (id, netOverride, changes = {}) => ({
  id, market: 'crypto', currency: 'USDT', symbol: 'BTCUSDT', side: 'long', account: 'test',
  entryTime: '2026-09-21T09:00', exitTime: '2026-09-21T10:00', timezone: 'Asia/Taipei',
  entry: 100, exit: 100, quantity: 1, multiplier: 1, netOverride, profitBasis: 'net',
  fees: null, funding: null, strategy: 'MSS', notes: '', imageId: null, ...changes,
});
const taipei = value => Date.parse(`${value}:00+08:00`);
const asOf = taipei('2026-09-21T20:00');
for (const calculator of [strategyPerformanceStats, productDirectionStats, netPnlDistributionStats]) assert.deepEqual(calculator([]), []);
assert.deepEqual(realizedDrawdownStats([], asOf), []);
assert.throws(() => realizedDrawdownStats([], NaN), RangeError);

const sequence = [
  trade('first', 100, { exitTime: '2026-09-21T10:00' }),
  trade('fall', -40, { exitTime: '2026-09-21T11:00' }),
  trade('low', -20, { exitTime: '2026-09-21T12:00' }),
  trade('recover', 60, { exitTime: '2026-09-21T14:00' }),
  trade('new-high', 20, { exitTime: '2026-09-21T15:00' }),
  trade('unrecovered', -10, { exitTime: '2026-09-21T16:00' }),
];
const recovery = realizedDrawdownStats(sequence.toReversed(), asOf)[0];
assert.equal(recovery.maxDrawdown, 60);
assert.equal(recovery.currentDrawdown, 10);
assert.equal(recovery.maxRecoveryMinutes, 240, 'completed recovery starts at the previous peak');
assert.equal(recovery.currentRecoveryStart, taipei('2026-09-21T15:00'));
assert.equal(recovery.currentRecoveryMinutes, 300, 'ongoing recovery extends to the explicit cutoff, not the last exit');
assert.deepEqual(realizedDrawdownStats(sequence, asOf), realizedDrawdownStats(sequence.toReversed(), asOf), 'input order does not affect chronological statistics');
assert.equal(realizedDrawdownStats(sequence, taipei('2026-09-21T16:00'))[0].currentRecoveryMinutes, 60);
const initialLoss = realizedDrawdownStats([trade('loss', -25)], asOf)[0];
assert.equal(initialLoss.maxDrawdown, 25);
assert.equal(initialLoss.currentRecoveryStart, taipei('2026-09-21T09:00'), 'initial zero peak uses the first entry, consistently with existing recovery stats');
assert.equal(initialLoss.currentRecoveryMinutes, 660);
assert.equal(initialLoss.maxRecoveryMinutes, null, 'an unrecovered episode is not counted as a completed recovery');
const flat = realizedDrawdownStats([trade('flat', 0), trade('positive', 4, { exitTime: '2026-09-21T11:00' })], asOf)[0];
assert.deepEqual([flat.maxDrawdown, flat.currentDrawdown, flat.currentRecoveryMinutes, flat.maxRecoveryMinutes], [0, 0, null, null]);
const sameExit = [trade('a-loss', -20), trade('z-profit', 20)];
assert.equal(realizedDrawdownStats(sameExit, asOf)[0].maxDrawdown, 0, 'same settlement time is a net batch, so id ordering cannot create a fake drawdown');
assert.equal(netPnlDistributionStats(sameExit)[0].count, 2, 'distribution preserves individual trades even when settlement is simultaneous');
const crossZones = [
  trade('earlier-utc', 100, { timezone: 'America/New_York', exitTime: '2026-09-20T21:00' }), // 01:00 UTC
  trade('later-utc', -30, { timezone: 'Asia/Taipei', exitTime: '2026-09-21T10:00' }), // 02:00 UTC
];
assert.equal(realizedDrawdownStats(crossZones, asOf)[0].currentDrawdown, 30, 'saved source timezones determine chronological exit order');
const secondResolution = [trade('a', 20, { exitTime: '2026-09-21T10:00:30' }), trade('z', -10, { exitTime: '2026-09-21T10:00:31' })];
assert.equal(realizedDrawdownStats(secondResolution, asOf)[0].maxDrawdown, 10, 'distinct exit seconds are not merged into minute buckets');
const isoTimes = [trade('i', 100, { exitTime: '2026-09-21T02:00:00Z' }), trade('j', -20, { exitTime: '2026-09-21T10:01:00+08:00' })];
assert.equal(realizedDrawdownStats(isoTimes, asOf)[0].currentDrawdown, 20);
assert.deepEqual(realizedDrawdownStats([trade('invalid-date', 1, { exitTime: '2026-02-30T10:00' })], asOf), []);
assert.deepEqual(realizedDrawdownStats([trade('invalid-zone', 1, { timezone: 'Invalid/Zone' })], asOf), []);
assert.deepEqual(realizedDrawdownStats([trade('future', 1, { exitTime: '2026-10-02T10:00' })], asOf), [], 'future settlements do not appear before asOf');
const cutoffTrades = [trade('already-closed', 4), trade('future', 100, { exitTime: '2026-10-02T10:00' }), trade('unknown-exit', 100, { exitTime: '' }), trade('impossible-date', 100, { exitTime: '2026-02-30T10:00' })];
assert.deepEqual(settledPerformanceTrades(cutoffTrades, asOf), [cutoffTrades[0]], 'conversion receives only valid settlements, so future and unknown trades cannot inflate omitted-FX counts');
assert.deepEqual(settledPerformanceTrades([], asOf), []);
assert.throws(() => settledPerformanceTrades(cutoffTrades, Infinity), RangeError);
const settlementBoundary = Date.parse('2026-09-21T02:00:30.125Z');
const boundaryTrades = [
  trade('at-taipei-cutoff', 1, { exitTime: '2026-09-21T10:00:30.125' }),
  trade('before-new-york-cutoff', 1, { timezone: 'America/New_York', exitTime: '2026-09-20T22:00:30.124' }),
  trade('explicit-offset-at-cutoff', 1, { timezone: 'Invalid/Zone', exitTime: '2026-09-21T04:00:30.125+02:00' }),
  trade('after-cutoff', 1, { exitTime: '2026-09-21T10:00:30.126' }),
  trade('invalid-zone', 1, { timezone: 'Invalid/Zone' }),
  trade('nonexistent-dst-time', 1, { timezone: 'America/New_York', exitTime: '2026-03-08T02:30' }),
];
const boundarySnapshot = structuredClone(boundaryTrades);
const settledBoundary = settledPerformanceTrades(boundaryTrades, settlementBoundary);
assert.deepEqual(settledBoundary.map(value => value.id), boundaryTrades.slice(0, 3).map(value => value.id), 'saved timezones and ISO offsets share an inclusive millisecond cutoff; nonexistent wall times are rejected');
assert.ok(settledBoundary.every((value, index) => value === boundaryTrades[index]), 'settlement filtering preserves the original objects and order for later conversion copies');
assert.deepEqual(boundaryTrades, boundarySnapshot, 'settlement filtering cannot rewrite saved times or monetary inputs');
assert.equal(strategyPerformanceStats(cutoffTrades, { asOf })[0].count, 1, 'strategy performance requires a valid settlement before the explicit cutoff');
assert.equal(strategyPerformanceStats(cutoffTrades, { asOf })[0].rows[0].net, 4);
assert.equal(productDirectionStats(cutoffTrades, { asOf })[0].long.count, 1);
assert.equal(productDirectionStats(cutoffTrades, { asOf })[0].long.meanNet, 4);
assert.equal(netPnlDistributionStats(cutoffTrades, { asOf })[0].count, 1);
assert.equal(netPnlDistributionStats(cutoffTrades, { asOf })[0].mean, 4);
for (const calculator of [strategyPerformanceStats, productDirectionStats, netPnlDistributionStats]) {
  assert.throws(() => calculator(cutoffTrades, { asOf: NaN }), RangeError);
  assert.deepEqual(calculator(cutoffTrades.slice(1), { asOf }), [], 'all future or unknown exit dates produce no samples');
}

const strategyTrades = [
  trade('multi', 30, { strategy: 'mss、MSS、ＭＳＳ;突破策略' }),
  trade('loss', -12, { strategy: 'Mss、趋势' }),
  trade('breakeven', 0, { strategy: 'MSS' }),
  trade('different', 9, { strategy: '突破回測' }),
  trade('alias', 3, { strategy: '止损策略、停損' }),
  trade('no-strategy', 999, { strategy: '' }),
];
const strategy = strategyPerformanceStats(strategyTrades)[0];
const mss = strategy.rows.find(row => row.name === 'MSS');
assert.deepEqual([mss.count, mss.wins, mss.net, mss.expectancy], [3, 1, 18, 6]);
assert.ok(Math.abs(mss.winRate - 100 / 3) < 1e-10, 'breakeven trades are in the denominator but are not wins');
assert.equal(strategy.overlappingTradeCount, 2, 'only distinct strategies create overlap, not repeated aliases');
assert.equal(strategy.count, 5, 'a blank strategy does not invent a performance row');
assert.equal(strategy.rows.find(row => row.name === '突破').net, 30, 'the full outcome is attributed to every tagged strategy');
assert.equal(strategy.rows.find(row => row.name === '突破回測').net, 9, 'different modifiers are not merged by fuzzy matching');
assert.equal(strategy.rows.find(row => row.name === '停損').count, 1);
assert.deepEqual(strategyPerformanceStats([trade('empty', 1, { strategy: '' })]), []);

const mixed = [trade('usdt', 10), trade('usd-crypto', 20, { currency: 'USD' }), trade('usd-stocks', -8, { market: 'us-stocks', currency: 'USD' })];
for (const calculator of [strategyPerformanceStats, productDirectionStats, netPnlDistributionStats]) {
  assert.equal(calculator(mixed).length, 3, 'market and currency are both separate by default');
  const overall = calculator(mixed, { combineMarkets: true });
  assert.equal(overall.length, 2, 'overall never sums USD and USDT');
  assert.ok(overall.every(group => group.market === 'all'));
}
assert.equal(realizedDrawdownStats(mixed, asOf).length, 3);
assert.equal(realizedDrawdownStats(mixed, asOf, { combineMarkets: true }).length, 2);
const converted = mixed.map(value => ({ ...value, currency: 'USD', netOverride: pnl(value) * (value.currency === 'USDT' ? 0.99 : 1) }));
const convertedMss = strategyPerformanceStats(converted, { combineMarkets: true })[0].rows[0];
assert.equal(convertedMss.net, 21.9);
assert.equal(convertedMss.expectancy, 7.3, 'overall expectancy averages converted individual outcomes, not group averages');
const smallConversion = [0.004, 0.004, 0.004].map((net, index) => trade(`small-${index}`, net, { currency: 'USD' }));
const precisionOptions = { combineMarkets: true, readNetOverride: true };
assert.equal(strategyPerformanceStats(smallConversion)[0].rows[0].expectancy, 0, 'ordinary saved P&L continues to use the existing cent-rounded pnl calculation');
const preciseStrategy = strategyPerformanceStats(smallConversion, precisionOptions)[0].rows[0];
assert.equal(preciseStrategy.wins, 3);
assert.equal(preciseStrategy.net, 0.01, 'converted small amounts accumulate before the displayed total is rounded');
assert.equal(preciseStrategy.expectancy, 0.004, 'expectancy preserves full conversion precision before averaging');
assert.equal(productDirectionStats(smallConversion, precisionOptions)[0].long.meanNet, 0.004);
assert.equal(netPnlDistributionStats(smallConversion, precisionOptions)[0].mean, 0.004);
assert.equal(netPnlDistributionStats(smallConversion, precisionOptions)[0].maxProfit, 0.004);
const smallConvertedLosses = smallConversion.map((value, index) => ({ ...value, netOverride: -0.004, exitTime: `2026-09-21T${String(index + 10).padStart(2, '0')}:00` }));
assert.equal(realizedDrawdownStats(smallConvertedLosses, asOf, precisionOptions)[0].maxDrawdown, 0.01, 'equity carries sub-cent conversion amounts between different settlement times');
const grossCopies = smallConversion.map(value => ({ ...value, profitBasis: 'gross', fees: 1 }));
assert.equal(netPnlDistributionStats(grossCopies, precisionOptions)[0].mean, -1, 'unrounded override opt-in never bypasses costs for a gross-basis trade');
const decimalRecovery = [trade('decimal-high', 0.3), trade('decimal-loss', -0.2, { exitTime: '2026-09-21T11:00' }), trade('decimal-recovery', 0.2, { exitTime: '2026-09-21T12:00' })];
assert.equal(realizedDrawdownStats(decimalRecovery, asOf)[0].currentRecoveryMinutes, null, 'floating point tail differences do not create an unrecovered zero-size episode');

const byDirection = productDirectionStats([trade('long-win', 10), trade('long-loss', -4, { symbol: 'btcusdt' }), trade('short', -9, { side: 'short' }), trade('only-long', 0, { symbol: 'ETHUSDT' })]);
const btc = byDirection.find(row => row.symbol === 'BTCUSDT');
assert.deepEqual(btc.long, { count: 2, meanNet: 3 });
assert.deepEqual(btc.short, { count: 1, meanNet: -9 });
assert.deepEqual(byDirection.find(row => row.symbol === 'ETHUSDT').short, { count: 0, meanNet: null }, 'missing direction is unavailable rather than zero');

const distribution = netPnlDistributionStats([-100, -10, -1, 0, 0, 1, 10, 50].map((net, index) => trade(String(index), net)))[0];
assert.equal(distribution.count, 8);
assert.equal(distribution.mean, -6.25);
assert.equal(distribution.median, 0);
assert.equal(distribution.maxProfit, 50);
assert.equal(distribution.maxLoss, -100);
assert.equal(distribution.bins.reduce((sum, bin) => sum + bin.count, 0), 8, 'every outcome is assigned once');
assert.equal(distribution.bins.find(bin => bin.sign === 'flat').count, 2);
assert.ok(distribution.bins.filter(bin => bin.sign === 'loss').every(bin => bin.min < 0 && bin.max <= 0));
assert.ok(distribution.bins.filter(bin => bin.sign === 'profit').every(bin => bin.min >= 0 && bin.max > 0));
const onlyFlat = netPnlDistributionStats([trade('flat', 0)])[0];
assert.deepEqual([onlyFlat.mean, onlyFlat.median, onlyFlat.maxProfit, onlyFlat.maxLoss], [0, 0, null, null]);
assert.equal(onlyFlat.bins.length, 1);
const onlyProfit = netPnlDistributionStats([trade('profit', 4)])[0];
assert.deepEqual([onlyProfit.mean, onlyProfit.median, onlyProfit.maxProfit, onlyProfit.maxLoss], [4, 4, 4, null]);
const onlyLoss = netPnlDistributionStats([trade('loss', -4)])[0];
assert.deepEqual([onlyLoss.mean, onlyLoss.median, onlyLoss.maxProfit, onlyLoss.maxLoss], [-4, -4, null, -4]);
assert.equal(netPnlDistributionStats([trade('a', 1), trade('b', 4), trade('c', 10)])[0].median, 4);
assert.equal(netPnlDistributionStats([trade('a', 1), trade('b', 4)])[0].median, 2.5);
const exactEdges = netPnlDistributionStats([-4, -2, 2, 4].map((net, index) => trade(String(index), net)), { maxSideBins: 2 })[0];
assert.deepEqual(exactEdges.bins.map(bin => bin.count), [1, 1, 1, 1], 'boundary values do not enter adjacent bins twice');

const feeTrade = trade('fees', 12, { profitBasis: 'gross', fees: 2, commission: 1, funding: -0.5 });
assert.equal(pnl(feeTrade), 9.5);
assert.equal(strategyPerformanceStats([feeTrade])[0].rows[0].net, 9.5);
assert.equal(productDirectionStats([feeTrade])[0].long.meanNet, 9.5);
assert.equal(netPnlDistributionStats([feeTrade])[0].mean, 9.5, 'fee and received funding semantics come from the actual pnl function');
const feeTurnsLoss = trade('fee-loss', 1, { profitBasis: 'gross', fees: 2 });
assert.equal(strategyPerformanceStats([feeTurnsLoss])[0].rows[0].wins, 0, 'gross profit that becomes a net loss after fees is not a winning trade');
assert.equal(netPnlDistributionStats([feeTurnsLoss])[0].maxLoss, -1);
assert.equal(realizedDrawdownStats([feeTurnsLoss], asOf)[0].maxDrawdown, 1);
const finiteOnly = [trade('valid', 3), trade('nan', NaN), trade('infinity', Infinity), trade('negative-infinity', -Infinity)];
assert.equal(realizedDrawdownStats(finiteOnly, asOf)[0].count, 1);
assert.equal(strategyPerformanceStats(finiteOnly)[0].count, 1);
assert.equal(productDirectionStats(finiteOnly)[0].long.count, 1);
assert.equal(netPnlDistributionStats(finiteOnly)[0].count, 1, 'nonfinite outcomes are excluded from both numerator and denominator');
assert.deepEqual(sequence.map(value => value.id), ['first', 'fall', 'low', 'recover', 'new-high', 'unrecovered'], 'calculations do not mutate caller trade order');

console.log('Passed realized drawdown/cutoff/timezone/settlement, strategy overlap/normalization/expectancy, currency isolation, direction means and signed outcome-distribution checks.');
