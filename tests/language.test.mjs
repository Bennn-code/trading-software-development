import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),english=JSON.parse(fs.readFileSync('lib/locales/en.json','utf8'));
const module={exports:{}};const code=ts.transpileModule(fs.readFileSync('lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext(`(function(require,module,exports){${code}})`)(name=>name==='./locales/en.json'?english:require(name),module,module.exports);
const{translate:t,validLanguage}=module.exports;
assert.equal(t('交易總覽','en'),'Overview');assert.equal(t('交易總覽','zh-Hans'),'交易总览');assert.equal(t('我的交易空間','zh-Hant'),'我的交易空間');
assert.equal(t('2026/9月第一週','en'),'2026/9 · Week 1');assert.equal(t('2026年第三季','en'),'2026 Q3');assert.equal(t('2026年','en'),'2026');
assert.equal(t('第 {0} 筆出場價','en',[2]),'Trade 2 exit price');assert.equal(validLanguage('en'),true);assert.equal(validLanguage('ja'),false);
const missing=[];for(const f of fs.readdirSync('app').filter(f=>f.endsWith('.tsx'))){const ast=ts.createSourceFile(f,fs.readFileSync(`app/${f}`,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function scan(n){if(ts.isCallExpression(n)&&['t','tx'].includes(n.expression.getText(ast))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&/[\u3400-\u9fff]/u.test(n.arguments[0].text)){const key=n.arguments[0].text;if(!english[key])missing.push([f,key]);}ts.forEachChild(n,scan);}scan(ast);}
assert.deepEqual(missing,[],'all explicit UI messages have English translations');
for(const[k,v]of Object.entries(english))assert.deepEqual([...k.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...v.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),`interpolation preserved: ${k}`);
console.log(`Passed three-language messages, dates, interpolation and ${Object.keys(english).length} English catalog entries.`);
