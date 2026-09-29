import { pnl,stats,type Trade } from './trades';
export type CurrencyFilter='all'|Trade['currency'];
export const currencyForMarket=(market:string):CurrencyFilter=>market==='futures'||market==='us-stocks'?'USD':market==='tw-index-futures'||market==='tw-stocks'?'TWD':market==='crypto'?'USDT':market==='cn-stocks'?'CNY':market==='hk-stocks'?'HKD':'all';
export function selectMarket(trades:Trade[],market:string,currency:string){return trades.filter(t=>(market==='all'||t.market===market)&&(currency==='all'||t.currency===currency));}
export function recordsForScope(trades:Trade[],{month,scope='month',start='',end='',day='',query=''}:{month:string;scope?:'month'|'all'|'range';start?:string;end?:string;day?:string;query?:string}){
 return trades.filter(t=>(scope==='all'||(scope==='range'?t.exitTime.slice(0,10)>=start&&t.exitTime.slice(0,10)<=end:t.exitTime.startsWith(month)))&&(!day||t.exitTime.startsWith(day))&&[t.symbol,t.strategy,t.account].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.exitTime.localeCompare(a.exitTime));
}
export function currencyGroups(trades:Trade[],currency:CurrencyFilter){const grouped=new Map<Trade['currency'],Trade[]>();for(const trade of trades){if(currency!=='all'&&trade.currency!==currency)continue;const rows=grouped.get(trade.currency);if(rows)rows.push(trade);else grouped.set(trade.currency,[trade]);}const units=currency==='all'?[...grouped.keys()]:[currency];return units.map(unit=>({currency:unit,trades:grouped.get(unit)??[]})).filter(group=>currency!=='all'||group.trades.length>0);}
export function dashboardStats(trades:Trade[]){
 const summary=stats(trades),compare=(a:Trade,b:Trade)=>pnl(b)-pnl(a)||a.exitTime.localeCompare(b.exitTime)||a.id.localeCompare(b.id);let best:Trade|null=null,worst:Trade|null=null;
 for(const trade of trades){if(!best||compare(trade,best)<0)best=trade;if(!worst||compare(trade,worst)>0)worst=trade;}
 return {...summary,net:trades.reduce((s,t)=>s+Math.round(pnl(t)*100),0)/100,best,worst,winLossRatio:summary.avgLoss?summary.avgWin/Math.abs(summary.avgLoss):null};
}
export function busiestDay(trades:Trade[]){
 const days=new Map<string,Trade[]>();for(const trade of trades){const date=trade.exitTime.slice(0,10),rows=days.get(date);if(rows)rows.push(trade);else days.set(date,[trade]);}
 let date='',top:Trade[]|null=null,ties=0;for(const [day,rows] of days){if(rows.length>(top?.length??0)){date=day;top=rows;ties=1;}else if(rows.length===top?.length){ties++;if(day>date){date=day;top=rows;}}}
 return top?{date,trades:top,ties}:null;
}
