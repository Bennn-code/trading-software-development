'use client';
import { useEffect,useState } from 'react';
import { combinedUSD,isFreshRate,type ExchangeRate } from '@/lib/exchange-rate';
import { dashboardStats } from '@/lib/dashboard';
import type { Trade } from '@/lib/trades';
export default function CombinedProfit({trades}:{trades:Trade[]}){
 const [quote,setQuote]=useState<ExchangeRate|null>(null),[now,setNow]=useState(()=>Date.now()),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;const abort=new AbortController();
  async function update(){setBusy(true);try{const response=await fetch('/api/exchange-rate',{signal:abort.signal,cache:'no-store'});const data=await response.json();if(!response.ok||!isFreshRate(data))throw new Error('匯率暫時無法更新');if(active){setQuote(data);setError('');}}catch{if(active)setError('匯率暫時無法更新');}finally{if(active){setNow(Date.now());setBusy(false);}}}
  void update();const interval=setInterval(()=>void update(),60000),tick=setInterval(()=>setNow(Date.now()),15000);
  return()=>{active=false;abort.abort();clearInterval(interval);clearInterval(tick);};
 },[refresh]);
 const usd=dashboardStats(trades.filter(t=>t.currency==='USD')).net,usdt=dashboardStats(trades.filter(t=>t.currency==='USDT')).net,total=combinedUSD(usd,usdt,quote,now),fresh=isFreshRate(quote,now);
 return <div className="combined-profit"><div className="currency-stat"><span>總獲利<small>折合 USD · 淨損益合計</small></span><strong className={total===null?'':total>=0?'positive':'negative'}>{total===null?'—':`${total>0?'+':''}${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</strong></div><p>依目前篩選 · 全部期間 · 以當前匯率換算</p>{fresh?<p className="exchange-status">1 USDT ≈ {quote.rate.toFixed(6)} USD<br/><a href="https://www.coingecko.com/en/coins/tether" target="_blank" rel="noreferrer">CoinGecko</a> · 報價 {new Date(quote.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}（台北）<br/>每分鐘更新 · 非成交時的歷史匯率{error&&<span className="exchange-warning">更新失敗，暫用上述仍有效報價。</span>}</p>:<p className="exchange-warning" role="status">{busy?'正在取得即時匯率…':'目前沒有有效匯率，USDT 暫無法換算。'}{total!==null&&' 目前合計不需要換算。'}</p>}<button className="text-button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{busy?'更新中…':'更新匯率'}</button></div>;
}
