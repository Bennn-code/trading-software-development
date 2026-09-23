import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

fs.mkdirSync('work',{recursive:true});
const source=fs.readFileSync('lib/trade-status.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./trades"','"./trades.cjs"');
fs.writeFileSync('work/trade-status.cjs',code);
const require=createRequire(new URL('../work/',import.meta.url));
const {bestDayShare,holdingTimeBucket,holdingTimeLabel}=require('./trade-status.cjs');

assert.equal(bestDayShare(80,[80,-30]),100,'loss days must not inflate a best-day share beyond 100%');
assert.equal(bestDayShare(20,[20,10,-10]),2/3*100);
assert.equal(bestDayShare(-5,[-5,-10]),null,'no positive days have no positive-share percentage');
assert.equal(holdingTimeBucket(0),0);
assert.equal(holdingTimeBucket(12),10);
assert.equal(holdingTimeBucket(59),55);
assert.equal(holdingTimeBucket(60),60);
assert.equal(holdingTimeBucket(119),60);
assert.equal(holdingTimeBucket(120),120);
assert.equal(holdingTimeLabel(55),'55–60m');
assert.equal(holdingTimeLabel(60),'1h');
assert.equal(holdingTimeBucket(3000),48*60);
console.log('Passed profitable-day share bounds and minute/hour holding-time buckets.');
