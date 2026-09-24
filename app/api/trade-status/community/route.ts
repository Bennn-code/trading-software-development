import { db,identity,json,failure } from '@/lib/server';
import { pnl,positionValue,type Trade } from '@/lib/trades';
import { mistakeStats } from '@/lib/trade-status';
import { currencyOptions } from '@/lib/preferences';

export async function GET(request:Request){try{
 await identity(request);const start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 const requested=new URL(request.url).searchParams.get('currency')||'auto',currency=requested==='auto'||currencyOptions.some(([code])=>code===requested)?requested:'auto';
 const result=await db().prepare('SELECT user_id,payload FROM trades WHERE exit_time>=? ORDER BY exit_time DESC LIMIT 5000').bind(start+'T00:00').all<{user_id:string;payload:string}>();
 const rows=result.results.map(r=>({userId:r.user_id,trade:JSON.parse(r.payload) as Trade})),users=[...new Set(rows.map(r=>r.userId))];
 if(users.length<3)return json({mistakes:[],profit:[],returns:[],sampleSize:users.length});
 const mistakes=mistakeStats(rows.map(r=>r.trade)).slice(0,3),byUser=new Map<string,Trade[]>();for(const row of rows)byUser.set(row.userId,[...(byUser.get(row.userId)||[]),row.trade]);
 const target=currency==='auto'?'USD':currency;let rates:Record<string,number>={USD:1};const row=await db().prepare("SELECT payload FROM exchange_rates WHERE pair='DISPLAY_USD'").first<{payload:string}>();if(row)try{rates=(JSON.parse(row.payload) as {rates:Record<string,number>}).rates||rates;}catch{}
 if(!rates[target]||!rates.USDT){try{const response=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(7000)});if(response.ok){const payload=await response.json() as {rates?:Record<string,number>};rates={...rates,...payload.rates,USD:1};}}catch{}}
 if(!rates.USDT){try{const response=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd',{signal:AbortSignal.timeout(5000)});if(response.ok){const payload=await response.json() as {tether?:{usd?:number}};if(payload.tether?.usd)rates.USDT=1/payload.tether.usd;}}catch{}}
 rates.USDT??=1;
 const anonymous=new Map([...byUser.keys()].sort().map((id,i)=>[id,`交易者 ${String.fromCharCode(65+i%26)}${i>=26?Math.floor(i/26):''}`]));
 const convert=(value:number,from:string)=>{const a=rates[from],b=rates[target];return Number.isFinite(a)&&a>0&&Number.isFinite(b)&&b>0?value/a*b:(from===target?value:null);};
 const rawProfit=[...byUser].map(([userId,trades])=>({userId,currency:target,value:trades.reduce((sum,t)=>sum+(convert(pnl(t),t.currency)??0),0)}));
 const profit=rawProfit.filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,5).map(x=>({label:anonymous.get(x.userId)||'交易者',value:Math.round(x.value*100)/100,currency:x.currency}));
 const returns=[...byUser].map(([userId,trades])=>{const denominator=trades.reduce((s,t)=>s+(positionValue(t)>0?convert(positionValue(t),t.currency)??0:0),0),numerator=trades.reduce((s,t)=>s+(convert(pnl(t),t.currency)??0),0);return{userId,value:denominator?numerator/denominator*100:0};}).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,5).map(x=>({label:anonymous.get(x.userId)||'交易者',value:Math.round(x.value*100)/100}));
 return json({mistakes,profit,returns,sampleSize:users.length});
 }catch(e){return failure(e);}}
