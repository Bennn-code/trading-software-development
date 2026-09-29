import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';

const entry = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { LanguageProvider } from './app/language-provider';
import PeriodSummary from './app/period-summary';
import DashboardOverview from './app/dashboard-overview';
import FavoritesPage from './app/favorites-page';
import TradeStatus from './app/trade-status';
import { favoriteFeatureDomId, favoriteFeatureTitle, overviewFavoriteCards } from './lib/trade-status-favorites';
import { demoTrades } from './lib/trades';
import { initialLocaleResources } from './lib/initial-locale-resources.server';

const translate = value => value;
assert.equal(favoriteFeatureDomId('overview:equity'), 'trade-overview-favorite-overview%3Aequity');
assert.equal(favoriteFeatureDomId('score'), 'trade-status-favorite-score');
assert.equal(favoriteFeatureTitle('overview:equity', translate), '累積淨損益');
assert.equal(favoriteFeatureTitle('score', translate), '交易分數');
assert.equal(overviewFavoriteCards.length, 14);

const allIds = ['overview:total-pnl', 'overview:daily-pnl', 'overview:trade-count', 'overview:weekly-pnl'];
const sampleTrades = demoTrades().slice(0, 2);
const englishResources = initialLocaleResources('en');
const summary = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><PeriodSummary trades={sampleTrades} market="all" currency="all" baseCurrency="auto" onAll={() => {}} onCalendar={() => {}} onRange={() => {}} favoriteIds={allIds} onToggleFavorite={() => {}} /></LanguageProvider>);
for (const id of allIds) assert.ok(summary.includes('id="' + favoriteFeatureDomId(id) + '"'), 'overview summary card has a stable favorite target: ' + id);
for (const label of ['Total P&amp;L', 'Today&#x27;s net P&amp;L', 'Total trades', 'This week']) assert.ok(summary.includes(label), label);
assert.equal((summary.match(/favorite-star-button active/g) || []).length, 4, 'all four summary cards reflect saved favorites');

const focusedSummary = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><PeriodSummary trades={sampleTrades} market="all" currency="all" baseCurrency="auto" onAll={() => {}} onCalendar={() => {}} onRange={() => {}} favoriteIds={['overview:daily-pnl']} onToggleFavorite={() => {}} favoriteOnly /></LanguageProvider>);
assert.ok(focusedSummary.includes('Today&#x27;s net P&amp;L'), 'favorite-only summary displays the selected card content');
assert.ok(!focusedSummary.includes('Total P&amp;L'), 'favorite-only summary omits other summary cards');

const analysisIds = ['overview:selected-period-pnl', 'overview:win-rate', 'overview:profit-factor', 'overview:period-count', 'overview:average-results', 'overview:best-worst-trade', 'overview:busiest-day'];
const dashboard = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><DashboardOverview trades={sampleTrades} currency="all" baseCurrency="auto" periodCaption="This month" onTrade={() => {}} onMonth={() => {}} onDay={() => {}} onCalendar={() => {}} favoriteIds={analysisIds} onToggleFavorite={() => {}} /></LanguageProvider>);
for (const id of analysisIds) assert.ok(dashboard.includes('id="' + favoriteFeatureDomId(id) + '"'), 'overview analysis card has a stable favorite target: ' + id);
assert.equal((dashboard.match(/favorite-star-button active/g) || []).length, analysisIds.length, 'all analysis cards reflect saved favorites');

const focusedDashboard = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><DashboardOverview trades={sampleTrades} currency="all" baseCurrency="auto" periodCaption="This month" onTrade={() => {}} onMonth={() => {}} onDay={() => {}} onCalendar={() => {}} favoriteIds={['overview:profit-factor']} onToggleFavorite={() => {}} favoriteOnly /></LanguageProvider>);
assert.ok(focusedDashboard.includes('Profit factor'), 'favorite-only analysis displays the selected card content');
assert.doesNotMatch(focusedDashboard, /trade-overview-favorite-overview%3Awin-rate/, 'unselected analysis cards are omitted from the favorites view');

const favorites = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><FavoritesPage ids={['overview:equity', 'score']} ready={true} onRetry={() => {}}><section className="panel equity-panel">Cumulative net P&amp;L</section><section className="panel status-card">Trading score</section></FavoritesPage></LanguageProvider>);
assert.ok(favorites.includes('Cumulative net P&amp;L'));
assert.ok(favorites.includes('Trading score'));
assert.equal((favorites.match(/favorite-page-card/g) || []).length, 0, 'favorites render card contents directly without a jump list');
assert.ok(favorites.includes('favorites-page-content'));

const focusedStatus = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><TradeStatus trades={sampleTrades} timezone="Asia/Taipei" period="month" anchor="2026-09-28" range={{start:'2026-09-01',end:'2026-09-28',caption:'September 2026',valid:true}} favoriteIds={['risk']} onToggleFavorite={() => {}} favoritesOnly /></LanguageProvider>);
assert.ok(focusedStatus.includes('Risk profile'), 'favorite-only status shows the actual selected insight card');
assert.ok(!focusedStatus.includes('Most-traded instruments'), 'favorite-only status omits non-favorite cards');

console.log('Passed direct favorites rendering, selected summary/analysis/status cards, stable card targets, and favorite stars.');
`;

await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'work/favorites.cjs',
  alias: { '@': process.cwd() },
  external: ['react', 'react-dom', 'react-dom/server'],
  logLevel: 'silent',
});

const require = createRequire(import.meta.url);
require(path.resolve('work/favorites.cjs'));
