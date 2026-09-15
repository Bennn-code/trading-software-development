'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { localTime, marketName, type Trade } from '@/lib/trades';
import { periodSummary,weekBounds } from '@/lib/periods';

const amount=(n:number)=>(n>0?'+':'')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function PeriodSummary({trades,market,currency}:{trades:Trade[];market:string;currency:Trade['currency']}) {
 const [today,setToday]=useState(()=>localTime().slice(0,10)),[selected,setSelected]=useState('');
 useEffect(()=>{const update=()=>setToday(localTime().slice(0,10));const timer=setInterval(update,30000);window.addEventListener('focus',update);update();return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 const date=selected||today;
 const data=useMemo(()=>periodSummary(trades,date,market,currency),[trades,date,market,currency]);
 const thisWeek=weekBounds(today).start===data.week.start;
 return <section className="period-section" aria-label="每日與每週淨損益"><div className="period-heading"><div><h2>每日與每週淨損益</h2><p>依台北出場日期統計 · {market==='all'?'所有市場':marketName(market)} · {currency}</p></div><div className="period-date"><label htmlFor="period-date">查看日期</label><Input id="period-date" type="date" value={date} max={today} onChange={e=>{try{weekBounds(e.target.value);setSelected(e.target.value);}catch{ /* Keep the last valid date while a date is being edited. */ }}}/>{selected&&selected!==today&&<button className="text-button" type="button" onClick={()=>setSelected('')}>回到今天</button>}</div></div><div className="period-cards">
 <article className="metric"><div className="metric-label">{date===today?'今日':'當日'}淨損益 <CalendarDays size={18}/></div><strong className={data.daily.net<0?'negative':'positive'}>{amount(data.daily.net)}</strong><div className="metric-meta">{currency}<span>{date.replaceAll('-','/')} · {data.daily.count} 筆</span></div></article>
 <article className="metric"><div className="metric-label">{thisWeek?'本週':'該週'}淨損益 <CalendarRange size={18}/></div><strong className={data.weekly.net<0?'negative':'positive'}>{amount(data.weekly.net)}</strong><div className="metric-meta">{currency}<span>{data.week.start.replaceAll('-','/')} — {data.week.end.replaceAll('-','/')}</span></div><p className="period-week-note">週一至週日 · {data.weekly.count} 筆 · 含跨月交易</p></article>
 </div><p className="period-hint">已扣除手續費與資金費；每日／每週使用上方「查看日期」，月份篩選用於下方月度總覽。</p></section>;
}
