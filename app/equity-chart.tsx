'use client';
import { useId } from 'react';
import { pnl,type Trade } from '@/lib/trades';
export default function Equity({trades,start,end}:{trades:Trade[];start:string;end:string}){
 const areaId=useId(),sorted=[...trades].sort((a,b)=>a.exitTime.localeCompare(b.exitTime));let cents=0;
 const vals=[0,...sorted.map(t=>(cents+=Math.round(pnl(t)*100))/100)],total=cents/100;
 const min=Math.min(...vals,0),max=Math.max(...vals,0),padding=Math.max((max-min)*.1,1),low=min-padding,high=max+padding,span=high-low;
 const y=(v:number)=>185-(v-low)/span*145,zero=y(0),points=vals.map((v,i)=>`${65+i/Math.max(vals.length-1,1)*625},${y(v)}`);
 const area=`M${points.join(' L')} L${sorted.length?690:65},${zero} L65,${zero} Z`;
 return <div className="equity-chart"><svg viewBox="0 0 720 225" role="img" aria-label={`${start} 至 ${end}累積淨損益 ${total.toFixed(2)}，零線以上綠色、以下紅色`}><defs>
 <clipPath id={`${areaId}-above`}><rect x="60" y="0" width="640" height={zero}/></clipPath><clipPath id={`${areaId}-below`}><rect x="60" y={zero} width="640" height={225-zero}/></clipPath>
 <linearGradient id={`${areaId}-gain`} gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2={zero}><stop className="gain-stop" offset="0%" stopOpacity=".4"/><stop className="gain-stop" offset="100%" stopOpacity=".025"/></linearGradient>
 <linearGradient id={`${areaId}-loss`} gradientUnits="userSpaceOnUse" x1="0" y1={zero} x2="0" y2="185"><stop className="loss-stop" offset="0%" stopOpacity=".025"/><stop className="loss-stop" offset="100%" stopOpacity=".4"/></linearGradient>
 </defs>{[low,high].map(value=><g key={value}><line x1="65" x2="690" y1={y(value)} y2={y(value)} stroke="#e7eceb" strokeDasharray="4 5"/><text x="0" y={y(value)+4} fill="#87938f" fontSize="11">{Math.round(value).toLocaleString('en-US',{notation:Math.abs(value)>=100000?'compact':'standard'})}</text></g>)}
 <g clipPath={`url(#${areaId}-above)`}><path d={area} fill={`url(#${areaId}-gain)`}/><polyline className="equity-gain-line" points={points.join(' ')} fill="none" strokeWidth="2.8" strokeLinejoin="round"/></g>
 <g clipPath={`url(#${areaId}-below)`}><path d={area} fill={`url(#${areaId}-loss)`}/><polyline className="equity-loss-line" points={points.join(' ')} fill="none" strokeWidth="2.8" strokeLinejoin="round"/></g>
 <line className="equity-zero-line" x1="65" x2="690" y1={zero} y2={zero} stroke="#738a80" strokeWidth="1.3" strokeDasharray="6 5"/><text x="0" y={zero+4} fill="#526e60" fontSize="12" fontWeight="600">0</text>{sorted.length>0&&<circle className={total<0?'equity-loss-dot':'equity-gain-dot'} cx="690" cy={y(total)} r="4" stroke="white" strokeWidth="2"/>}<text x="65" y="218" fontSize="11" fill="#87938f">{start}</text><text x="370" y="218" textAnchor="middle" fontSize="11" fill="#87938f">期間內依出場時間累計</text><text x="690" y="218" textAnchor="end" fontSize="11" fill="#87938f">{end}</text></svg>{!trades.length&&<p className="chart-empty">所選期間尚無交易。</p>}</div>;
}
