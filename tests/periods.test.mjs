import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
fs.mkdirSync('work',{recursive:true});
for(const name of ['trades','periods'])fs.writeFileSync(`work/${name}.cjs`,ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./trades"','"./trades.cjs"'));
const require=createRequire(new URL('../work/',import.meta.url));
const {periodSummary,weekBounds}=require('./periods.cjs');
const {newTrade,localTime}=require('./trades.cjs');
assert.deepEqual(weekBounds('2026-09-01'),{start:'2026-08-31',end:'2026-09-06'});
assert.deepEqual(weekBounds('2026-09-06'),{start:'2026-08-31',end:'2026-09-06'});
assert.deepEqual(weekBounds('2026-09-07'),{start:'2026-09-07',end:'2026-09-13'});
assert.deepEqual(weekBounds('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
assert.throws(()=>weekBounds('2026-02-30'));
assert.equal(localTime(new Date('2026-08-31T16:00:00Z')).slice(0,10),'2026-09-01');
const base={...newTrade(),entry:100,exit:110,quantity:1,multiplier:2,fees:2,funding:0};
const trades=[
 {...base,exitTime:'2026-08-30T23:59',netOverride:999},
 {...base,exitTime:'2026-08-31T00:00',netOverride:100},
 {...base,exitTime:'2026-09-01T00:00',netOverride:-20},
 {...base,exitTime:'2026-09-01T23:59',netOverride:0.10},
 {...base,exitTime:'2026-09-01T23:58',netOverride:0.20},
 {...base,exitTime:'2026-09-06T23:59',netOverride:30},
 {...base,exitTime:'2026-09-07T00:00',netOverride:888},
 {...base,exitTime:'2026-09-01T20:00',market:'crypto',currency:'USDT',netOverride:500},
 {...base,exitTime:'2026-09-01T20:00',market:'crypto',currency:'USD',netOverride:2},
];
let sum=periodSummary(trades,'2026-09-01','futures','USD');assert.deepEqual(sum.daily,{net:-19.7,count:3});assert.deepEqual(sum.weekly,{net:110.3,count:5});
sum=periodSummary(trades,'2026-09-01','all','USD');assert.equal(sum.daily.net,-17.7);assert.equal(sum.weekly.net,112.3);
sum=periodSummary(trades,'2026-09-01','all','USDT');assert.deepEqual(sum.daily,{net:500,count:1});
sum=periodSummary([{...base,exitTime:'2026-09-01T01:00',funding:-1}],'2026-09-01','all','USD');assert.equal(sum.daily.net,19,'fees and received funding included');
sum=periodSummary([],'2026-09-01','all','USD');assert.deepEqual(sum.daily,{net:0,count:0});assert.deepEqual(sum.weekly,{net:0,count:0});
console.log('Passed daily/weekly totals, Taiwan midnight, Monday/Sunday, cross-month/year, currencies, markets, fees, decimal rounding and empty states.');
