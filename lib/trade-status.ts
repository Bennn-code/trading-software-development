import { isFuturesMarket, pnl,type Trade } from './trades';
import { convertWallTime } from './display-currency';
import { Converter } from 'opencc-js/t2cn';

export function bestDayShare(bestNet:number,dailyNetValues:number[]){
 const positiveDailyNet=dailyNetValues.reduce((sum,value)=>sum+Math.max(value,0),0);
 return bestNet>0&&positiveDailyNet>0?Math.min(100,bestNet/positiveDailyNet*100):null;
}
export function holdingTimeBucket(minutes:number){
 const duration=Math.min(48*60,Math.max(0,minutes));
 return duration<60?Math.floor(duration/5)*5:Math.min(48*60,60+Math.floor((duration-60)/60)*60);
}
export function holdingTimeLabel(position:number){return position<60?`${position}–${position+5}m`:`${position/60}h`;}

export const mistakeRules=[
 ['追價／FOMO',/追價|fomo|怕錯過|急著進場/i],['違反交易計畫',/違反|沒有遵守|未遵守|偏離計畫|計畫外/i],['停損執行',/移動停損|未設停損|沒有停損|不肯停損|扛單/i],['倉位過大',/倉位過大|部位過大|重倉|過度槓桿/i],['過度交易',/過度交易|頻繁交易|做太多|連續下單/i],['情緒交易',/情緒|報復交易|上頭|衝動/i],['過早進出',/太早進|過早進|太早出|過早出/i]
] as const;
export const strategyRules=[
 ['趨勢／突破',/趨勢|突破|順勢/i],['回測／支撐阻力',/回測|支撐|壓力|供需/i],['區間／反轉',/區間|反轉|均值回歸/i],['風險控制',/停損|風險|倉位|部位/i],['耐心等待',/等待|耐心|確認|訊號完整/i]
] as const;
export function dateDaysAgo(days:number){const d=new Date();d.setDate(d.getDate()-days);return d.toISOString().slice(0,10);}
export function inEntryDateRange(trades:Trade[],start:string,end:string){return trades.filter(trade=>trade.entryTime.slice(0,10)>=start&&trade.entryTime.slice(0,10)<=end);}
export function mistakeStats(trades:Trade[]){const total=Math.max(trades.length,1);return mistakeRules.map(([name,re])=>{const count=trades.filter(t=>re.test(`${t.strategy} ${t.notes}`)).length;return{name,count,percent:count/total*100};}).filter(x=>x.count).sort((a,b)=>b.count-a.count);}
export function strategyStats(trades:Trade[]){const hits=strategyRules.map(([name,re])=>({name,count:trades.filter(t=>re.test(`${t.strategy} ${t.notes}`)).length})).filter(x=>x.count),total=hits.reduce((s,x)=>s+x.count,0);return hits.map(x=>({...x,percent:total?x.count/total*100:0})).sort((a,b)=>b.count-a.count);}
export type EnteredStrategyRow={name:string;count:number;percent:number};
export type EnteredStrategyGroup={market:Trade['market'];count:number;rows:EnteredStrategyRow[]};
export type EnteredStrategyStats={overall:EnteredStrategyRow[];markets:EnteredStrategyGroup[]};
const strategyChinese=Converter({from:'tw',to:'cn'});
// Exact spelling variants only; modifiers (e.g. a breakout retest) remain distinct.
const strategyAliases:Record<string,string>={'止损':'停損','停损':'停損','止损策略':'停損','停损策略':'停損','突破策略':'突破','突破交易':'突破','突破':'突破','回测策略':'回測','回测':'回測','反转策略':'反轉','反转':'反轉','顺势策略':'順勢','顺势':'順勢'};
export function normalizeStrategyName(value:string){
 const label=value.normalize('NFKC').trim().replace(/\s+/g,' '),key=strategyChinese(label).toLocaleLowerCase('en-US');
 const alias=strategyAliases[key];return {key:alias?strategyChinese(alias):key,name:alias??(/^[a-z]{1,5}$/i.test(label)?label.toUpperCase():label)};
}
function enteredStrategyNames(value:string){const names=new Map<string,{key:string;name:string}>();for(const text of value.split(/[、,，;；\n]+/)){const name=normalizeStrategyName(text);if(name.key&&!names.has(name.key))names.set(name.key,name);}return [...names.values()];}
function strategyRows(counts:Map<string,number>):EnteredStrategyRow[]{const total=[...counts.values()].reduce((sum,count)=>sum+count,0);return [...counts].map(([name,count])=>({name,count,percent:total?count/total*100:0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
export function enteredStrategyStats(trades:Trade[]):EnteredStrategyStats{
 const overall=new Map<string,number>(),markets=new Map<Trade['market'],Map<string,number>>(),labels=new Map<string,string>();
 for(const trade of trades){const names=enteredStrategyNames(trade.strategy||'');if(!names.length)continue;let market=markets.get(trade.market);if(!market){market=new Map();markets.set(trade.market,market);}for(const item of names){if(!labels.has(item.key))labels.set(item.key,item.name);const name=labels.get(item.key)!;overall.set(name,(overall.get(name)||0)+1);market.set(name,(market.get(name)||0)+1);}}
 return{overall:strategyRows(overall),markets:[...markets].map(([market,counts])=>({market,count:[...counts.values()].reduce((sum,value)=>sum+value,0),rows:strategyRows(counts)})).sort((a,b)=>a.market.localeCompare(b.market))};
}
export function hasEnteredStrategies(stats:EnteredStrategyStats){return stats.overall.length>0;}
function utcMillis(value:string,timezone='Asia/Taipei'){try{return Date.parse(`${convertWallTime(value,timezone,'UTC')}:00Z`);}catch{return NaN;}}
export function durationMinutes(t:Trade){return Math.max(0,(utcMillis(t.exitTime,t.timezone)-utcMillis(t.entryTime,t.timezone))/60000);}
export function averageDurationMinutes(trades:Trade[]){const values=trades.map(durationMinutes).filter(Number.isFinite);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
export function weekdayPnlStats(trades:Trade[]){
 const totals=new Map<number,number>();
 for(const trade of trades){const date=trade.exitTime.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();totals.set(weekday,(totals.get(weekday)||0)+pnl(trade));}
 return [...totals].map(([weekday,net])=>({weekday,net})).sort((a,b)=>a.weekday-b.weekday);
}
export function sharpeRatio(trades:Trade[]){
 const outcomes=trades.map(pnl).filter(Number.isFinite);
 if(outcomes.length<2)return null;
 const mean=outcomes.reduce((sum,value)=>sum+value,0)/outcomes.length;
 const deviation=Math.sqrt(outcomes.reduce((sum,value)=>sum+(value-mean)**2,0)/(outcomes.length-1));
 return deviation>0?mean/deviation:null;
}
export function winRate(rows:Trade[]){return rows.length?rows.filter(t=>pnl(t)>0).length/rows.length*100:0;}
export function bucketStats<T extends string>(trades:Trade[],bucket:(t:Trade)=>T){const map=new Map<T,Trade[]>();for(const t of trades){const key=bucket(t);map.set(key,[...(map.get(key)||[]),t]);}return [...map].map(([name,rows])=>({name,count:rows.length,winRate:winRate(rows)})).filter(x=>x.count).sort((a,b)=>b.count-a.count);}
export function disciplineRate(trades:Trade[]){if(!trades.length)return 0;return trades.filter(t=>/計畫|規則|停損|等待|紀律|風險|倉位|確認/i.test(`${t.strategy} ${t.notes}`)).length/trades.length*100;}
export function averageLoss(trades:Trade[]){const losses=trades.map(pnl).filter(n=>n<0);return losses.length?losses.reduce((s,n)=>s+n,0)/losses.length:0;}
export function averagePnl(trades:Trade[]){return trades.length?trades.reduce((sum,trade)=>sum+pnl(trade),0)/trades.length:0;}
export function averageReturnPercent(trades:Trade[]){
 const returns=trades.flatMap(trade=>{
  const notional=trade.positionValue??trade.entry*trade.quantity*(isFuturesMarket(trade.market)?trade.multiplier:1);
  if(!Number.isFinite(notional)||notional<=0)return[];
  const value=pnl(trade)/notional*100;
  return Number.isFinite(value)?[value]:[];
 });
 return returns.length?returns.reduce((sum,value)=>sum+value,0)/returns.length:null;
}

export type LossRecoveryStat={market:Trade['market'];currency:Trade['currency'];count:number;maxLosingStreak:number;maxRecoveryMinutes:number|null;currentRecoveryMinutes:number|null;postStreakSamples:number;postStreakIncreases:number};
function positionSize(trade:Trade){return Number.isFinite(trade.positionValue)&&trade.positionValue!>0?{value:trade.positionValue!,unit:'notional' as const}:Number.isFinite(trade.quantity)&&trade.quantity>0?{value:trade.quantity,unit:'quantity' as const}:null;}
export function lossRecoveryStats(trades:Trade[]):LossRecoveryStat[]{
 const groups=new Map<string,Trade[]>();
 for(const trade of trades){const key=`${trade.market}|${trade.currency}`;groups.set(key,[...(groups.get(key)??[]),trade]);}
 return [...groups.values()].map(rows=>{
  rows.sort((a,b)=>utcMillis(a.exitTime,a.timezone)-utcMillis(b.exitTime,b.timezone)||utcMillis(a.entryTime,a.timezone)-utcMillis(b.entryTime,b.timezone)||(a.id??'').localeCompare(b.id??''));
  let equity=0,peak=0,peakTime=rows.length?utcMillis(rows[0].entryTime,rows[0].timezone):0,streak=0,maxLosingStreak=0,drawdownStart:number|null=null,maxRecoveryMinutes:number|null=null,currentRecoveryMinutes:number|null=null;
  for(const trade of rows){const value=pnl(trade),exit=utcMillis(trade.exitTime,trade.timezone);if(value<0){streak++;maxLosingStreak=Math.max(maxLosingStreak,streak);}else streak=0;equity+=value;
   if(equity<peak&&drawdownStart===null)drawdownStart=peakTime;
   if(equity>=peak){if(drawdownStart!==null&&Number.isFinite(exit)){const elapsed=Math.max(0,(exit-drawdownStart)/60000);maxRecoveryMinutes=maxRecoveryMinutes===null?elapsed:Math.max(maxRecoveryMinutes,elapsed);}peak=equity;peakTime=exit;drawdownStart=null;}
  }
  if(drawdownStart!==null&&rows.length){const last=utcMillis(rows[rows.length-1].exitTime,rows[rows.length-1].timezone);if(Number.isFinite(last))currentRecoveryMinutes=Math.max(0,(last-drawdownStart)/60000);}
  const symbolGroups=new Map<string,Trade[]>();for(const trade of rows)symbolGroups.set(trade.symbol,[...(symbolGroups.get(trade.symbol)??[]),trade]);
  let postStreakSamples=0,postStreakIncreases=0;
  for(const symbolRows of symbolGroups.values()){
   let losses:Trade[]=[];
   for(const trade of symbolRows){
    if(losses.length>=2){const prior=losses.map(positionSize).filter((size):size is NonNullable<typeof size>=>!!size);const next=positionSize(trade);if(next&&prior.length===losses.length&&prior.every(size=>size.unit===next.unit)){const avg=prior.reduce((sum,size)=>sum+size.value,0)/prior.length;postStreakSamples++;if(next.value>avg*1.05)postStreakIncreases++;}losses=[];}
    if(pnl(trade)<0)losses.push(trade);else losses=[];
   }
  }
  return{market:rows[0].market,currency:rows[0].currency,count:rows.length,maxLosingStreak,maxRecoveryMinutes,currentRecoveryMinutes,postStreakSamples,postStreakIncreases};
 }).sort((a,b)=>a.market.localeCompare(b.market)||a.currency.localeCompare(b.currency));
}

export type ProfitConcentrationPoint={index:number;trade:Trade;net:number;cumulativeNet:number;signedCumulative:number;profitShare:number|null;cumulativeProfitShare:number|null;lossShare:number|null;cumulativeLossShare:number|null};
export function profitConcentration(trades:Trade[]):ProfitConcentrationPoint[]{
 const ordered=[...trades].map(trade=>({trade,net:pnl(trade)})).filter(item=>Number.isFinite(item.net)).sort((a,b)=>b.net-a.net||a.trade.exitTime.localeCompare(b.trade.exitTime));
 const positiveTotal=ordered.reduce((sum,item)=>sum+Math.max(0,item.net),0),negativeTotal=ordered.reduce((sum,item)=>sum+Math.max(0,-item.net),0);let cumulativeProfit=0,cumulativeLoss=0,cumulativeNet=0;
 return ordered.map((item,index)=>{
  cumulativeNet+=item.net;
  if(item.net>0){cumulativeProfit+=item.net;return{index:index+1,trade:item.trade,net:item.net,cumulativeNet,signedCumulative:cumulativeProfit,profitShare:positiveTotal>0?item.net/positiveTotal*100:null,cumulativeProfitShare:positiveTotal>0?cumulativeProfit/positiveTotal*100:null,lossShare:null,cumulativeLossShare:negativeTotal>0?0:null};}
  if(item.net<0){const loss=Math.abs(item.net);cumulativeLoss+=loss;return{index:index+1,trade:item.trade,net:item.net,cumulativeNet,signedCumulative:-cumulativeLoss,profitShare:null,cumulativeProfitShare:positiveTotal>0?100:null,lossShare:negativeTotal>0?loss/negativeTotal*100:null,cumulativeLossShare:negativeTotal>0?cumulativeLoss/negativeTotal*100:null};}
  return{index:index+1,trade:item.trade,net:item.net,cumulativeNet,signedCumulative:0,profitShare:null,cumulativeProfitShare:positiveTotal>0?cumulativeProfit/positiveTotal*100:null,lossShare:null,cumulativeLossShare:negativeTotal>0?0:null};
 });
}

export type CandleRange={high:number;low:number};
export type MaeMfeProvider='bybit'|'bitget'|'okx'|'kucoin'|'bingx'|'mexc'|'binance';
export const maeMfeIntervals=[
 {minutes:1,label:'1m'},
 {minutes:5,label:'5m'},
 {minutes:15,label:'15m'},
 {minutes:30,label:'30m'},
 {minutes:60,label:'1h'},
 {minutes:240,label:'4h'},
] as const;
const maeMfeProviderIntervalCodes:Record<MaeMfeProvider,Record<number,string>>={
 bybit:{1:'1',5:'5',15:'15',30:'30',60:'60',240:'240'},
 bitget:{1:'1m',5:'5m',15:'15m',60:'1H',240:'4H'},
 okx:{1:'1m',5:'5m',15:'15m',30:'30m',60:'1H',240:'4H'},
 kucoin:{1:'60',5:'300',15:'900',60:'3600',240:'14400'},
 bingx:{1:'1m',5:'5m',15:'15m',30:'30m',60:'1h',240:'4h'},
 mexc:{1:'Min1',5:'Min5',15:'Min15',60:'Min60',240:'Hour4'},
 binance:{1:'1m',5:'5m',15:'15m',30:'30m',60:'1h',240:'4h'},
};
export function maeMfeIntervalLabel(minutes:number){return maeMfeIntervals.find(interval=>interval.minutes===minutes)?.label??`${minutes}m`;}
export function maeMfeProviderInterval(provider:MaeMfeProvider,minutes:number){return maeMfeProviderIntervalCodes[provider][minutes]??null;}
export function chooseMaeMfeIntervalMinutes(durationMinutes:number,maxCandles:number){
 const duration=Math.max(0,durationMinutes),capacity=Math.max(1,Math.floor(maxCandles));
 return maeMfeIntervals.find(interval=>Math.ceil(duration/interval.minutes)+2<=capacity)?.minutes??maeMfeIntervals[maeMfeIntervals.length-1].minutes;
}
export type MaeMfeCandleWindow={start:number;end:number;step:number};
export function maeMfeCandleWindow(entryMs:number,exitMs:number,intervalMinutes:number):MaeMfeCandleWindow|null{
 if(!Number.isFinite(entryMs)||!Number.isFinite(exitMs)||!Number.isFinite(intervalMinutes)||exitMs<=entryMs||intervalMinutes<=0)return null;
 const step=intervalMinutes*60_000;
 return{start:Math.floor(entryMs/step)*step,end:Math.floor((exitMs-1)/step)*step,step};
}
export function maeMfeCandleInWindow(candleTime:number,window:MaeMfeCandleWindow){return Number.isFinite(candleTime)&&candleTime>=window.start&&candleTime<=window.end;}
export function maeMfeFingerprint(trades:Trade[]){
 return JSON.stringify(trades.map(trade=>[trade.id,trade.market,trade.currency,trade.exchangeSource,trade.cryptoProductType,trade.priceSymbol,trade.symbol,trade.side,trade.entryTime,trade.exitTime,trade.timezone,trade.entry,trade.exit,trade.quantity,trade.multiplier,trade.positionValue,trade.mae,trade.mfe,pnl(trade)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
export type MaeMfeTrade=Pick<Trade,'market'|'entry'|'exit'|'quantity'|'side'|'multiplier'>&Partial<Trade>;
export function calculateMaeMfe(trade:MaeMfeTrade,candles:CandleRange[]){
 const size=trade.market==='crypto'&&trade.positionValue!=null?(trade.entry>0?trade.positionValue/trade.entry:0):trade.quantity;
 if(!candles.length||candles.some(candle=>!Number.isFinite(candle.high)||!Number.isFinite(candle.low)||candle.high<candle.low)||!Number.isFinite(size)||size<=0||!Number.isFinite(trade.entry)||trade.entry<=0||!Number.isFinite(trade.exit)||trade.exit<=0||isFuturesMarket(trade.market)&&(!Number.isFinite(trade.multiplier)||trade.multiplier<=0))return null;
 const high=Math.max(trade.entry,trade.exit,...candles.map(candle=>candle.high)),low=Math.min(trade.entry,trade.exit,...candles.map(candle=>candle.low)),quantity=(trade.market==='crypto'&&trade.positionValue!=null?(trade.entry>0?trade.positionValue/trade.entry:0):trade.quantity)*(isFuturesMarket(trade.market)?trade.multiplier:1);
 const mae=Math.min(0,trade.side==='long'?(low-trade.entry)*quantity:(trade.entry-high)*quantity);
 const mfe=Math.max(0,trade.side==='long'?(high-trade.entry)*quantity:(trade.entry-low)*quantity);
 return{mae,mfe,actual:pnl(trade as Trade),candleCount:candles.length};
}
