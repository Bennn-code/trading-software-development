import { grossPnl,positionValue,type Trade } from './trades';
export type TradeDuplicate={tradeId:string;matchIds:string[];count:number;step:number;fingerprint:string};
// Compare stored values without rounding prices or P/L. Missing essential values are not evidence of a duplicate.
export function tradeMatchKey(t:Trade):string|null{
 const time=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)?s+':00':s;
 if(!t.symbol?.trim()||![t.entryTime,t.exitTime].every(s=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(s)))return null;
 const size=t.market==='crypto'?positionValue(t):t.quantity;
 if(![t.entry,t.exit,size].every(n=>Number.isFinite(n)&&n>0))return null;
 const profit=t.netOverride??grossPnl(t),basis=t.netOverride!=null?(t.profitBasis??'net'):'gross';
 if(!Number.isFinite(profit))return null;
 return JSON.stringify([t.market,t.currency,t.symbol.trim().toUpperCase(),t.side,time(t.entryTime),time(t.exitTime),t.entry,t.exit,size,profit,basis]);
}
export function findTradeMatches(candidates:Trade[],existing:Trade[]){
 const byKey=new Map<string,string[]>(),savedIds=new Set(existing.map(t=>t.id));
 for(const t of existing){const key=tradeMatchKey(t);if(key)byKey.set(key,[...(byKey.get(key)??[]),t.id]);}
 return candidates.flatMap(t=>{
  if(savedIds.has(t.id))return [];
  const key=tradeMatchKey(t);if(!key)return [];
  const matches=byKey.get(key)??[];byKey.set(key,[...matches,t.id]);
  return matches.length?[{tradeId:t.id,matchIds:[...matches].sort(),count:matches.length}]:[];
 });
}
