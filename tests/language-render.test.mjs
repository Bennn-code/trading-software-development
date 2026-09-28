import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';

const entry = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import Journal from './app/journal';
import { LanguageProvider, useI18n } from './app/language-provider';
import FavoritesPage from './app/favorites-page';
import AccountSettings, { AuthForm } from './app/account-settings';
import TradeFields from './app/trade-fields';
import { newTrade } from './lib/trades';
import { initialLocaleResources } from './lib/initial-locale-resources.server';

function LanguageProbe() {
  const { t } = useI18n();
  return <div><span>{t('交易總覽')}</span><span>{t('常用功能')}</span><span>{t('交易分數')}</span></div>;
}

for (const [language, labels, loadingLabel] of [
  ['zh-Hant', ['交易總覽', '常用功能', '交易分數'], '正在載入交易紀錄…'],
  ['zh-Hans', ['交易总览', '常用功能', '交易分数'], '正在载入交易纪录…'],
  ['yue-Hant', ['交易總覽', '常用功能', '交易評分'], '載入緊交易紀錄…'],
  ['en', ['Overview', 'Favorites', 'Trading score'], 'Loading trade records…'],
]) {
  const initialResources = initialLocaleResources(language);
  const probe = renderToStaticMarkup(<LanguageProvider initialLanguage={language} initialResources={initialResources}><LanguageProbe /></LanguageProvider>);
  for (const label of labels) assert.ok(probe.includes(label), language + ': ' + label);

  const html = renderToStaticMarkup(<LanguageProvider initialLanguage={language} initialResources={initialResources}><Journal signedIn={true} /></LanguageProvider>);
  for (const label of labels.slice(0, 2)) assert.ok(html.includes(label), language + ': ' + label);
  assert.ok(html.includes(loadingLabel), language + ': localized initial loading state');
  assert.ok(!html.includes('favorite-sidebar-link'), 'favorites remain a top-level nav item');

  const favorites = renderToStaticMarkup(<LanguageProvider initialLanguage={language} initialResources={initialResources}><FavoritesPage ids={['overview:equity', 'score']} ready={true} onRetry={() => {}}><article className="panel equity-panel">{language === 'en' ? 'Cumulative net P&L' : language === 'zh-Hans' ? '累积净损益' : language === 'yue-Hant' ? '累積淨盈虧' : '累積淨損益'}</article><article className="panel status-card">{language === 'en' ? 'Trading score' : language === 'zh-Hans' ? '交易分数' : language === 'yue-Hant' ? '交易評分' : '交易分數'}</article></FavoritesPage></LanguageProvider>);
  assert.ok(favorites.includes(labels[1]), language + ': favorites page title');
  const directCopy = language === 'en' ? 'View the contents of your saved cards directly here.' : language === 'yue-Hant' ? '直接喺呢度查看已收藏卡片嘅內容。' : language === 'zh-Hans' ? '直接查看已收藏的卡片内容。' : '直接查看已收藏的卡片內容。';
  assert.ok(favorites.includes(directCopy), language + ': direct card content description');
  assert.ok(favorites.includes(language === 'en' ? 'Cumulative net P&amp;L' : language === 'zh-Hans' ? '累积净损益' : language === 'yue-Hant' ? '累積淨盈虧' : '累積淨損益'), language + ': overview favorite card content');
  assert.ok(favorites.includes(language === 'en' ? 'Trading score' : language === 'zh-Hans' ? '交易分数' : language === 'yue-Hant' ? '交易評分' : '交易分數'), language + ': status favorite card content');
  assert.ok(!favorites.includes('favorite-page-card'), language + ': favorites render card contents rather than jump links');
}

const englishResources = initialLocaleResources('en');
const account = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><AccountSettings /><AuthForm enabled={false} /></LanguageProvider>);
for (const label of ['Display language', '繁體中文', '简体中文', '粵語', '廣東話', 'English', 'Create account', 'Confirm password', 'not enabled']) assert.ok(account.includes(label), label);
assert.ok(account.includes('disabled=""'));

const trade = { ...newTrade(), market: 'crypto', symbol: 'BTCUSDT', notes: '我的私人心得', strategy: '自己命名的策略', positionValue: 1000 };
const fields = renderToStaticMarkup(<LanguageProvider initialLanguage="en" initialResources={englishResources}><TradeFields trade={trade} onChange={() => {}} /></LanguageProvider>);
for (const label of ['Entry position value', 'Margin mode', 'Leverage', '我的私人心得', '自己命名的策略']) assert.ok(fields.includes(label), label);

console.log('Rendered all four languages synchronously in the provider, verified the top-level favorites page, localized initial state, settings and trade form.');
`;

await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'work/language-render.cjs',
  alias: { '@': process.cwd() },
  external: ['react', 'react-dom', 'react-dom/server'],
  logLevel: 'silent',
});

const require = createRequire(import.meta.url);
require(path.resolve('work/language-render.cjs'));
