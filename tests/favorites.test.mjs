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
import { favoriteFeatureDomId, favoriteFeatureTitle, favoriteFeatureView, overviewFavoriteCards } from './lib/trade-status-favorites';
import { demoTrades } from './lib/trades';
import { initialLocaleResources } from './lib/initial-locale-resources.server';

const translate = value => value;
assert.equal(favoriteFeatureView('overview:equity'), 'overview');
assert.equal(favoriteFeatureView('score'), 'status');
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

const analysisIds = ['overview:selected-period-pnl', 'overview:win-rate', 'overview:profit-factor', 'overview:period-count', 'overview:average-results', 'overview:best-worst-trade', 'overview:busiest-day'];
const dashboard = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><DashboardOverview trades={sampleTrades} currency="all" baseCurrency="auto" periodCaption="This month" onTrade={() => {}} onMonth={() => {}} onDay={() => {}} onCalendar={() => {}} favoriteIds={analysisIds} onToggleFavorite={() => {}} /></LanguageProvider>);
for (const id of analysisIds) assert.ok(dashboard.includes('id="' + favoriteFeatureDomId(id) + '"'), 'overview analysis card has a stable favorite target: ' + id);
assert.equal((dashboard.match(/favorite-star-button active/g) || []).length, analysisIds.length, 'all analysis cards reflect saved favorites');

const favorites = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><FavoritesPage ids={['overview:equity', 'score']} ready={true} onToggle={() => {}} onOpen={() => {}} /></LanguageProvider>);
assert.ok(favorites.includes('Cumulative net P&amp;L'));
assert.ok(favorites.includes('Trading score'));
assert.equal((favorites.match(/favorite-page-card/g) || []).length, 2);

console.log('Passed favorites routing, stable overview targets, summary and analysis-card stars, and direct favorites-page rendering.');
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
