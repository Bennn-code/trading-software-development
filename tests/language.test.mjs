import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const english = JSON.parse(fs.readFileSync('lib/locales/en.json', 'utf8'));
const cantonese = JSON.parse(fs.readFileSync('lib/locales/yue.json', 'utf8'));

function loadTypeScriptModule(path, resolve = require) {
  const commonJsModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}})`)(resolve, commonJsModule, commonJsModule.exports);
  return commonJsModule.exports;
}

const legal = loadTypeScriptModule('lib/locales/legal.ts');
const englishComplete = { ...english, ...legal.legalEnglish };
const i18n = loadTypeScriptModule('lib/i18n.ts', name => {
  if (name === './locales/en.json') return english;
  if (name === './locales/yue.json') return cantonese;
  if (name === './locales/legal') return legal;
  return require(name);
});
const { createTranslator, validLanguage, loadTranslator } = i18n;
const traditional = createTranslator('zh-Hant');
const [englishTranslator, simplifiedTranslator, cantoneseTranslator] = await Promise.all([
  loadTranslator('en'),
  loadTranslator('zh-Hans'),
  loadTranslator('yue-Hant'),
]);

assert.equal(englishTranslator('交易總覽'), 'Overview');
assert.equal(simplifiedTranslator('交易總覽'), '交易总览');
assert.equal(traditional('我的交易空間'), '我的交易空間');
assert.equal(cantoneseTranslator('我的交易空間'), '我嘅交易空間');
assert.equal(cantoneseTranslator('請核對第 {0} 筆交易並勾選「已核對」', [2]), '請核對第 2 筆交易並剔選「已核對」');
assert.equal(englishTranslator('2026/9月第一週'), '2026/9 · Week 1');
assert.equal(englishTranslator('2026年第三季'), '2026 Q3');
assert.equal(englishTranslator('2026年'), '2026');
assert.equal(englishTranslator('第 {0} 筆出場價', [2]), 'Trade 2 exit price');
assert.equal(validLanguage('en'), true);
assert.equal(validLanguage('yue-Hant'), true);
assert.equal(validLanguage('ja'), false);

for (const language of ['zh-Hant', 'zh-Hans', 'yue-Hant', 'en']) {
  const translator = await loadTranslator(language);
  assert.equal(translator('常用功能'), language === 'en' ? 'Favorites' : language === 'yue-Hant' ? '常用功能' : language === 'zh-Hans' ? '常用功能' : '常用功能');
}

const missing = [];
for (const file of fs.readdirSync('app').filter(file => file.endsWith('.tsx'))) {
  const ast = ts.createSourceFile(file, fs.readFileSync(`app/${file}`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function scan(node) {
    if (ts.isCallExpression(node) && ['t', 'tx'].includes(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && /[\u3400-\u9fff]/u.test(node.arguments[0].text)) {
      const key = node.arguments[0].text;
      if (!englishComplete[key]) missing.push([file, key]);
    }
    ts.forEachChild(node, scan);
  }
  scan(ast);
}
assert.deepEqual(missing, [], 'all explicit UI messages have English translations');

for (const [key, value] of Object.entries(english)) {
  assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), `English interpolation preserved: ${key}`);
}
for (const [key, value] of Object.entries(cantonese)) {
  assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), `Cantonese interpolation preserved: ${key}`);
}

console.log(`Passed four-language translation loading, dates, interpolation, ${Object.keys(english).length} English entries and ${Object.keys(cantonese).length} Cantonese entries.`);
