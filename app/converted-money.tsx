'use client';
import { useEffect,useState } from 'react';
import type { Trade } from '@/lib/trades';
type Quote={rates:Record<string,number>};
let cachedRates:Quote|null=null,pending:Promise<Quote|null>|null=null;
let cachedTarget:string|null=null,targetPending:Promise<string>|null=null;
function loadRates(){if(cachedRates)return Promise.resolve(cachedRates);if(pending)return pending;pending=fetch('/api/exchange-rates').then(async r=>r.ok?await r.json() as Quote:null).then(value=>cachedRates=value).finally(()=>{pending=null});return pending;}
function loadTarget(){if(cachedTarget)return Promise.resolve(cachedTarget);if(targetPending)return targetPending;targetPending=fetch('/api/account').then(async r=>r.ok?await r.json():null).catch(()=>null).then(account=>{const next=account?.preferences?.baseCurrency||localStorage.getItem('trade-base-currency')||'auto';cachedTarget=next;localStorage.setItem('trade-base-currency',next);return next;}).finally(()=>{targetPending=null});return targetPending;}
export default function ConvertedMoney({amount,currency}:{amount:number;currency:Trade['currency']}){
 const [rates,setRates]=useState<Quote|null>(cachedRates),[target,setTarget]=useState('auto');
 useEffect(()=>{let active=true;const sync=async()=>{const next=await loadTarget();if(active)setTarget(next);if(next!=='auto'){const value=await loadRates();if(active)setRates(value);}};void sync();const changed=(event:Event)=>{const next=(event as CustomEvent).detail?.baseCurrency;if(typeof next==='string'){cachedTarget=next;setTarget(next);localStorage.setItem('trade-base-currency',next);if(next!=='auto')void loadRates().then(value=>active&&setRates(value));}};window.addEventListener('trading-preferences',changed);return()=>{active=false;window.removeEventListener('trading-preferences',changed);};},[]);
 if(target==='auto'||target===currency||!rates?.rates[currency]||!rates.rates[target])return null;const value=amount/rates.rates[currency]*rates.rates[target];return <small className="converted-money">≈ {(value>0?'+':'')+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {target}</small>;
}
