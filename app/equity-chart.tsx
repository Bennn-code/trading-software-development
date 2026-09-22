'use client';
import { useI18n } from './language-provider';
import { useId, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pnl,type Trade } from '@/lib/trades';
export default function Equity({trades,start,end}:{trades:Trade[];start:string;end:string}){
 const {t:tx}=useI18n();

 const areaId=useId(),[hovered,setHovered]=useState<number|null>(null),sorted=[...trades].sort((a,b)=>a.exitTime.localeCompare(b.exitTime));let cents=0;
 const vals=[0,...sorted.map(t=>(cents+=Math.round(pnl(t)*100))/100)],total=cents/100;
 const min=Math.min(...vals,0),max=Math.max(...vals,0),padding=Math.max((max-min)*.1,1),low=min-padding,high=max+padding,span=high-low;
 const x=(i:number)=>65+i/Math.max(vals.length-1,1)*625,y=(v:number)=>185-(v-low)/span*145,zero=y(0),points=vals.map((v,i)=>`${x(i)},${y(v)}`);
 const area=`M${points.join(' L')} L${sorted.length?690:65},${zero} L65,${zero} Z`;
 const hover=hovered===null?null:{x:x(hovered),y:y(vals[hovered]),value:vals[hovered],date:hovered===0?start:sorted[hovered-1].exitTime.slice(0,10)};
 function move(event:ReactPointerEvent<SVGSVGElement>){if(!sorted.length)return;const box=event.currentTarget.getBoundingClientRect(),cursor=(event.clientX-box.left)/box.width*720,index=Math.round((Math.max(65,Math.min(690,cursor))-65)/625*(vals.length-1));setHovered(index);}
 return <div className="equity-chart"><svg viewBox="0 0 720 225" role="img" aria-label={tx("{0} 至 {1}累積淨損益 {2}，零線以上綠色、以下紅色", [start,end,total.toFixed(2)])} onPointerMove={move} onPointerLeave={()=>setHovered(null)}><defs>
 <clipPath id={`${areaId}-above`}><rect x="60" y="0" width="640" height={zero}/></clipPath><clipPath id={`${areaId}-below`}><rect x="60" y={zero} width="640" height={225-zero}/></clipPath>
 <linearGradient id={`${areaId}-gain`} gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2={zero}><stop className="gain-stop" offset="0%" stopOpacity=".4"/><stop className="gain-stop" offset="100%" stopOpacity=".025"/></linearGradient>
 <linearGradient id={`${areaId}-loss`} gradientUnits="userSpaceOnUse" x1="0" y1={zero} x2="0" y2="185"><stop className="loss-stop" offset="0%" stopOpacity=".025"/><stop className="loss-stop" offset="100%" stopOpacity=".4"/></linearGradient>
 </defs>{[low,high].map(value=><g key={value}><line x1="65" x2="690" y1={y(value)} y2={y(value)} stroke="#e7eceb" strokeDasharray="4 5"/><text x="0" y={y(value)+4} fill="#87938f" fontSize="11">{Math.round(value).toLocaleString('en-US',{notation:Math.abs(value)>=100000?'compact':'standard'})}</text></g>)}
 <g clipPath={`url(#${areaId}-above)`}><path d={area} fill={`url(#${areaId}-gain)`}/><polyline className="equity-gain-line" points={points.join(' ')} fill="none" strokeWidth="2.8" strokeLinejoin="round"/></g>
 <g clipPath={`url(#${areaId}-below)`}><path d={area} fill={`url(#${areaId}-loss)`}/><polyline className="equity-loss-line" points={points.join(' ')} fill="none" strokeWidth="2.8" strokeLinejoin="round"/></g>
 <line className="equity-zero-line" x1="65" x2="690" y1={zero} y2={zero} stroke="#738a80" strokeWidth="1.3" strokeDasharray="6 5"/><text x="0" y={zero+4} fill="#526e60" fontSize="12" fontWeight="600">0</text>{sorted.length>0&&<circle className={total<0?'equity-loss-dot':'equity-gain-dot'} cx="690" cy={y(total)} r="4" stroke="white" strokeWidth="2"/>}{hover&&<g className="equity-hover" pointerEvents="none"><line className="equity-hover-line" x1={hover.x} x2={hover.x} y1="34" y2="190"/><circle className={hover.value<0?'equity-loss-dot':'equity-gain-dot'} cx={hover.x} cy={hover.y} r="5" stroke="white" strokeWidth="2"/><g className="equity-tooltip" transform={`translate(${hover.x>520?hover.x-158:hover.x+10},${Math.max(10,Math.min(hover.y-57,132))})`}><rect width="148" height="49" rx="7"/><text x="11" y="19" fontSize="11">{hover.date}</text><text x="11" y="39" fontSize="14" fontWeight="700" className={hover.value<0?'equity-tooltip-loss':'equity-tooltip-gain'}>{hover.value>0?'+':''}{hover.value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</text></g></g>}<text x="65" y="218" fontSize="11" fill="#87938f">{start}</text><text x="370" y="218" textAnchor="middle" fontSize="11" fill="#87938f">{tx("期間內依出場時間累計")}</text><text x="690" y="218" textAnchor="end" fontSize="11" fill="#87938f">{end}</text></svg>{!trades.length&&<p className="chart-empty">{tx("所選期間尚無交易。")}</p>}</div>;
}
