import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);const code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}})`)(path=>path.startsWith('./')?load(path.slice(2)):require(path),module,module.exports);return module.exports;}
const {performanceCurrencyTrades,performanceFxFactor}=load('performance-currency'),{pnl}=load('trades');
const now=Date.parse('2026-10-01T12:00:00Z');
const base={id:crypto.randomUUID(),market:'us-stocks',symbol:'AAPL',currency:'USD',side:'long',entry:100,exit:110,quantity:1,multiplier:1,entryTime:'2026-09-21T10:00',exitTime:'2026-09-21T11:00',netOverride:10,profitBasis:'gross',commission:2,fees:1,funding:null,account:'fixture',notes:'',strategy:'',imageId:null};
const records=[base,{...base,id:crypto.randomUUID(),market:'crypto',symbol:'BTCUSDT',currency:'USDT',netOverride:-12.34,profitBasis:'net'},{...base,id:crypto.randomUUID(),currency:'TWD',netOverride:1000,profitBasis:'net'}];
const snapshot=JSON.stringify(records),quote={rates:{USD:1,USDT:1/0.98,TWD:32,HKD:7.8},updatedAt:now,pricingVersion:2,usdtUpdatedAt:now};
assert.equal(performanceFxFactor('USDT','TWD',quote,now),32/(1/0.98));
assert.equal(performanceFxFactor('USD','TWD',{...quote,stale:true},now),null,'chart and money rows reject stale quotes');
assert.equal(performanceFxFactor('USDT','USD',{...quote,pricingVersion:1},now),null,'chart and money rows never assume an unverified USDT peg');
assert.equal(performanceFxFactor('USDT','USDT',null,now),1,'original-currency display requires no quote');
const native=performanceCurrencyTrades(records,'auto',null,now);assert.equal(native.trades,records);assert.equal(native.currency,null);assert.equal(native.omitted,0,'auto never invents common USD or USDT totals');
const usd=performanceCurrencyTrades(records,'USD',quote,now);assert.equal(usd.currency,'USD');assert.equal(usd.omitted,0);assert.notEqual(usd.trades[0],base,'same-currency P&L is normalized into a display copy without requiring a quote');assert.equal(usd.trades[0].netOverride,pnl(base));assert.equal(usd.trades[0].profitBasis,'net');assert.equal(usd.trades[1].netOverride,-12.34*0.98);assert.equal(usd.trades[1].profitBasis,'net');assert.equal(usd.trades[2].netOverride,31.25);assert.equal(usd.trades[1].fees,1,'conversion does not mutate cost fields or double-deduct them');
const twd=performanceCurrencyTrades(records,'TWD',quote,now);assert.equal(twd.trades[0].netOverride,pnl(base)*32);assert.equal(twd.trades[1].netOverride,-12.34*0.98*32);assert.equal(twd.trades[2].netOverride,pnl(records[2]));
assert.equal(JSON.stringify(records),snapshot,'the canonical trades are never rewritten');assert.ok(usd.trades[1].netOverride!==Math.round(usd.trades[1].netOverride*100)/100,'conversion retains extra precision for aggregate calculations');
const missing=performanceCurrencyTrades(records,'USD',null,now);assert.equal(missing.trades[0].netOverride,pnl(base));assert.equal(missing.omitted,2);
const sameUsdt=performanceCurrencyTrades(records,'USDT',null,now);assert.equal(sameUsdt.trades[0].netOverride,pnl(records[1]));assert.equal(sameUsdt.omitted,2,'same USDT remains valid without assuming USD parity');
const fractional=[{...base,netOverride:1.005,profitBasis:'net'},{...base,netOverride:0.004,profitBasis:'net'}],normalized=performanceCurrencyTrades(fractional,'USD',null,now);assert.equal(normalized.trades[0].netOverride,pnl(fractional[0]));assert.equal(normalized.trades[0].netOverride,1);assert.equal(normalized.trades[1].netOverride,0,'choosing the same currency must not turn a recorded break-even result into a win');assert.equal(normalized.trades.filter(t=>t.netOverride>0).length,1);assert.equal(fractional[1].netOverride,0.004,'display normalization never rewrites the saved amount');
for(const patch of [{stale:true},{updatedAt:now-3_600_001},{updatedAt:now+60_001},{updatedAt:NaN},{updatedAt:Infinity}])assert.equal(performanceCurrencyTrades(records,'USD',{...quote,...patch},now).omitted,2,'stale/invalid/far-future quotes exclude cross-currency samples');
const boundary=performanceCurrencyTrades(records,'USD',{...quote,updatedAt:now-3_600_000,usdtUpdatedAt:now-3_600_000},now);assert.equal(boundary.omitted,0,'one-hour inclusive boundary matches the hourly quote policy');
for(const patch of [{pricingVersion:1},{pricingVersion:undefined},{usdtUpdatedAt:undefined},{usdtUpdatedAt:now-3_600_001},{usdtUpdatedAt:now+60_001},{usdtUpdatedAt:NaN}]){
 const excluded=performanceCurrencyTrades(records,'USD',{...quote,...patch},now);assert.equal(excluded.omitted,1);assert.deepEqual(excluded.trades.map(t=>t.id),[base.id,records[2].id],'invalid USDT quote does not exclude unrelated valid fiat conversions');
 assert.equal(performanceCurrencyTrades(records,'USDT',{...quote,...patch},now).omitted,2,'target USDT requires its own verified quote for fiat conversion');
}
for(const value of [undefined,0,-1,NaN,Infinity])assert.equal(performanceCurrencyTrades(records,'USD',{...quote,rates:{...quote.rates,TWD:value}},now).omitted,1,'missing/nonpositive/nonfinite rates are not treated as zero or parity');
assert.equal(performanceCurrencyTrades(records,'HKD',quote,now).omitted,0);assert.equal(performanceCurrencyTrades(records,'CNY',quote,now).omitted,3);assert.deepEqual(performanceCurrencyTrades([],'USD',null,now),{trades:[],omitted:0,currency:'USD'});
const invalid=performanceCurrencyTrades([{...base,netOverride:Infinity}],'USD',quote,now);assert.equal(invalid.omitted,1);assert.equal(invalid.trades.length,0,'invalid realized amounts are omitted instead of contributing a fabricated zero');
console.log('Passed performance currency grouping, USD/USDT separation, verified hourly FX, same-currency preservation, omitted sample counts, no early conversion rounding and no saved-trade mutations.');
