import { pnl, type Trade } from './trades';

export type ExchangeRates={rates:Record<string,number>;updatedAt:number;provider?:string;stale?:boolean};

export function convertAmount(value:number,from:string,to:string,rates:Record<string,number>){
 const fromRate=rates[from],toRate=rates[to];
 if(!Number.isFinite(fromRate)||!Number.isFinite(toRate)||fromRate<=0||toRate<=0)return null;
 return Math.round(value/fromRate*toRate*100)/100;
}

export function displayTrades(trades:Trade[],target:string,rates:Record<string,number>|null){
 if(target==='auto'||!rates)return trades;
 return trades.map(trade=>{
  const converted=convertAmount(pnl(trade),trade.currency,target,rates);
  if(converted===null)return trade;
  return {...trade,currency:target as Trade['currency'],netOverride:converted,profitBasis:'net' as const,commission:null,transactionTax:null,fees:null,funding:null};
 });
}
