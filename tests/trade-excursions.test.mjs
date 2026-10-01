import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);const code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}})`)(path=>path.startsWith('./')?load(path.slice(2)):require(path),module,module.exports);return module.exports;}
const {excursionInput,fillExcursions,savedExcursions,editExcursions}=load('trade-excursions'),{tradeSchema}=load('validation'),{pnl}=load('trades');
const base={id:crypto.randomUUID(),market:'crypto',currency:'USDT',cryptoProductType:'perpetual',symbol:'BTCUSDT',side:'long',account:'fixture',timezone:'Asia/Taipei',entryTime:'2026-09-21T10:00',exitTime:'2026-09-21T10:05',entry:100,exit:103,quantity:2,multiplier:1,fees:null,funding:null,strategy:'',notes:'',imageId:null,netOverride:null,mae:null,mfe:null};
const result={id:base.id,mae:-4,mfe:12,provider:'okx',timeframe:'1m',referenceSymbol:'BTC/USDT',productType:'perpetual',candleCount:5};
const filled=fillExcursions(base,base,result,new Set());assert.equal(filled.mae,-4);assert.equal(filled.mfe,12);assert.equal(pnl(filled),pnl(base));
const reloaded=tradeSchema.parse(JSON.parse(JSON.stringify(filled)));assert.equal(savedExcursions(reloaded).mae.automatic,true);assert.equal(savedExcursions(reloaded).estimate.provider,'okx','source and interval survive saving and reload');
assert.equal(tradeSchema.safeParse(base).success,true,'quotes are optional: failed price lookup cannot block a complete trade');
const manual=fillExcursions({...base,mae:-7},base,result,new Set());assert.equal(manual.mae,-7);assert.equal(manual.mfe,12);assert.equal(savedExcursions(manual).mae.automatic,false);
const cleared=fillExcursions(base,base,result,new Set([base.id+':mae']));assert.equal(cleared.mae,null,'an explicitly cleared field is not overwritten by an in-flight result');assert.equal(cleared.mfe,12);
for(const patch of [{entryTime:'2026-09-21T11:00'},{exitTime:'2026-09-21T11:05'},{timezone:'UTC'},{symbol:'ETHUSDT'},{side:'short'},{quantity:3},{cryptoProductType:'spot'}]){
 const changed={...base,...patch};assert.equal(fillExcursions(changed,base,result,new Set()),changed,'an edited calculation input rejects an old response');
 const stale={...filled,...patch};assert.equal(savedExcursions(stale).mae.amount,null,'saved estimates with obsolete time/product/position are not treated as manual facts');
 assert.equal(editExcursions(filled,stale).mae,null);assert.equal(editExcursions(filled,stale).mfe,null);
}
assert.equal(excursionInput({...base,account:'another',notes:'private note'}),excursionInput(base),'account and notes never alter price data');
const edited=editExcursions(filled,{...filled,mae:-8});assert.equal(savedExcursions(edited).mae.automatic,false);assert.equal(savedExcursions(edited).mfe.automatic,true,'manual editing one metric retains valid provenance for the other');
assert.equal(fillExcursions(base,base,{...result,mae:NaN,mfe:null},new Set()),base,'invalid or missing values are never changed to zero');
console.log('Passed optional screenshot excursions: persistence, source labels, manual priority, clear/edit races, stale estimates, validation and unchanged realized P&L.');
