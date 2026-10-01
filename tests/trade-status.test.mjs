import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

fs.mkdirSync('work',{recursive:true});
for(const name of ['trades','display-currency']){const dependency=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./trades"','"./trades.cjs"');fs.writeFileSync(`work/${name}.cjs`,dependency);}
const source=fs.readFileSync('lib/trade-status.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./trades"','"./trades.cjs"').replaceAll('"./display-currency"','"./display-currency.cjs"');
fs.writeFileSync('work/trade-status.cjs',code);
const require=createRequire(new URL('../work/',import.meta.url));
const {averageDurationMinutes,averagePnl,averageReturnPercent,bestDayShare,calculateMaeMfe,chooseMaeMfeIntervalMinutes,enteredStrategyStats,hasEnteredStrategies,holdingTimeBucket,holdingTimeLabel,inEntryDateRange,lossRecoveryStats,maeMfeCandleInWindow,maeMfeCandleWindow,maeMfeFingerprint,maeMfeIntervalLabel,maeMfeProviderInterval,profitConcentration,sharpeRatio,weekdayPnlStats}=require('./trade-status.cjs');

assert.equal(averagePnl([{netOverride:10,profitBasis:'net'},{netOverride:-4,profitBasis:'net'}]),3,'average P&L includes wins and losses');
assert.equal(averagePnl([]),0,'empty periods have no average P&L');
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
const trade=(exitTime,netOverride,positionValue=1000,entryTime='2026-09-21T09:00')=>({exitTime,entryTime,netOverride,profitBasis:'net',positionValue,market:'us-stocks',entry:100,quantity:10,multiplier:1});
assert.equal(averageDurationMinutes([trade('2026-09-21T10:00',10),trade('2026-09-21T11:00',-10)]),90);
assert.equal(averageDurationMinutes([]),null);
const enteredInRange={...trade('2026-10-01T00:10',10),'entryTime':'2026-09-30T23:50'};
const exitedInRangeOnly={...trade('2026-09-01T00:10',10),'entryTime':'2026-08-31T23:50'};
assert.deepEqual(inEntryDateRange([enteredInRange,exitedInRangeOnly],'2026-09-01','2026-09-30'),[enteredInRange],'time analytics use entry date rather than exit date for period membership');
assert.deepEqual(weekdayPnlStats([trade('2026-09-21T10:00',10),trade('2026-09-21T09:00',5),trade('2026-09-22T11:00',-8)]),[{weekday:1,net:15},{weekday:2,net:-8}]);
assert.equal(sharpeRatio([trade('2026-09-21T10:00',10),trade('2026-09-22T11:00',-10)]),0);
assert.equal(sharpeRatio([trade('2026-09-21T10:00',1),trade('2026-09-22T11:00',2),trade('2026-09-23T11:00',3)]),2,'Sharpe remains available without position-size metadata');
assert.equal(sharpeRatio([trade('2026-09-21T10:00',10),trade('2026-09-22T11:00',10)]),null,'zero variance cannot produce a finite Sharpe ratio');
assert.equal(sharpeRatio([trade('2026-09-21T10:00',10)]),null,'a single trade is insufficient for a variance estimate');
assert.equal(averageReturnPercent([trade('2026-09-21T10:00',10),trade('2026-09-22T11:00',-5)]),0.25,'expectancy return is the average per-trade return');
assert.equal(averageReturnPercent([{...trade('2026-09-21T10:00',50,null),market:'futures',multiplier:10,quantity:1}]),5,'futures percentage includes the contract multiplier');
assert.equal(averageReturnPercent([trade('2026-09-21T10:00',10,0)]),null,'expectancy percentage is unavailable without a notional value');
const rTrade=(id,netOverride,strategy='回測')=>({id,market:'crypto',currency:'USDT',exchangeSource:'bybit',symbol:'BTCUSDT',side:'long',entryTime:'2026-09-21T09:00',exitTime:'2026-09-21T10:00',timezone:'Asia/Taipei',entry:100,exit:100,quantity:1,multiplier:1,positionValue:null,fees:null,funding:null,commission:null,transactionTax:null,exchangeFee:null,clearingFee:null,settlementFee:null,regulatoryFee:null,secFee:null,finraFee:null,futuresTax:null,feeMode:'paid',netOverride,profitBasis:'net',strategy,notes:''});
assert.equal(chooseMaeMfeIntervalMinutes(30,300),1,'short holdings keep the 1-minute detail');
assert.equal(chooseMaeMfeIntervalMinutes(500,300),5,'select the finest interval that stays within the request cap');
assert.equal(chooseMaeMfeIntervalMinutes(5000,300),30,'long holdings keep 30-minute detail when it fits the cap');
assert.equal(chooseMaeMfeIntervalMinutes(360000,6000),240,'very long holdings use the largest supported interval when smaller candles exceed the request cap');
assert.equal(maeMfeIntervalLabel(240),'4h');
const oneMinuteWindow=maeMfeCandleWindow(Date.parse('2026-09-21T10:00:00Z'),Date.parse('2026-09-21T10:01:00Z'),1);
assert.deepEqual(oneMinuteWindow,{start:Date.parse('2026-09-21T10:00:00Z'),end:Date.parse('2026-09-21T10:00:00Z'),step:60_000},'an exit exactly on a candle boundary excludes the new candle');
assert.equal(maeMfeCandleInWindow(Date.parse('2026-09-21T10:00:00Z'),oneMinuteWindow),true);
assert.equal(maeMfeCandleInWindow(Date.parse('2026-09-21T10:01:00Z'),oneMinuteWindow),false,'the candle beginning at exit is never included');
const fiveMinuteWindow=maeMfeCandleWindow(Date.parse('2026-09-21T10:01:00Z'),Date.parse('2026-09-21T10:11:00Z'),5);
assert.deepEqual([fiveMinuteWindow.start,fiveMinuteWindow.end],[Date.parse('2026-09-21T10:00:00Z'),Date.parse('2026-09-21T10:10:00Z')],'coarser windows include the entry/exit buckets but not the bucket starting exactly at exit');
const expectedIntervals={bybit:['1','5','15','60','240'],bitget:['1m','5m','15m','1H','4H'],okx:['1m','5m','15m','1H','4H'],kucoin:['60','300','900','3600','14400'],bingx:['1m','5m','15m','1h','4h'],mexc:['Min1','Min5','Min15','Min60','Hour4'],binance:['1m','5m','15m','1h','4h']};
for(const [provider,codes] of Object.entries(expectedIntervals))for(const [index,minutes] of [1,5,15,60,240].entries())assert.equal(maeMfeProviderInterval(provider,minutes),codes[index],`${provider} encodes ${minutes}m using its documented interval value`);
for(const [provider,code] of Object.entries({bybit:'30',okx:'30m',binance:'30m',bingx:'30m'}))assert.equal(maeMfeProviderInterval(provider,30),code);
const strategyStats=enteredStrategyStats([
 {...rTrade('strategy-1',10,'突破、回測'),market:'crypto'},
 {...rTrade('strategy-2',10,'突破;趨勢'),market:'crypto'},
 {...rTrade('strategy-3',10,'突破'),market:'us-stocks'},
 {...rTrade('strategy-empty',10,''),market:'us-stocks'},
]);
assert.equal(hasEnteredStrategies(enteredStrategyStats([])),false,'strategy preference card stays hidden until the user records at least one strategy');
assert.equal(hasEnteredStrategies(strategyStats),true,'strategy preference card appears after a strategy is recorded');
assert.deepEqual(Object.fromEntries(strategyStats.overall.map(row=>[row.name,[row.count,row.percent]])),{'突破':[3,60],'回測':[1,20],'趨勢':[1,20]},'strategy percentages count normalized distinct entries, not trades or empty fields');
assert.equal(strategyStats.markets.find(row=>row.market==='crypto').count,4);
const aliases=enteredStrategyStats([
 {...rTrade('case-1',12,'mss、MSS、ＭＳＳ'),market:'crypto'},
 {...rTrade('case-2',12,'Mss、趨勢、停損'),market:'futures'},
 {...rTrade('case-3',12,'趋势、止损策略'),market:'crypto'},
 {...rTrade('case-4',12,'突破、突破策略、突破回測'),market:'crypto'},
]);
assert.deepEqual(Object.fromEntries(aliases.overall.map(row=>[row.name,row.count])),{MSS:2,'趨勢':2,'停損':2,'突破':1,'突破回測':1},'case, full-width, Chinese scripts and exact aliases merge without merging distinct strategies');
assert.equal(aliases.markets.find(row=>row.market==='crypto').rows.find(row=>row.name==='MSS').count,1,'aliases repeat at most once per trade and remain separated by market');
assert.equal(calculateMaeMfe({...rTrade('notional',7),quantity:0,positionValue:200},[{high:110,low:95}]).mfe,20,'visible entry notional supplies crypto size even when base quantity is absent');
assert.equal(calculateMaeMfe({...rTrade('unknown-size',7),quantity:0,positionValue:null},[{high:110,low:95}]),null,'unknown position size is never invented from realized profit');
assert.equal(strategyStats.markets.find(row=>row.market==='us-stocks').rows[0].name,'突破');
const excursion=calculateMaeMfe({...rTrade('mae-1',null),fees:1,entry:100,exit:105,quantity:2},[{high:110,low:95}]);
assert.deepEqual({mae:excursion.mae,mfe:excursion.mfe,actual:excursion.actual},{mae:-10,mfe:20,actual:9},'MAE/MFE are excursions while actual result includes paid fees');
const shortExcursion=calculateMaeMfe({...rTrade('mae-2',null),side:'short',entry:100,exit:95,quantity:2},[{high:104,low:90}]);
assert.deepEqual({mae:shortExcursion.mae,mfe:shortExcursion.mfe},{mae:-8,mfe:20},'short-side adverse/favorable movement uses reversed signs');
const positionValueExcursion=calculateMaeMfe({...rTrade('mae-3',null),positionValue:1000,entry:100,quantity:1},[{high:101,low:99}]);
assert.deepEqual({mae:positionValueExcursion.mae,mfe:positionValueExcursion.mfe},{mae:-10,mfe:10},'crypto excursion size follows saved position value like crypto P&L');
const fingerprintSource=rTrade('fingerprint',3),fingerprint=maeMfeFingerprint([fingerprintSource]);
assert.notEqual(maeMfeFingerprint([{...fingerprintSource,side:'short'}]),fingerprint,'changing the trade side invalidates cached MAE/MFE');
assert.notEqual(maeMfeFingerprint([{...fingerprintSource,timezone:'America/New_York'}]),fingerprint,'changing the trade timezone invalidates cached MAE/MFE');
assert.notEqual(maeMfeFingerprint([{...fingerprintSource,multiplier:2}]),fingerprint,'changing the contract multiplier invalidates cached MAE/MFE');
const concentration=profitConcentration([rTrade('p1',100),rTrade('p2',-50),rTrade('p3',50)]);
assert.deepEqual(concentration.map(row=>row.cumulativeNet),[100,150,100],'bar values accumulate ranked net P&L, not individual results');
assert.equal(concentration.at(-1).cumulativeNet,100,'the final cumulative bar matches total realized P&L');
assert.deepEqual(concentration.map(row=>row.signedCumulative),[100,150,-50],'winning and losing bars accumulate separately; losses stay below zero even when the period is profitable');
const split=profitConcentration([rTrade('sp1',80),rTrade('sp2',-40),rTrade('sp3',-10),rTrade('sp4',0)]);
assert.deepEqual(split.map(row=>row.signedCumulative),[80,0,-10,-50]);
assert.equal(split.at(-1).cumulativeNet,30);assert.equal(split[0].signedCumulative+split.at(-1).signedCumulative,30,'signed gain and loss totals reconcile with period net P&L');
assert.equal(concentration[0].trade.id,'p1');assert.ok(Math.abs(concentration[0].profitShare-100*2/3)<1e-10);assert.ok(Math.abs(concentration[0].cumulativeProfitShare-100*2/3)<1e-10);
assert.ok(Math.abs(concentration[1].profitShare-100/3)<1e-10);assert.equal(concentration[1].cumulativeProfitShare,100);
assert.equal(concentration[2].lossShare,100);assert.equal(concentration[2].cumulativeLossShare,100,'loss shares use their own absolute-loss denominator');
assert.equal(concentration[2].cumulativeProfitShare,100,'profit share stays complete when the sorted chart continues into losses');assert.equal(concentration[0].cumulativeLossShare,0,'loss share begins at zero before the first loss');
const profitOnly=profitConcentration([rTrade('po1',30),rTrade('po2',70)]);assert.equal(profitOnly[1].cumulativeProfitShare,100);assert.equal(profitOnly[0].lossShare,null);
const lossOnly=profitConcentration([rTrade('lo1',-25),rTrade('lo2',-75)]);assert.equal(lossOnly[0].lossShare,25);assert.equal(lossOnly[1].cumulativeLossShare,100);assert.equal(lossOnly[0].profitShare,null);
assert.deepEqual(lossOnly.map(row=>row.cumulativeNet),[-25,-100],'losses and negative period totals accumulate with their actual signs');
const breakEven=profitConcentration([rTrade('be1',0)])[0];assert.equal(breakEven.profitShare,null);assert.equal(breakEven.lossShare,null,'break-even trades do not enter either share denominator');
const sequence=[
 {...rTrade('s1',-5),entryTime:'2026-09-21T09:00',exitTime:'2026-09-21T10:00',positionValue:1000},
 {...rTrade('s2',-4),entryTime:'2026-09-21T10:00',exitTime:'2026-09-21T11:00',positionValue:1200},
 {...rTrade('s3',-1),entryTime:'2026-09-21T11:00',exitTime:'2026-09-21T12:00',positionValue:1100},
 {...rTrade('s4',15),entryTime:'2026-09-21T12:00',exitTime:'2026-09-21T13:00',positionValue:1400},
];
const recovery=lossRecoveryStats(sequence)[0];
assert.equal(recovery.maxLosingStreak,3);
assert.equal(recovery.maxRecoveryMinutes,240,'equity recovery uses chronological realized P&L and local timezone');
assert.equal(recovery.postStreakSamples,1);
assert.equal(recovery.postStreakIncreases,0,'the first trade after two losses is compared to those prior trades, even if the loss streak continues');
const losingAfterStreak=[
 {...rTrade('l1',-2),entryTime:'2026-09-21T09:00',exitTime:'2026-09-21T09:10',positionValue:1000},
 {...rTrade('l2',-2),entryTime:'2026-09-21T09:10',exitTime:'2026-09-21T09:20',positionValue:1000},
 {...rTrade('l3',-2),entryTime:'2026-09-21T09:20',exitTime:'2026-09-21T09:30',positionValue:1200},
];
const afterLoss=lossRecoveryStats(losingAfterStreak)[0];
assert.equal(afterLoss.postStreakSamples,1,'the next trade after a losing streak is sampled even when it also loses');
assert.equal(afterLoss.postStreakIncreases,1);
console.log('Passed strategy preferences, multi-exchange candle intervals and boundaries, MAE/MFE, concentration, recovery, holding-time, Sharpe and date-range checks.');
