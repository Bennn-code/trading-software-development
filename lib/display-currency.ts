import { type Trade } from './trades';

export type ExchangeRates={rates:Record<string,number>;updatedAt:number;provider?:string;stale?:boolean;pricingVersion?:number;usdtUpdatedAt?:number};

export function convertAmount(value:number,from:string,to:string,rates:Record<string,number>){
 const fromRate=rates[from],toRate=rates[to];
 if(!Number.isFinite(fromRate)||!Number.isFinite(toRate)||fromRate<=0||toRate<=0)return null;
 return Math.round(value/fromRate*toRate*100)/100;
}

function parts(date:Date,timeZone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(k:string)=>Number(p.find(x=>x.type===k)?.value);return{year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};}
export function parseExplicitTimestamp(value:string):number{
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(value);
 if(!match||Number(match[2])>23||Number(match[3])>59||Number(match[4]??0)>59)return NaN;
 const day=Date.parse(`${match[1]}T00:00:00Z`);
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==match[1])return NaN;
 return Date.parse(value);
}
export function convertWallTime(value:string,fromZone:string,toZone:string){
 if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)){
  const instant=parseExplicitTimestamp(value);if(!Number.isFinite(instant))return value.slice(0,16);
  const out=parts(new Date(instant),toZone);return `${out.year}-${String(out.month).padStart(2,'0')}-${String(out.day).padStart(2,'0')}T${String(out.hour).padStart(2,'0')}:${String(out.minute).padStart(2,'0')}`;
 }
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);if(!m||fromZone===toZone)return value.slice(0,16);const target=[+m[1],+m[2],+m[3],+m[4],+m[5]],wall=Date.UTC(target[0],target[1]-1,target[2],target[3],target[4]);let instant=wall;
 for(let i=0;i<5;i++){const p=parts(new Date(instant),fromZone),represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);instant+=wall-represented;}
 const out=parts(new Date(instant),toZone);return `${out.year}-${String(out.month).padStart(2,'0')}-${String(out.day).padStart(2,'0')}T${String(out.hour).padStart(2,'0')}:${String(out.minute).padStart(2,'0')}`;
}
export function displayTrades(trades:Trade[],timeZone?:string){
 return trades.map(trade=>{const toZone=timeZone||trade.timezone||'Asia/Taipei',fromZone=trade.timezone||'Asia/Taipei';return {...trade,entryTime:convertWallTime(trade.entryTime,fromZone,toZone),exitTime:convertWallTime(trade.exitTime,fromZone,toZone),timezone:toZone};});
}
