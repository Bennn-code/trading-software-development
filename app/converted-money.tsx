'use client';
import { useEffect,useState } from 'react';
import type { Trade } from '@/lib/trades';
type Quote={rates:Record<string,number>};
let quote:Quote|null=null,pending:Promise<Quote|null>|null=null;
function load(){if(quote)return Promise.resolve(quote);if(pending)return pending;pending=fetch('/api/exchange-rates').then(r=>r.ok?r.json():null).then(rates=>{const target=localStorage.getItem('trade-base-currency')||'auto';if(!rates||target==='auto')return null;quote={...rates,target} as Quote&{target:string};return quote;}).finally(()=>{pending=null});return pending;}
export default function ConvertedMoney({amount,currency}:{amount:number;currency:Trade['currency']}){const [data,setData]=useState<(Quote&{target?:string})|null>(quote);useEffect(()=>{void load().then(setData)},[]);const target=data?.target;if(!target||target===currency||!data?.rates[currency]||!data.rates[target])return null;const value=amount/data.rates[currency]*data.rates[target];return <small className="converted-money">≈ {(value>0?'+':'')+value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {target}</small>}
