import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
for(const name of ['trades','trade-duplicates']){const code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./trades"','"./trades.cjs"');fs.writeFileSync(`work/${name}.cjs`,code);}
const require=createRequire(new URL('../work/',import.meta.url)),{findTradeMatches,tradeMatchKey}=require('./trade-duplicates.cjs'),{newTrade}=require('./trades.cjs');
const original={...newTrade(),id:'old',entryTime:'2026-09-01T10:00',exitTime:'2026-09-01T10:20',entry:100,exit:110,quantity:2,netOverride:40,profitBasis:'gross'},copy={...original,id:'copy',imageId:'different-image'};
assert.equal(findTradeMatches([copy],[original]).length,1,'overlapping screenshots are matched by trade, not image');
for(const change of [{entryTime:'2026-09-01T10:01'},{exitTime:'2026-09-01T10:21'},{entry:100.0001},{exit:110.0001},{quantity:3},{netOverride:40.001},{profitBasis:'net'},{symbol:'ES'},{side:'short'},{currency:'USDT'}])assert.equal(findTradeMatches([{...copy,...change}],[original]).length,0,JSON.stringify(change));
assert.equal(findTradeMatches([{...copy,account:'另一帳戶',notes:'changed',strategy:'changed'}],[original]).length,1,'matching criteria do not depend on notes or screenshot account labels');
assert.equal(findTradeMatches([original],[original]).length,0,'saved IDs are idempotent retries');
assert.deepEqual(findTradeMatches([original,copy],[])[0].matchIds,['old'],'duplicates in same import only flag later rows');
assert.equal(tradeMatchKey({...copy,entry:0}),null);assert.equal(tradeMatchKey({...copy,entryTime:''}),null);
const crypto={...original,market:'crypto',symbol:'BTCUSDT',currency:'USDT',positionValue:200,quantity:2};
assert.equal(findTradeMatches([{...crypto,id:'copy',quantity:99}],[crypto]).length,1,'explicit position value drives crypto size');
assert.equal(findTradeMatches([{...crypto,id:'copy',positionValue:201}],[crypto]).length,0);
assert.equal(findTradeMatches([{...crypto,id:'copy',positionValue:null,quantity:2}],[crypto]).length,1);
assert.equal(tradeMatchKey({...copy,entryTime:'2026-09-01T10:00:00'}),tradeMatchKey(copy));
console.log('Passed exact trade matching across screenshots, distinct fields/products, crypto position value, missing data, batch overlap and idempotent IDs.');
