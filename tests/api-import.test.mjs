import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('lib/api-import.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const apiModule = { exports: {} };
new Function('exports', 'module', compiled)(apiModule.exports, apiModule);
const { apiImportGuides, searchApiImportGuides, exactApiImportGuide } = apiModule.exports;

assert.ok(apiImportGuides.length >= 21);
assert.equal(new Set(apiImportGuides.map(guide => guide.id)).size, apiImportGuides.length);
for (const guide of apiImportGuides) {
  assert.ok(guide.source.startsWith('https://'), `${guide.id} must link to HTTPS documentation`);
  assert.ok(guide.readPermission, `${guide.id} must explain its read permission`);
  assert.ok(guide.steps.length >= 2, `${guide.id} must include setup instructions`);
}

assert.equal(exactApiImportGuide('盈透證券').id, 'ibkr');
assert.equal(exactApiImportGuide('盈透證券（香港）').id, 'ibkr-hk');
assert.equal(exactApiImportGuide('老虎證券').id, 'tiger-brokers');
assert.equal(searchApiImportGuides('kucoin', 'crypto')[0].id, 'kucoin');
assert.ok(searchApiImportGuides('Futu', 'hk').some(guide => guide.availability === 'local-only'));
assert.ok(searchApiImportGuides('Shioaji', 'tw').some(guide => guide.safetyMode === 'site-query-only'));
assert.ok(searchApiImportGuides('QMT', 'cn').some(guide => guide.safetyMode === 'site-query-only'));
assert.ok(searchApiImportGuides('Alpaca', 'us').some(guide => guide.safetyMode === 'site-query-only'));
assert.ok(searchApiImportGuides('ProjectX').length === 0, 'ProjectX must stay excluded when its API cannot be limited to read-only');
assert.ok(searchApiImportGuides('TopstepX').length === 0, 'TopstepX must stay excluded when its API cannot be limited to read-only');

const en = JSON.parse(fs.readFileSync('lib/locales/en.json', 'utf8'));
const yue = JSON.parse(fs.readFileSync('lib/locales/yue.json', 'utf8'));
const legalCompiled = ts.transpileModule(fs.readFileSync('lib/locales/legal.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const legalModule = { exports: {} };
new Function('exports', 'module', legalCompiled)(legalModule.exports, legalModule);
const enText = { ...en, ...legalModule.exports.legalEnglish };
const yueText = { ...yue, ...legalModule.exports.legalCantonese };
assert.deepEqual(apiImportGuides.filter(guide => guide.liveConnector).map(guide => guide.id), ['bybit', 'okx', 'bitget', 'kucoin']);
for (const guide of apiImportGuides) {
  const localizedNames = /[\u3400-\u9fff]/.test(guide.name) ? [guide.name] : [];
  for (const text of [...localizedNames, guide.category, guide.credentialType, guide.readPermission, ...guide.steps, ...(guide.notes ?? [])]) {
    assert.ok(enText[text], `missing English API import translation: ${text}`);
    assert.ok(yueText[text], `missing Cantonese API import translation: ${text}`);
  }
}
const uiSource = fs.readFileSync('app/broker-import.tsx', 'utf8');
for (const [, text] of uiSource.matchAll(/tx\('([^']+)'/g)) {
  assert.ok(enText[text], `missing English API import UI translation: ${text}`);
  assert.ok(yueText[text], `missing Cantonese API import UI translation: ${text}`);
}

const connector = fs.readFileSync('app/api/imports/api/bybit/route.ts', 'utf8');
assert.match(connector, /https:\/\/api\.bybit\.com\/v5\/position\/get-closed-positions/);
assert.match(connector, /method:\s*'GET'/);
assert.match(connector, /redirect:\s*'error'/);
assert.doesNotMatch(connector, /method:\s*'POST'/, 'the connector must never send write requests to Bybit');
assert.doesNotMatch(connector, /apiSecret[^\n]{0,100}(?:INSERT|UPDATE|DELETE)|(?:INSERT|UPDATE|DELETE)[^\n]{0,100}apiSecret/i, 'API secrets must never be persisted');
assert.match(uiSource, /setApiSecret\(''\)/, 'clear the secret from UI state after submitting or leaving the form');

console.log(`Passed read-only API catalog checks for ${apiImportGuides.length} providers, the Bybit GET-only connector, and English/Cantonese guides.`);
