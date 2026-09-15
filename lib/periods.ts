import { pnl, type Trade } from './trades';

export function weekBounds(date:string) {
 const day=new Date(`${date}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)throw new Error('日期格式不正確');
 const monday=new Date(day.getTime()-((day.getUTCDay()+6)%7)*86400000);
 return {start:monday.toISOString().slice(0,10),end:new Date(monday.getTime()+6*86400000).toISOString().slice(0,10)};
}

export function periodSummary(trades:Trade[],date:string,market:string,currency:Trade['currency']) {
 const week=weekBounds(date);
 const daily={net:0,count:0},weekly={net:0,count:0};
 for(const trade of trades){
  if(trade.currency!==currency||(market!=='all'&&trade.market!==market))continue;
  // Stored timestamps have already been normalized to Taipei time at entry/import.
  const closedOn=trade.exitTime.slice(0,10),cents=Math.round(pnl(trade)*100);
  if(closedOn===date){daily.net+=cents;daily.count++;}
  if(closedOn>=week.start&&closedOn<=week.end){weekly.net+=cents;weekly.count++;}
 }
 daily.net/=100;weekly.net/=100;
 return {daily,weekly,week};
}
