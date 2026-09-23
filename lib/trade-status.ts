import { pnl,type Trade } from './trades';

export const mistakeRules=[
 ['追價／FOMO',/追價|fomo|怕錯過|急著進場/i],['違反交易計畫',/違反|沒有遵守|未遵守|偏離計畫|計畫外/i],['停損執行',/移動停損|未設停損|沒有停損|不肯停損|扛單/i],['倉位過大',/倉位過大|部位過大|重倉|過度槓桿/i],['過度交易',/過度交易|頻繁交易|做太多|連續下單/i],['情緒交易',/情緒|報復交易|上頭|衝動/i],['過早進出',/太早進|過早進|太早出|過早出/i]
] as const;
export const strategyRules=[
 ['趨勢／突破',/趨勢|突破|順勢/i],['回測／支撐阻力',/回測|支撐|壓力|供需/i],['區間／反轉',/區間|反轉|均值回歸/i],['風險控制',/停損|風險|倉位|部位/i],['耐心等待',/等待|耐心|確認|訊號完整/i]
] as const;
export function dateDaysAgo(days:number){const d=new Date();d.setDate(d.getDate()-days);return d.toISOString().slice(0,10);}
export function mistakeStats(trades:Trade[]){const total=Math.max(trades.length,1);return mistakeRules.map(([name,re])=>{const count=trades.filter(t=>re.test(`${t.strategy} ${t.notes}`)).length;return{name,count,percent:count/total*100};}).filter(x=>x.count).sort((a,b)=>b.count-a.count);}
export function strategyStats(trades:Trade[]){const hits=strategyRules.map(([name,re])=>({name,count:trades.filter(t=>re.test(`${t.strategy} ${t.notes}`)).length})).filter(x=>x.count),total=hits.reduce((s,x)=>s+x.count,0);return hits.map(x=>({...x,percent:total?x.count/total*100:0})).sort((a,b)=>b.count-a.count);}
export function durationMinutes(t:Trade){return Math.max(0,(new Date(t.exitTime).getTime()-new Date(t.entryTime).getTime())/60000);}
export function winRate(rows:Trade[]){return rows.length?rows.filter(t=>pnl(t)>0).length/rows.length*100:0;}
export function bucketStats<T extends string>(trades:Trade[],bucket:(t:Trade)=>T){const map=new Map<T,Trade[]>();for(const t of trades){const key=bucket(t);map.set(key,[...(map.get(key)||[]),t]);}return [...map].map(([name,rows])=>({name,count:rows.length,winRate:winRate(rows)})).filter(x=>x.count).sort((a,b)=>b.count-a.count);}
export function disciplineRate(trades:Trade[]){if(!trades.length)return 0;return trades.filter(t=>/計畫|規則|停損|等待|紀律|風險|倉位|確認/i.test(`${t.strategy} ${t.notes}`)).length/trades.length*100;}
export function overtradeRate(trades:Trade[]){const by=new Map<string,number>();for(const t of trades)by.set(t.exitTime.slice(0,10),(by.get(t.exitTime.slice(0,10))||0)+1);return by.size?[...by.values()].filter(n=>n>3).length/by.size*100:0;}
export function averageLoss(trades:Trade[]){const losses=trades.map(pnl).filter(n=>n<0);return losses.length?losses.reduce((s,n)=>s+n,0)/losses.length:0;}
