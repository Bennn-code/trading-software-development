'use client';
import { useI18n } from './language-provider';
import { useEffect,useState } from 'react';
import { combinedUSD,isFreshRate,RATE_MAX_AGE_MS,type ExchangeRate } from '@/lib/exchange-rate';
import { dashboardStats } from '@/lib/dashboard';
import type { Trade } from '@/lib/trades';
export default function CombinedProfit({trades}:{trades:Trade[]}){
 const {t:tx}=useI18n();

 const [quote,setQuote]=useState<ExchangeRate|null>(null),[busy,setBusy]=useState(true),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{let active=true,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  async function update(){setBusy(true);try{const r=await fetch('/api/exchange-rate',{signal:abort.signal,cache:'no-store'}),data=await r.json();if(!r.ok||!isFreshRate(data))throw new Error();if(active){setQuote(data);timer=setTimeout(()=>void update(),Math.max(1000,data.updatedAt+RATE_MAX_AGE_MS-Date.now()+1000));}}catch{if(active){setQuote(null);timer=setTimeout(()=>void update(),5*60*1000);}}finally{if(active){setNow(Date.now());setBusy(false);}}}
  void update();return()=>{active=false;abort.abort();clearTimeout(timer);};
 },[]);
 if(!trades.some(t=>t.currency==='USD'||t.currency==='USDT'))return null;
 const usd=dashboardStats(trades.filter(t=>t.currency==='USD')).net,usdt=dashboardStats(trades.filter(t=>t.currency==='USDT')).net,total=combinedUSD(usd,usdt,quote,now);
 const hint=quote?tx("每小時匯率：1 USDT ≈ ")+quote.rate.toFixed(6)+tx(" USD；CoinGecko 報價 ")+new Date(quote.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):tx("匯率暫不可用");
 return <div className="combined-profit"><div className="currency-stat" title={hint}><span>{tx("總獲利（USD）")}</span><strong className={total===null?'':total>=0?'positive':'negative'}>{total===null?'—':(total>0?'+':'')+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>{total===null&&<p className="exchange-warning" role="status">{busy?tx("正在取得匯率…"):tx("匯率暫不可用，稍後自動重試。")}</p>}</div>;
}

