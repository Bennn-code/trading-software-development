import { pnl,stats,type Trade } from './trades';
export type CurrencyFilter='all'|Trade['currency'];
export const currencyForMarket=(market:string):CurrencyFilter=>market==='futures'?'USD':market==='crypto'?'USDT':'all';
export function selectMarket(trades:Trade[],market:string,currency:string){return trades.filter(t=>(market==='all'||t.market===market)&&(currency==='all'||t.currency===currency));}
export function recordsForScope(trades:Trade[],{month,scope='month',start='',end='',day='',query=''}:{month:string;scope?:'month'|'all'|'range';start?:string;end?:string;day?:string;query?:string}){
 return trades.filter(t=>(scope==='all'||(scope==='range'?t.exitTime.slice(0,10)>=start&&t.exitTime.slice(0,10)<=end:t.exitTime.startsWith(month)))&&(!day||t.exitTime.startsWith(day))&&[t.symbol,t.strategy,t.account].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.exitTime.localeCompare(a.exitTime));
}
export function currencyGroups(trades:Trade[],currency:CurrencyFilter){return (currency==='all'?['USD','USDT'] as const:[currency]).map(unit=>({currency:unit,trades:trades.filter(t=>t.currency===unit)}));}
export function dashboardStats(trades:Trade[]){
 const summary=stats(trades),sorted=[...trades].sort((a,b)=>pnl(b)-pnl(a)||a.exitTime.localeCompare(b.exitTime)||a.id.localeCompare(b.id));
 return {...summary,net:trades.reduce((s,t)=>s+Math.round(pnl(t)*100),0)/100,best:sorted[0]??null,worst:sorted.at(-1)??null,winLossRatio:summary.avgLoss?summary.avgWin/Math.abs(summary.avgLoss):null};
}
export function busiestDay(trades:Trade[]){
 const days=new Map<string,Trade[]>();for(const t of trades){const date=t.exitTime.slice(0,10);days.set(date,[...(days.get(date)||[]),t]);}
 const top=[...days].sort((a,b)=>b[1].length-a[1].length||b[0].localeCompare(a[0]))[0];
 return top?{date:top[0],trades:top[1],ties:[...days.values()].filter(t=>t.length===top[1].length).length}:null;
}
