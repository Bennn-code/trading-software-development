import { db,identity,json,failure } from '@/lib/server';
import { pnl,positionValue,type Trade } from '@/lib/trades';
import { mistakeStats } from '@/lib/trade-status';

export async function GET(request:Request){try{
 await identity(request);const start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 const result=await db().prepare('SELECT user_id,payload FROM trades WHERE exit_time>=? ORDER BY exit_time DESC LIMIT 5000').bind(start+'T00:00').all<{user_id:string;payload:string}>();
 const rows=result.results.map(r=>({userId:r.user_id,trade:JSON.parse(r.payload) as Trade})),users=[...new Set(rows.map(r=>r.userId))];
 if(users.length<3)return json({mistakes:[],profit:[],returns:[],sampleSize:users.length});
 const mistakes=mistakeStats(rows.map(r=>r.trade)).slice(0,3),byUser=new Map<string,Trade[]>();for(const row of rows)byUser.set(row.userId,[...(byUser.get(row.userId)||[]),row.trade]);
 const profit=[...byUser].flatMap(([userId,trades])=>[...new Set(trades.map(t=>t.currency))].map(currency=>({userId,value:trades.filter(t=>t.currency===currency).reduce((s,t)=>s+pnl(t),0),currency}))).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,5).map((x,i)=>({label:`交易者 ${String.fromCharCode(65+i)}`,value:Math.round(x.value*100)/100,currency:x.currency}));
 const returns=[...byUser].map(([userId,trades])=>{const valid=trades.filter(t=>positionValue(t)>0);return{userId,value:valid.length?valid.reduce((s,t)=>s+pnl(t)/positionValue(t)*100,0)/valid.length:0};}).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,5).map((x,i)=>({label:`交易者 ${String.fromCharCode(65+i)}`,value:Math.round(x.value*100)/100}));
 return json({mistakes,profit,returns,sampleSize:users.length});
 }catch(e){return failure(e);}}
