import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);const code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}})`)(path=>path.startsWith('./')?load(path.slice(2)):require(path),module,module.exports);return module.exports;}
const {cryptoExcursionPosition,pnl}=load('trades'),{calculateMaeMfe}=load('trade-status'),{tradeSchema}=load('validation'),{normalizeRow,extractionJsonSchema}=load('screenshot-import'),{excursionInput,fillExcursions,savedExcursions,editExcursions}=load('trade-excursions'),{overallMaeMfe}=load('mae-mfe-summary');
const base={id:crypto.randomUUID(),market:'crypto',symbol:'BTCUSDT',cryptoProductType:'perpetual',currency:'USDT',side:'long',entry:100,exit:110,quantity:999999,multiplier:1,positionValue:null,positionSizing:'closing-notional',closingPositionValue:1100,timezone:'UTC',entryTime:'2026-09-21T10:00',exitTime:'2026-09-21T10:05',netOverride:8,profitBasis:'net',account:'fixture',notes:'',strategy:'',imageId:null,fees:null,funding:null,mae:null,mfe:null};
const position=cryptoExcursionPosition(base);assert.deepEqual(position,{quantity:10,notional:1000,basis:'closing-notional'},'close USDT value is divided by EXIT, then entry notional uses ENTRY');
const candles=[{time:Date.parse('2026-09-21T10:00Z'),high:120,low:95},{time:Date.parse('2026-09-21T10:01Z'),high:115,low:96}];
const calc=calculateMaeMfe(base,candles,1);assert.equal(calc.mae,-50);assert.equal(calc.mfe,200);assert.equal(calc.actual,8);
assert.equal(calculateMaeMfe({...base,marginMode:'cross',leverage:1000,marginAmount:999999},candles).mfe,200,'cross collateral and leverage do not multiply a known position again');
assert.equal(calculateMaeMfe({...base,side:'short'},candles).mae,-200);assert.equal(calculateMaeMfe({...base,side:'short'},candles).mfe,50);
for(const patch of [{exit:0},{closingPositionValue:null},{closingPositionValue:0},{closingPositionValue:Infinity},{currency:'USD'}])assert.equal(cryptoExcursionPosition({...base,...patch}),null,'unknown/invalid close amount or exit price cannot become a size');
const canonical=tradeSchema.parse(base);assert.equal(canonical.quantity,10);assert.equal(canonical.positionValue,1000);assert.equal(canonical.closingPositionValue,1100);assert.equal(pnl(canonical),8,'saving new size evidence preserves the statement net result');
assert.equal(excursionInput({...base,positionSizing:'notional',positionValue:1000,quantity:10}),JSON.stringify([2,'crypto','BTCUSDT',null,'USDT','long',base.entryTime,base.exitTime,'UTC',100,110,10,1,1000,'perpetual','notional',null,null,null]),'v81 sizing signatures remain byte-identical');
const result={...calc,id:base.id,provider:'okx',timeframe:'1m',referenceSymbol:'BTC/USDT',productType:'perpetual'};
const filled=fillExcursions(canonical,canonical,result,new Set()),restored=tradeSchema.parse(JSON.parse(JSON.stringify(filled)));assert.equal(savedExcursions(restored).mfe.automatic,true);assert.equal(restored.excursionEstimate.sizeBasis,'closing-notional');
assert.equal(editExcursions(filled,{...filled,closingPositionValue:2200}).mfe,null,'changed close size invalidates only the associated automatic estimate');
for(const side of ['mae','mfe']){
 const single=fillExcursions(canonical,canonical,{...result,[side==='mae'?'mfe':'mae']:null},new Set());
 const saved=tradeSchema.parse(JSON.parse(JSON.stringify(single)));assert.equal(saved[side],calc[side]);assert.equal(saved[side==='mae'?'mfe':'mae'],null,'missing side stays unknown rather than zero');assert.equal(savedExcursions(saved)[side].automatic,true);assert.equal(pnl(saved),8);
}
const manual=fillExcursions({...canonical,mae:-7},canonical,{...result,mae:null},new Set());assert.equal(manual.mae,-7);assert.equal(manual.mfe,200);assert.equal(savedExcursions(manual).mae.automatic,false);
const lossOnly=calculateMaeMfe({...base,exit:90,closingPositionValue:900},[{high:100,low:80}]);assert.equal(lossOnly.mfe,0,'complete history with no favorable move yields an observed zero, not an unknown');
const gainOnly=calculateMaeMfe(base,[{high:120,low:100}]);assert.equal(gainOnly.mae,0,'complete history with no adverse move yields an observed zero');
const sides=overallMaeMfe([{currency:'USD',mae:-7,mfe:null},{currency:'USD',mae:null,mfe:25},{currency:'USD',mae:0,mfe:0}],'USD',null);assert.equal(sides.mae,-3.5);assert.equal(sides.mfe,12.5);assert.equal(sides.maeCount,2);assert.equal(sides.mfeCount,2,'each side keeps its own valid denominator');
const extracted={sourceLabel:'fixture',symbol:'BTCUSDT',market:'crypto',side:'long',currency:'USDT',entryTime:base.entryTime,exitTime:base.exitTime,entry:100,exit:110,quantity:null,multiplier:null,mae:null,mfe:null,exchangeSource:'okx',isPerpetual:true,positionValue:null,fees:null,funding:null,netProfit:8,netProfitIsNet:true,strategy:null,entryFills:[],exitFills:[],completeFillHistory:false,warnings:[],closingQuantity:1100,closingQuantityUnit:'USDT',closingQuantitySource:'平倉數量 1100 USDT'};
const ctx={id:base.id,imageId:crypto.randomUUID(),account:'fixture',sourceTimezone:'UTC',targetTimezone:'UTC'};
const quote=normalizeRow(extracted,ctx).trade;assert.equal(quote.positionSizing,'closing-notional');assert.equal(quote.quantity,10);assert.equal(quote.positionValue,1000);assert.equal(quote.closingPositionValue,1100);assert.equal(quote.marginAmount,null);assert.equal(quote.leverage,null);assert.equal(calculateMaeMfe(quote,candles).mfe,200);
const coins=normalizeRow({...extracted,closingQuantity:10,closingQuantityUnit:'BTC',closingQuantitySource:'Closed quantity: 10 BTC'},ctx).trade;assert.equal(coins.positionSizing,'base-quantity');assert.equal(coins.quantity,10);assert.equal(coins.closingPositionValue,null);
const oldQuantitySource=normalizeRow({...extracted,closingQuantity:null,quantity:1100,quantitySource:'平倉數量 1100 USDT'},ctx).trade;assert.equal(oldQuantitySource.positionSizing,'closing-notional');assert.equal(oldQuantitySource.quantity,10,'a clear old extraction label can supply newly recognized close value evidence');
for(const patch of [{closingQuantitySource:null},{closingQuantityUnit:null},{closingQuantityUnit:'BTC'},{closingQuantitySource:'Account balance 1100 USDT'},{closingQuantitySource:'平倉數量／帳戶餘額 1100 USDT'},{closingQuantitySource:'Partial closed quantity: 1100 USDT'},{closingQuantityUnit:'contracts',closingQuantitySource:'Closed quantity 1100 contracts'},{closingQuantitySource:'平倉數量 1100 USDT contracts'},{closingQuantity:-1}]){
 const t=normalizeRow({...extracted,...patch},ctx).trade;assert.equal(t.positionSizing,null,'unverified/mismatched units, account totals and contract counts are not quote notional');assert.equal(t.closingPositionValue,null);assert.equal(t.netOverride,8);
}
const maeOnly=tradeSchema.parse(normalizeRow({...extracted,mae:7,mfe:null},ctx).trade);assert.equal(maeOnly.mae,-7);assert.equal(maeOnly.mfe,null);assert.equal(pnl(maeOnly),8);
const mfeOnly=tradeSchema.parse(normalizeRow({...extracted,mae:null,mfe:25},ctx).trade);assert.equal(mfeOnly.mae,null);assert.equal(mfeOnly.mfe,25);
for(const field of ['closingQuantity','closingQuantityUnit','closingQuantitySource'])assert.ok(extractionJsonSchema.properties.trades.items.required.includes(field),'strict nullable extraction explicitly includes all close-size evidence fields');
console.log('Passed closing USDT/coin size without margin or leverage, exit-price conversion, source/unit proof, account/contract rejection, v81 signature compatibility, one-sided save/average and unchanged statement P&L.');
