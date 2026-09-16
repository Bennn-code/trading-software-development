'use client';
import { useI18n } from './language-provider';
import { CalendarDays,ChevronLeft,ChevronRight } from 'lucide-react';
import { reportPeriod,type ReportPeriod,type DateRange } from '@/lib/report-period';
const options:[ReportPeriod,string][]=[['week','週'],['month','月'],['quarter','季'],['year','年'],['custom','自訂義']];
export default function ReportPeriodPicker({kind,anchor,custom,onKind,onCustom,onMove,onCalendar,compact=false}:{kind:ReportPeriod;anchor:string;custom:DateRange;onKind:(kind:ReportPeriod)=>void;onCustom:(range:DateRange)=>void;onMove:(step:number)=>void;onCalendar?:()=>void;compact?:boolean}){
 const {t:tx}=useI18n();

 const range=reportPeriod(kind,anchor,custom);
 return <div className={`report-picker ${compact?'compact':''}`}><div className="report-period-title">{kind!=='custom'&&<button className="metric-icon" aria-label={tx("上一個期間")} onClick={()=>onMove(-1)}><ChevronLeft size={17}/></button>}<div><div className="report-period-label">{onCalendar&&<button className="metric-icon" aria-label={tx("查看此期間損益日曆")} onClick={onCalendar}><CalendarDays size={17}/></button>}<strong>{tx(range.label)}</strong></div>{range.valid&&<small>{range.start} ～ {range.end}</small>}</div>{kind!=='custom'&&<button className="metric-icon" aria-label={tx("下一個期間")} onClick={()=>onMove(1)}><ChevronRight size={17}/></button>}</div><div className="report-tabs" role="group" aria-label={tx("統計期間")}>{options.map(([value,label])=><button key={value} aria-pressed={kind===value} onClick={()=>onKind(value)}>{tx(label)}</button>)}</div>{kind==='custom'&&<div className="custom-date-range"><label>{tx("開始日期")}<input type="date" aria-label={tx("開始日期")} value={custom.start} onChange={e=>onCustom({...custom,start:e.target.value})}/></label><span>{tx("至")}</span><label>{tx("結束日期")}<input type="date" aria-label={tx("結束日期")} value={custom.end} onChange={e=>onCustom({...custom,end:e.target.value})}/></label>{!range.valid&&<p role="alert">{tx("請選擇有效日期，結束日期不可早於開始日期。")}</p>}</div>}</div>;
}
