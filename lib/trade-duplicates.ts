import { convertWallTime } from './display-currency';
import { isFuturesMarket,pnl,positionValue,type Trade } from './trades';

export type TradeDuplicate={tradeId:string;matchIds:string[];count:number;step:number;fingerprint:string};

const validTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const minute=(value:string,timezone='Asia/Taipei')=>{
 if(!validTime.test(value))return null;
 try{return convertWallTime(value,timezone,'UTC').slice(0,16);}catch{return value.slice(0,16);}
};

/** Return an indexed local-time scan range wide enough to find the same UTC
 * minute stored in any supported civil timezone (UTC-12 through UTC+14). */
export function tradeExitScanRange(trade:Trade):[string,string]|null{
 const value=minute(trade.exitTime,trade.timezone);
 if(!value)return null;
 const timestamp=Date.parse(`${value}:00Z`);
 if(!Number.isFinite(timestamp))return null;
 const radius=26*60*60*1000;
 return [new Date(timestamp-radius).toISOString().slice(0,16),new Date(timestamp+radius+60_000).toISOString().slice(0,16)];
}
function stableNumber(value:number){const normalized=Number(value.toPrecision(12));return Object.is(normalized,-0)?0:normalized;}

// A duplicate is the same market/instrument with matching entry and exit
// minutes, entry and exit prices, and displayed net P/L. Quantity is not
// required because screenshots often omit it; when P/L must be calculated,
// however, the size inputs must be present. Account separation is enforced by
// the server query's user/profile scope.
export function tradeMatchKey(trade:Trade):string|null{
 const symbol=trade.symbol?.trim().toUpperCase(),entryTime=minute(trade.entryTime,trade.timezone),exitTime=minute(trade.exitTime,trade.timezone);
 if(!symbol||!trade.market||!trade.currency||!entryTime||!exitTime||![trade.entry,trade.exit].every(value=>Number.isFinite(value)&&value>0))return null;
 if(trade.netOverride==null){
  const size=trade.market==='crypto'&&trade.positionValue!=null?positionValue(trade):trade.quantity;
  if(!Number.isFinite(size)||size<=0||(isFuturesMarket(trade.market)&&(!Number.isFinite(trade.multiplier)||trade.multiplier<=0)))return null;
 }
 const profit=pnl(trade);
 if(!Number.isFinite(profit))return null;
 return JSON.stringify([trade.market,symbol,entryTime,exitTime,stableNumber(trade.entry),stableNumber(trade.exit),profit]);
}

export function findTradeMatches(candidates:Trade[],existing:Trade[]){
 const byKey=new Map<string,string[]>(),savedIds=new Set(existing.map(trade=>trade.id));
 for(const trade of existing){const key=tradeMatchKey(trade);if(key)byKey.set(key,[...(byKey.get(key)??[]),trade.id]);}
 return candidates.flatMap(trade=>{
  if(savedIds.has(trade.id))return [];
  const key=tradeMatchKey(trade);if(!key)return [];
  const matches=byKey.get(key)??[];byKey.set(key,[...matches,trade.id]);
  return matches.length?[{tradeId:trade.id,matchIds:[...matches].sort(),count:matches.length}]:[];
 });
}
