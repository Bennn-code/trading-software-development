import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
fs.mkdirSync('work',{recursive:true});
for(const name of ['trades','broker-import']){let code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replaceAll('"./trades"','"./trades.cjs"');fs.writeFileSync(`work/${name}.cjs`,code);}
const require=createRequire(new URL('../work/',import.meta.url)),{brokerGuides,parseCsv,parseBrokerRows}=require('./broker-import.cjs');
assert.equal(brokerGuides.length,16);assert.ok(brokerGuides.every(x=>x.source.startsWith('https://')));
const csv='Symbol,Side,Entry Time,Exit Time,Entry Price,Exit Price,Quantity,Realized PNL,Commission,Fee\r\nBTCUSDT,Buy,2026-09-01 10:00:00,2026-09-01 11:00:00,100,110,2,18,1,1';
const rows=parseBrokerRows(parseCsv(csv),brokerGuides.find(x=>x.id==='binance'),0);assert.equal(rows.length,1);assert.equal(rows[0].trade.entryTime,'2026-09-01T18:00');assert.equal(rows[0].trade.exitTime,'2026-09-01T19:00');assert.equal(rows[0].trade.netOverride,18);assert.equal(rows[0].trade.currency,'USDT');
const stock='股票代號,方向,進場時間,出場時間,進場價,出場價,股數,淨損益\n2330,買入,2026/09/02 09:00,2026/09/02 13:20,1000,1010,1000,10000';
const tw=parseBrokerRows(parseCsv(stock),brokerGuides.find(x=>x.id==='yuanta'),8);assert.equal(tw[0].trade.market,'tw-stocks');assert.equal(tw[0].trade.currency,'TWD');assert.equal(tw[0].trade.quantity,1000);assert.equal(tw[0].trade.entryTime,'2026-09-02T09:00');
const statement='股票代號,方向,進場時間,出場時間,進場價,出場價,股數,手續費,證交稅,其他費用\n2330,買入,2026/09/02 09:00,2026/09/02 13:20,1000,1010,1000,20,3030,5';
const costs=parseBrokerRows(parseCsv(statement),brokerGuides.find(x=>x.id==='yuanta'),8)[0].trade;assert.equal(costs.commission,20);assert.equal(costs.transactionTax,3030);assert.equal(costs.fees,5);
console.log('Passed CSV parsing, provider guides, timezone conversion, crypto and Taiwan stock import mappings.');
