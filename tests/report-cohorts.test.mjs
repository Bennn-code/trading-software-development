import { build } from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';

const entry = String.raw`
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TradeStatus from './app/trade-status';
import { LanguageProvider } from './app/language-provider';
import { initialLocaleResources } from './lib/initial-locale-resources.server';
import { displayTrades, convertWallTime } from './lib/display-currency';
import { reportPeriod } from './lib/report-period';
import { weekBounds } from './lib/periods';
import { reportTradeCohorts, holdingMinutes, averageHoldingMinutes, reportObservationCutoff, currentLossStreaks } from './lib/report-cohorts';
import { realizedDrawdownStats, tradeTimestamp } from './lib/trade-performance';
import { holdingTimeStats } from './lib/trade-status';
import { pnl } from './lib/trades';

const base={id:'fixture',market:'us-stocks',currency:'USD',symbol:'AAPL',side:'long',account:'fixture',timezone:'Asia/Taipei',entryTime:'2026-09-27T23:50',exitTime:'2026-09-28T00:20',entry:100,exit:101,quantity:1,multiplier:1,fees:null,funding:null,netOverride:100,profitBasis:'net',strategy:'MSS',notes:'',imageId:null};
const taipei=value=>Date.parse(value+'+08:00');
const now=taipei('2027-01-10T12:00:00');
const ids=rows=>rows.map(row=>row.id);
const cohort=(rows,range,zone='Asia/Taipei',time=now)=>reportTradeCohorts(displayTrades(rows,zone),rows,range,zone,time);
const crossCases=[
 {kind:'week',entryTime:'2026-09-27T23:50',exitTime:'2026-09-28T00:20'},
 {kind:'month',entryTime:'2026-09-30T23:50',exitTime:'2026-10-01T00:20'},
 {kind:'quarter',entryTime:'2026-09-30T23:50',exitTime:'2026-10-01T00:20'},
 {kind:'year',entryTime:'2026-12-31T23:50',exitTime:'2027-01-01T00:20'},
];
for(const item of crossCases){
 const trade={...base,...item,id:item.kind};
 const entered=reportPeriod(item.kind,item.entryTime.slice(0,10),{});
 const closed=reportPeriod(item.kind,item.exitTime.slice(0,10),{});
 const early=cohort([trade],entered),late=cohort([trade],closed);
 assert.deepEqual(ids(early.selected),[],item.kind+' P&L is not assigned to entry period');
 assert.deepEqual(ids(early.timeSelected),[trade.id],item.kind+' entry cohort retains the known later exit');
 assert.deepEqual(ids(late.selected),[trade.id]);
 assert.deepEqual(ids(late.timeSelected),[]);
 assert.equal(pnl(late.quoteTrades[0]),100,'entire net P&L belongs to exit period without proration');
 assert.equal(holdingMinutes(trade),30,'full duration crosses period boundaries');
}
assert.deepEqual(weekBounds('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'},'crossing year does not necessarily cross Monday/Sunday week');
const yearTrade={...base,entryTime:'2026-12-31T23:50',exitTime:'2027-01-01T00:20'};
assert.deepEqual(ids(cohort([yearTrade],{start:'2027-01-01',end:'2027-01-31'},'America/New_York').selected),[],'viewer timezone moves the exit to December');
assert.deepEqual(ids(cohort([yearTrade],{start:'2026-12-01',end:'2026-12-31'},'America/New_York').selected),[base.id]);
assert.equal(averageHoldingMinutes([yearTrade]),30);
const historical=[
 {...base,id:'peak',entryTime:'2026-12-01T09:00',exitTime:'2026-12-01T10:00',netOverride:100},
 {...base,id:'old-loss',entryTime:'2026-12-31T09:00',exitTime:'2026-12-31T10:00',netOverride:-50},
 {...base,id:'partial-recovery',entryTime:'2027-01-01T09:00',exitTime:'2027-01-01T10:00',netOverride:20},
 {...base,id:'later-recovery',entryTime:'2027-01-05T09:00',exitTime:'2027-01-05T10:00',netOverride:30},
];
const firstDay=cohort(historical,{start:'2027-01-01',end:'2027-01-01'});
assert.deepEqual(ids(firstDay.historyTrades),['peak','old-loss','partial-recovery'],'historical cutoff excludes later recovery');
assert.equal(realizedDrawdownStats(firstDay.quoteTrades,firstDay.observedAt)[0].maxDrawdown,0,'selected period profit has no period drawdown');
const history=realizedDrawdownStats(firstDay.historyTrades,firstDay.observedAt)[0];
assert.equal(history.currentDrawdown,30,'previous-year drawdown survives a profitable new year');
assert.equal(history.currentRecoveryStart,taipei('2026-12-01T10:00:00'));
assert.equal(history.maxRecoveryMinutes,null,'future completed recovery is not yet known at historical cutoff');
assert.equal(realizedDrawdownStats(cohort(historical,{start:'2027-01-01',end:'2027-01-05'}).historyTrades,taipei('2027-01-05T23:59:59.999'))[0].currentDrawdown,0);
const quiet=cohort(historical,{start:'2027-01-02',end:'2027-01-02'});
assert.equal(quiet.selected.length,0);
assert.equal(realizedDrawdownStats(quiet.historyTrades,quiet.observedAt)[0].currentDrawdown,30,'no exits this period still has historical ongoing drawdown');
const losses=[{...historical[1],id:'loss-1'},{...historical[2],id:'loss-2',netOverride:-10}];
assert.equal(currentLossStreaks(cohort(losses,{start:'2027-01-01',end:'2027-01-01'}).historyTrades)[0].streak,2,'ongoing streak continues across years');
assert.equal(currentLossStreaks([...losses,{...historical[3],netOverride:0}])[0].streak,0,'a breakeven settlement ends a losing streak');

const spring={...base,timezone:'America/New_York',entryTime:'2026-03-08T01:30',exitTime:'2026-03-08T03:30'};
assert.equal(holdingMinutes(spring),60,'spring-forward wall clock difference is two hours but elapsed duration is one');
const fall={...base,timezone:'America/New_York',entryTime:'2026-11-01T01:30:00-04:00',exitTime:'2026-11-01T01:30:00-05:00'};
assert.equal(holdingMinutes(fall),60,'explicit offsets identify the two occurrences of the repeated hour');
assert.equal(convertWallTime(fall.entryTime,fall.timezone,'UTC'),'2026-11-01T05:30');
assert.equal(convertWallTime(fall.exitTime,fall.timezone,'UTC'),'2026-11-01T06:30');
assert.equal(convertWallTime('2027-01-01T00:20:00+08:00','UTC','America/New_York'),'2026-12-31T11:20','explicit offset overrides a default source zone');
const seconds={...base,id:'seconds',entryTime:'2026-09-28T09:00:30.250',exitTime:'2026-09-28T09:05:29.750'};
const secondsElapsed=(5*60000-500)/60000;
assert.equal(holdingMinutes(seconds),secondsElapsed,'canonical wall times retain seconds and milliseconds');
assert.deepEqual(holdingTimeStats([seconds],holdingMinutes).map(row=>row.position),[0],'a genuine duration below five minutes stays in the first v84 bucket');
const secondsOffset={...seconds,id:'offset-seconds',timezone:'UTC',entryTime:'2026-09-28T09:00:30.250+0800',exitTime:'2026-09-28T09:05:29.750+08:00'};
assert.equal(holdingMinutes(secondsOffset),secondsElapsed,'explicit offsets preserve fractional seconds and override the saved source zone');
assert.equal(holdingMinutes({...seconds,entryTime:'2026-09-28T01:00:30.250Z',exitTime:'2026-09-28T01:05:29.750Z'}),secondsElapsed,'explicit UTC instants keep the same duration');
const repeated={...fall,id:'repeated'};
const repeatedDisplay=displayTrades([repeated],'America/New_York');
assert.equal(repeatedDisplay[0].entryTime,repeatedDisplay[0].exitTime,'the repeated hour can look equal on screen');
const repeatedCohort=reportTradeCohorts(repeatedDisplay,[repeated],{start:'2026-11-01',end:'2026-11-01'},'America/New_York',now);
const repeatedRaw=repeatedCohort.timeSelected.map(row=>[repeated].find(trade=>trade.id===row.id));
assert.deepEqual(holdingTimeStats(repeatedRaw,holdingMinutes).map(row=>({position:row.position,count:row.count})),[{position:60,count:1}],'canonical lookup retains the real one-hour repeated-hour holding group');
const longHold=[48,49,50,96].map(hours=>({...base,id:'long-'+hours,entryTime:'2026-09-29T00:00:00+08:00',exitTime:new Date(taipei('2026-09-29T00:00:00')+hours*3600000).toISOString()}));
for(const zone of ['Asia/Taipei','America/New_York','UTC']){
 const crossMonth=cohort(longHold,{start:'2026-09-01',end:'2026-09-30'},zone);
 assert.equal(crossMonth.timeSelected.length,4,'entry cohort retains all settled cross-month long holds in '+zone);
 const raw=crossMonth.timeSelected.map(row=>longHold.find(trade=>trade.id===row.id));
 assert.deepEqual(holdingTimeStats(raw,holdingMinutes).map(row=>row.label),['48h','49h','50h','96h'],'v84 long buckets remain distinct after cohort/timezone integration in '+zone);
 assert.deepEqual(raw.map(holdingMinutes),[48,49,50,96].map(hours=>hours*60),'viewer timezone never changes canonical elapsed time');
}
assert.equal(holdingMinutes({...base,entryTime:'2026-09-28T00:30'}),NaN,'negative duration is unavailable, not zero');
assert.equal(holdingMinutes({...base,entryTime:'2026-02-30T12:00'}),NaN,'invalid calendar entry is unavailable');
assert.equal(averageHoldingMinutes([]),null);
for(const stamp of ['2026-02-30T10:00:00+08:00','2026-02-29T10:00:00Z','2026-09-28T24:00:00+08:00','2026-09-28T10:60:00Z','2026-09-28T10:00:60Z'])assert.equal(tradeTimestamp(stamp),NaN,'explicit offsets cannot normalize invalid calendar/clock fields: '+stamp);
const normalizedCalendar={...base,id:'invalid-offset-calendar',timezone:'UTC',entryTime:'2026-02-30T12:00:00Z',exitTime:'2026-03-02T13:00:00Z'};
assert.equal(holdingMinutes(normalizedCalendar),NaN,'an invalid offset date never turns into a valid holding length');
assert.deepEqual(cohort([normalizedCalendar],{start:'2026-03-02',end:'2026-03-02'},'UTC').timeSelected,[],'an invalid offset date cannot create a phantom entry cohort');
assert.equal(reportObservationCutoff('2026-03-08','America/New_York',now),Date.parse('2026-03-09T04:00:00Z')-1,'spring DST day lasts 23 hours');
assert.equal(reportObservationCutoff('2026-11-01','America/New_York',now),Date.parse('2026-11-02T05:00:00Z')-1,'fall DST day lasts 25 hours');
assert.equal(reportObservationCutoff('2018-11-03','America/Sao_Paulo',now),Date.parse('2018-11-04T03:00:00Z')-1,'nonexistent midnight still uses the first instant of the next local day');
const cutoff=Date.parse('2027-01-01T15:59:59.999Z');
assert.equal(reportObservationCutoff('2027-01-01','Asia/Taipei',now),cutoff);
assert.equal(reportObservationCutoff('2028-01-01','Asia/Taipei',now),now,'future period ends never admit future settlements');
const incomplete=[base,{...base,id:'future',exitTime:'2028-01-01T00:20'},{...base,id:'missing',exitTime:''},{...base,id:'bad-order',entryTime:'2026-09-29T10:00'}];
assert.deepEqual(ids(cohort(incomplete,{start:'2026-09-01',end:'2026-09-30'}).timeSelected),[base.id],'entry win-rate cohort requires settled valid durations');
const extra={...historical[0],id:'another-account',netOverride:10000};
assert.ok(!ids(reportTradeCohorts(displayTrades(historical),[...historical,extra],{start:'2027-01-01',end:'2027-01-01'},'Asia/Taipei',now).historyTrades).includes(extra.id),'canonical map cannot add another account to the displayed population');
assert.deepEqual(cohort(historical,{start:'2027-01-05',end:'2027-01-01'}).historyTrades,[],'invalid range has no historical or selected samples');

const originalNow=Date.now;Date.now=()=>now;
const render=(trades,range,locale='zh-Hant',favorites=['loss-recovery'])=>renderToStaticMarkup(<LanguageProvider initialLanguage={locale} initialResources={initialLocaleResources(locale)}><TradeStatus trades={displayTrades(trades)} analysisTrades={trades} timezone="Asia/Taipei" period="month" anchor={range.start} range={{...range,valid:true,caption:'fixture'}} favoriteIds={favorites} onToggleFavorite={()=>{}} favoritesOnly/></LanguageProvider>);
const metric=(html,label)=>html.slice(html.indexOf('<span>'+label+'</span><strong')).match(/^<span>[^<]*<\/span><strong[^>]*>([^<]*)<\/strong>/)?.[1];
try{
 const html=render(historical,{start:'2027-01-01',end:'2027-01-01'});
 assert.equal(metric(html,'本期最大回撤金額'),'0 USD');
 assert.equal(metric(html,'目前回撤金額'),'-30 USD');
 assert.ok(html.includes('本期平倉 1 筆 · 歷史平倉 3 筆'));
 assert.ok(html.includes('2026-12-01'));
 const none=render(historical,{start:'2027-01-02',end:'2027-01-02'});
 assert.equal(metric(none,'本期最大回撤金額'),'—');
 assert.equal(metric(none,'目前回撤金額'),'-30 USD');
 assert.ok(none.includes('本期平倉 0 筆 · 歷史平倉 3 筆'));
 const unknown={...historical[1],id:'unknown-pnl',entryTime:'2027-01-01T09:01',exitTime:'2027-01-01T09:30',profitBasis:'gross',netOverride:null,entry:NaN};
 assert.ok(!Number.isFinite(pnl(unknown)),'fixture has unavailable net P&L');
 const streakRows=[{...historical[1],id:'prior-loss'},{...historical[2],id:'new-loss',netOverride:-10},unknown];
 const streak=render(streakRows,{start:'2027-01-01',end:'2027-01-01'});
 assert.equal(metric(streak,'歷史最長連敗'),'2 筆','unknown P&L does not reset only the longest-streak population');
 assert.equal(metric(streak,'目前延續連敗'),'2 筆','ongoing and maximum streaks use the same valid population');
 const secondSettlements=[
  {...base,id:'a',timezone:'UTC',entryTime:'2026-09-28T09:00:00Z',exitTime:'2026-09-28T10:00:10Z',netOverride:-1},
  {...base,id:'c',timezone:'UTC',entryTime:'2026-09-28T09:00:00Z',exitTime:'2026-09-28T10:00:20Z',netOverride:1},
  {...base,id:'b',timezone:'UTC',entryTime:'2026-09-28T09:00:00Z',exitTime:'2026-09-28T10:00:30Z',netOverride:-1},
 ];
 const chronological=render(secondSettlements,{start:'2026-09-28',end:'2026-09-28'});
 assert.equal(metric(chronological,'歷史最長連敗'),'1 筆','settlement seconds determine streak order before identifiers');
 assert.equal(metric(chronological,'目前延續連敗'),'1 筆','historical and current streaks use the same precise settlement ordering');
 const time=render([yearTrade],{start:'2026-12-01',end:'2026-12-31'},'zh-Hant',['best-worst-time']);
 assert.ok(time.includes('本期進場且已平倉 · 有效樣本 1 筆'));
 const duration=render([yearTrade],{start:'2027-01-01',end:'2027-01-31'},'zh-Hant',['market-metrics']);
 assert.ok(duration.includes('本期平倉 · 有效樣本 1 筆'),'real average holding summary labels the exit cohort');
 for(const [locale,title] of [['zh-Hant','本期最大回撤金額'],['zh-Hans','本期最大回撤金额'],['yue-Hant','本期最大回撤金額'],['en','Maximum drawdown in selected period']])assert.ok(render(historical,{start:'2027-01-01',end:'2027-01-01'},locale).includes(title),locale+' renders real new labels');
}finally{Date.now=originalNow;}
console.log('Passed cross-week/month/quarter/year cohorts, whole realized P&L, full-history recovery/streaks and historical cutoffs, canonical timezones/DST/ISO offsets, missing/invalid/future samples, account isolation and real four-language TradeStatus rendering.');
`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',outfile:'work/report-cohorts-tests.cjs',alias:{'@':process.cwd()},external:['react','react-dom','react-dom/server'],logLevel:'silent'});
createRequire(import.meta.url)(path.resolve('work/report-cohorts-tests.cjs'));
