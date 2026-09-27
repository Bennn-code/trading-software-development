import { pnl,type Trade } from './trades';

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
export function durationMinutes(t:Trade){return Math.max(0,(new Date(t.exitTime).getTime()-new Date(t.entryTime).getTime())/60000);}
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
  const notional=trade.positionValue??trade.entry*trade.quantity*(trade.market==='futures'?trade.multiplier:1);
  if(!Number.isFinite(notional)||notional<=0)return[];
  const value=pnl(trade)/notional*100;
  return Number.isFinite(value)?[value]:[];
 });
 return returns.length?returns.reduce((sum,value)=>sum+value,0)/returns.length:null;
}
