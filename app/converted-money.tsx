'use client';
import { useEffect,useState } from 'react';
import type { Trade } from '@/lib/trades';
import { useI18n } from './language-provider';
import { getAccountBootstrap } from '@/lib/account-client';
type Quote={rates:Record<string,number>;updatedAt:number};
let cachedRates:Quote|null=null,pending:Promise<Quote|null>|null=null;
let cachedTarget:string|null=null,targetPending:Promise<string>|null=null;
function loadRates(){if(cachedRates&&Date.now()-cachedRates.updatedAt<60*60*1000)return Promise.resolve(cachedRates);if(pending)return pending;pending=fetch('/api/exchange-rates').then(async r=>r.ok?await r.json() as Quote:null).then(value=>cachedRates=value).finally(()=>{pending=null});return pending;}
function loadTarget(){if(cachedTarget)return Promise.resolve(cachedTarget);const stored=localStorage.getItem('trade-base-currency');if(stored){cachedTarget=stored;return Promise.resolve(stored);}if(targetPending)return targetPending;targetPending=getAccountBootstrap().then(account=>{const next=account?.preferences?.baseCurrency||'auto';cachedTarget=next;localStorage.setItem('trade-base-currency',next);return next;}).finally(()=>{targetPending=null});return targetPending;}
export default function ConvertedMoney({amount,currency,baseCurrency}:{amount:number;currency:Trade['currency'];baseCurrency?:string}){
 const {t}=useI18n();
 const [rates,setRates]=useState<Quote|null>(cachedRates),[target,setTarget]=useState('auto');
 useEffect(()=>{let active=true;const sync=async()=>{const next=baseCurrency??await loadTarget();if(active)setTarget(next);if(next!=='auto'){const value=await loadRates();if(active)setRates(value);}};void sync();const changed=(event:Event)=>{const next=(event as CustomEvent).detail?.baseCurrency;if(typeof next==='string'){cachedTarget=next;setTarget(next);localStorage.setItem('trade-base-currency',next);if(next!=='auto')void loadRates().then(value=>active&&setRates(value));}};window.addEventListener('trading-preferences',changed);return()=>{active=false;window.removeEventListener('trading-preferences',changed);};},[baseCurrency]);
 if(target==='auto'||target===currency||!rates?.rates[currency]||!rates.rates[target])return null;const rate=rates.rates[target]/rates.rates[currency],value=amount*rate;return <small className="converted-money"><span>≈ {(value>0?'+':'')+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {target}</span><span className="converted-rate">{t('換算匯率')} · 1 {currency} ≈ {rate.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})} {target}</span></small>;
}
