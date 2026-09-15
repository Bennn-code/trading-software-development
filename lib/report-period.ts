import { weekBounds } from './periods';
import type { Trade } from './trades';
export type ReportPeriod = 'week'|'month'|'quarter'|'year'|'custom';
export type DateRange = {start:string;end:string};
const iso=(date:Date)=>date.toISOString().slice(0,10);
export function validDate(value:string){const d=new Date(`${value}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+d)&&iso(d)===value;}
export function reportPeriod(kind:ReportPeriod,anchor:string,custom:DateRange){
 if(kind==='custom'){const valid=validDate(custom.start)&&validDate(custom.end)&&custom.start<=custom.end;return {...custom,valid,label:'自訂日期',caption:'所選期間'};}
 const d=new Date(`${anchor}T00:00:00Z`),y=d.getUTCFullYear(),m=d.getUTCMonth();
 if(kind==='week'){
  const range=weekBounds(anchor),thursday=new Date(`${range.start}T00:00:00Z`);thursday.setUTCDate(thursday.getUTCDate()+3);
  const week=Math.ceil(thursday.getUTCDate()/7),ordinal=['一','二','三','四','五'][week-1];
  return {...range,valid:true,label:`${thursday.getUTCFullYear()}/${thursday.getUTCMonth()+1}月第${ordinal}週`,caption:'本週'};
 }
 const startMonth=kind==='year'?0:kind==='quarter'?Math.floor(m/3)*3:m;
 const months=kind==='year'?12:kind==='quarter'?3:1;
 return {start:iso(new Date(Date.UTC(y,startMonth,1))),end:iso(new Date(Date.UTC(y,startMonth+months,0))),valid:true,label:kind==='year'?`${y}年`:kind==='quarter'?`${y}年第${['一','二','三','四'][Math.floor(m/3)]}季`:`${y}/${m+1}`,caption:kind==='year'?'本年':kind==='quarter'?'本季':'本月'};
}
export function shiftPeriod(kind:ReportPeriod,anchor:string,step:number){
 const d=new Date(`${anchor}T00:00:00Z`);
 if(kind==='week')d.setUTCDate(d.getUTCDate()+step*7);
 else if(kind!=='custom'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step*(kind==='year'?12:kind==='quarter'?3:1));}
 return iso(d);
}
export function inDateRange(trades:Trade[],range:DateRange){return trades.filter(t=>t.exitTime.slice(0,10)>=range.start&&t.exitTime.slice(0,10)<=range.end);}
