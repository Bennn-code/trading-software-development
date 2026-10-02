import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';

const entry = String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import TradeStatus from './app/trade-status';
import { LanguageProvider } from './app/language-provider';
import { initialLocaleResources } from './lib/initial-locale-resources.server';
import { fillExcursions, editExcursions } from './lib/trade-excursions';
import { displayTrades } from './lib/display-currency';
import { tradeStatusFavoriteCards, tradeStatusFavoriteDomId } from './lib/trade-status-favorites';

const fixedNow = Date.parse('2026-10-01T12:00:00Z');
const originalNow = Date.now;
Date.now = () => fixedNow;
const base = {
  id: 'fixture', market: 'crypto', currency: 'USDT', symbol: 'BTCUSDT', side: 'long',
  account: 'fixture', timezone: 'Asia/Taipei', entryTime: '2026-09-21T10:00', exitTime: '2026-09-21T10:05',
  entry: 100, exit: 104, quantity: 2, multiplier: 1, fees: null, funding: null,
  netOverride: 8, profitBasis: 'net', strategy: 'MSS', notes: '', imageId: null,
  cryptoProductType: 'perpetual', positionSizing: 'base-quantity', mae: null, mfe: null,
};
const render = (trades, favoriteIds, overrides = {}) => renderToStaticMarkup(
  <LanguageProvider initialLanguage="zh-Hant" initialResources={initialLocaleResources('zh-Hant')}>
    <TradeStatus trades={trades} analysisTrades={trades} timezone="Asia/Taipei" period="month" anchor="2026-09-21"
      range={{ start: '2026-09-01', end: '2026-09-30', caption: 'September', valid: true }}
      favoriteIds={favoriteIds} onToggleFavorite={() => {}} favoritesOnly {...overrides}/>
  </LanguageProvider>
);
const text = html => html.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&');
const metric = (html, label) => {
  const marker = '<span>' + label + '</span><strong';
  const index = html.indexOf(marker);
  assert.ok(index >= 0, 'real summary renders metric ' + label);
  return html.slice(index).match(/^<span>[^<]*<\/span><strong[^>]*>([^<]*)<\/strong>/)[1];
};

try {
  const ids = ['loss-recovery', 'strategy-performance', 'product-direction', 'pnl-distribution'];
  for (const id of ids) {
    assert.ok(tradeStatusFavoriteCards.some(card => card.id === id), 'the favorite registry includes ' + id);
    const html = render([base], [id]);
    assert.equal((html.match(new RegExp('id="' + tradeStatusFavoriteDomId(id) + '"', 'g')) || []).length, 1, 'exactly one real favorite card for ' + id);
    assert.equal((html.match(/favorite-star-button active/g) || []).length, 1, 'selected favorite can be canceled from its own content');
    for (const other of ids.filter(value => value !== id)) assert.ok(!html.includes('id="' + tradeStatusFavoriteDomId(other) + '"'), 'favorite filtering omits ' + other);
  }

  const result = { id: base.id, mae: -4, mfe: 12, provider: 'okx', timeframe: '1m', referenceSymbol: 'BTC/USDT', productType: 'perpetual', candleCount: 5, calculationVersion: 2,
    mfeTime: { start: Date.parse('2026-09-21T02:01:00Z'), end: Date.parse('2026-09-21T02:02:00Z'), elapsedStartMinutes: 1, elapsedEndMinutes: 2 } };
  const automatic = fillExcursions(base, base, result, new Set());
  const replacedByManual = editExcursions(automatic, { ...automatic, mae: -7, mfe: 15 });
  const partialBase = { ...base, id: 'partial', symbol: 'PARTIALUSDT' };
  const partial = fillExcursions(partialBase, partialBase, { ...result, id: partialBase.id, mae: null }, new Set());
  const manualOnly = { ...base, id: 'manual', symbol: 'MANUALUSDT', mae: -5, mfe: null };
  const missing = { ...base, id: 'missing', symbol: 'MISSINGUSDT' };
  const sampleRows = [replacedByManual, partial, manualOnly, missing];
  const summary = render(sampleRows, ['loss-recovery']);
  assert.equal(metric(summary, '完整行情／總筆數'), '1 / 4', 'old candle metadata does not count manual replacements as valid automatic samples');
  assert.equal(metric(summary, 'MAE／MFE 有效樣本'), '2 / 2', 'each metric keeps its own valid sample count');
  assert.equal(metric(summary, '手動極值交易'), '2 筆');
  assert.ok(text(summary).includes('單側資料 2 筆 · 兩側缺漏 1 筆'));
  assert.equal((summary.match(/<span>平均浮盈保留率<\/span>/g) || []).length, 1, 'the overall retention summary is not duplicated');
  const maeCard = render(sampleRows, ['mae-mfe']);
  assert.equal((maeCard.match(/<span>平均浮盈保留率<\/span>/g) || []).length, 0, 'the detailed chart card no longer duplicates upper summary metrics');
  assert.ok(maeCard.includes('最大浮盈／浮虧金額與出現時間'));
  assert.ok(maeCard.includes('PARTIALUSDT'));
  assert.ok(maeCard.includes('+12 USDT'));
  assert.ok(maeCard.includes('−') || maeCard.includes('-5 USDT'));
  assert.ok(text(maeCard).includes('參考 1m K 線區間：相對進場約 1～2 分鐘'), 'automatic single-side data retains its interval while missing sides remain blank');

  const canonical = [
    { ...base, id: 'earlier', market: 'us-stocks', currency: 'USD', timezone: 'America/New_York', entryTime: '2026-09-20T20:00', exitTime: '2026-09-20T21:00', netOverride: 100 },
    { ...base, id: 'later', market: 'us-stocks', currency: 'USD', timezone: 'Asia/Taipei', entryTime: '2026-09-21T09:00', exitTime: '2026-09-21T10:00', netOverride: -30 },
  ];
  const presented = displayTrades(canonical, 'UTC');
  const historical = render(presented, ['loss-recovery'], { analysisTrades: canonical, timezone: 'UTC', range: { start: '2026-09-21', end: '2026-09-21', valid: true, caption: 'Day' } });
  assert.equal(metric(historical, '本期最大回撤金額'), '-30 USD', 'source timezones restore the actual settlement chronology');
  assert.equal(metric(historical, '目前回撤金額'), '-30 USD');
  assert.equal(metric(historical, '目前尚未恢復所經時間'), '23.0 小時', 'historical observation stops at the selected viewer-timezone day end');
  assert.ok(text(historical).includes('觀察截止 · 2026-09-21'));

  const fractional = { ...base, id: 'fractional', market: 'us-stocks', currency: 'USD', netOverride: 0.004 };
  const nativeStrategy = render([fractional], ['strategy-performance']);
  const sameCurrencyStrategy = render([fractional], ['strategy-performance'], { baseCurrency: 'USD' });
  assert.ok(text(nativeStrategy).includes('勝率 0%'));
  assert.ok(text(sameCurrencyStrategy).includes('勝率 0%'), 'same-currency display copies preserve saved breakeven semantics');

  const future = { ...base, id: 'future', symbol: 'FUTUREUSDT', entryTime: '2026-10-02T10:00', exitTime: '2026-10-02T11:00', strategy: 'Future-only', netOverride: 999 };
  const broadRange = { start: '2026-09-01', end: '2026-10-05', caption: 'Future end', valid: true };
  const cutoffStrategy = render([base, future], ['strategy-performance'], { range: broadRange });
  const cutoffDirection = render([base, future], ['product-direction'], { range: broadRange });
  const cutoffDistribution = render([base, future], ['pnl-distribution'], { range: broadRange });
  assert.ok(!cutoffStrategy.includes('Future-only'), 'strategy card excludes future settlements before observation');
  assert.ok(!cutoffDirection.includes('FUTUREUSDT'), 'direction card uses the same observation cutoff');
  assert.ok(text(cutoffDistribution).includes('1 筆交易'), 'the distribution shares the summary cutoff');
  assert.ok(!text(cutoffDistribution).includes('+999 USDT'));

  const directionTrades = [];
  const addDirection = (symbol, side, outcomes, overrides = {}) => outcomes.forEach((netOverride, index) => directionTrades.push({
    ...base, id: symbol + '-' + side + '-' + index, symbol, side, netOverride, ...overrides,
  }));
  addDirection('ZETAUSDT', 'long', [-120, -60, -30, -20, -10, 0, 160]);
  addDirection('ZETAUSDT', 'short', [90, -15]);
  addDirection('BTCUSDT', 'long', [20, 40]);
  addDirection('BTCUSDT', 'short', [-25]);
  addDirection('ALPHAUSDT', 'long', [0]);
  addDirection('ALPHAUSDT', 'short', [35]);
  const directions = render(directionTrades, ['product-direction']);
  const directionSummary = (html, side) => {
    const match = html.match(new RegExp('<section><header><strong>' + side + '</strong>([\\s\\S]*?)</section>'));
    assert.ok(match, 'real card contains an explicit ' + side + ' market summary');
    return match[1];
  };
  const longSummary = directionSummary(directions, '做多');
  const shortSummary = directionSummary(directions, '做空');
  assert.ok(longSummary.includes('10 筆交易'));
  assert.ok(longSummary.includes('<dt>勝率</dt><dd>30%</dd>'), 'three profitable long trades out of ten are pooled, including two breakevens');
  assert.ok(longSummary.includes('<dt>總淨損益</dt><dd class="loss-value">-20 USDT</dd>'));
  assert.ok(longSummary.includes('<dt>平均每筆淨損益</dt><dd class="loss-value">-2 USDT</dd>'));
  assert.ok(shortSummary.includes('4 筆交易'));
  assert.ok(shortSummary.includes('<dt>勝率</dt><dd>50%</dd>'));
  assert.ok(shortSummary.includes('<dt>總淨損益</dt><dd class="profit-value">+85 USDT</dd>'));
  assert.ok(shortSummary.includes('<dt>平均每筆淨損益</dt><dd class="profit-value">+21.25 USDT</dd>'));
  const headings = [...directions.matchAll(/<h4>([^<]+)<span>/g)].map(match => match[1]);
  assert.deepEqual(headings, ['ZETAUSDT', 'BTCUSDT', 'ALPHAUSDT'], 'actual displayed product order is descending total trade count, not alphabetical');
  assert.ok(text(directions).includes('打平交易也計入'), 'the win-rate denominator is explained in the card');
  const longOnly = directionSummary(render([{ ...base, id: 'long-only', netOverride: 0 }], ['product-direction']), '做空');
  assert.ok(longOnly.includes('0 筆交易'));
  assert.ok(longOnly.includes('<dt>勝率</dt><dd>—</dd>'));
  assert.ok(longOnly.includes('<dt>總淨損益</dt><dd class="">—</dd>'), 'an untraded direction is unavailable rather than invented zero profit');
  const isolatedDirections = render([...directionTrades, { ...base, id: 'usd-separate', market: 'us-stocks', currency: 'USD', symbol: 'AAPL', netOverride: 200 }], ['product-direction']);
  assert.ok(directionSummary(isolatedDirections, '做多').includes('-20 USDT'), 'a different market/currency does not inflate the crypto summary');
  assert.ok(text(isolatedDirections).includes('+200 USD'));

  const distributionTrades = [-4, -2, 0, 0, 2, 4].map((netOverride, index) => ({ ...base, id: 'range-' + index, netOverride }));
  const clearDistribution = render(distributionTrades, ['pnl-distribution']);
  const distributionTable = clearDistribution.match(/<table class="performance-data-table">([\s\S]*?)<\/table>/)?.[1];
  assert.ok(distributionTable, 'the real distribution card offers its accessible data table');
  for (const heading of ['交易結果', '單筆淨損益區間', '區間內交易筆數', '占本組交易比例']) assert.ok(distributionTable.includes(heading));
  for (const rangeText of ['-4 至未滿 -2 USDT', '-2 至未滿 0 USDT', '0 USDT（打平）', '超過 0 至 2 USDT', '超過 2 至 4 USDT']) assert.ok(distributionTable.includes(rangeText), 'natural-language range includes the exact endpoint meaning: ' + rangeText);
  assert.ok(!distributionTable.includes('[-') && !distributionTable.includes('(0,'), 'the table no longer requires reading mathematical interval brackets');
  assert.ok(distributionTable.includes('<th scope="row">打平交易</th><td>0 USDT（打平）</td><td>2</td><td>33.33%</td>'), 'breakeven count and percentage use all six trades as the denominator');
  assert.ok(text(clearDistribution).includes('柱高：交易筆數'));
  assert.ok(text(clearDistribution).includes('橫軸：單筆淨損益（USDT）'));
  assert.ok(text(clearDistribution).includes('每根柱子代表一個金額區間；柱子越高，落在該區間的交易越多。'));
  assert.ok(text(clearDistribution).includes('這不是累積損益圖'), 'the histogram is distinguished from cumulative P&L');
  console.log('Passed real TradeStatus SSR integration: favorite ids/filtering, no duplicate summary, manual-vs-history coverage, single-side amounts/intervals, canonical timezone/day cutoff, native net precision/future exclusion, weighted direction summaries/count ordering and readable histogram boundaries/denominators.');
} finally {
  Date.now = originalNow;
}
`;

await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'work/trade-status-performance.cjs',
  alias: { '@': process.cwd() },
  external: ['react', 'react-dom', 'react-dom/server'],
  logLevel: 'silent',
});
const require = createRequire(import.meta.url);
require(path.resolve('work/trade-status-performance.cjs'));
