import { z } from 'zod';
import { weekBounds } from './periods';
import { pnl, feeCost, type Trade } from './trades';

export const reviewSelection=z.object({kind:z.enum(['week','month','year']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&s>='1900-01-01'&&s<='2200-12-31';})});
export type ReviewKind=z.infer<typeof reviewSelection>['kind'];
export function reviewBounds(kind:ReviewKind,date:string){
 reviewSelection.parse({kind,date});
 if(kind==='week')return weekBounds(date);
 if(kind==='year')return {start:date.slice(0,4)+'-01-01',end:date.slice(0,4)+'-12-31'};
 const start=date.slice(0,7)+'-01',d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);
 return {start,end:d.toISOString().slice(0,10)};
}
export const summarySchema=z.object({overview:z.string().max(3000),strengths:z.array(z.string().max(1200)).max(6),improvements:z.array(z.string().max(1200)).max(6),nextSteps:z.array(z.string().max(1200)).max(6)});
export type ReviewSummary=z.infer<typeof summarySchema>;
export type ReviewRecord={strategy:string;reflection:string;summary:ReviewSummary|null;generatedAt:string|null;sourceFingerprint:string|null};
export const emptyReview=():ReviewRecord=>({strategy:'',reflection:'',summary:null,generatedAt:null,sourceFingerprint:null});
export function reviewFacts(trades:Trade[]){
 const cents=(n:number)=>Math.round(n*100),round=(n:number)=>n/100;
 return (['USD','USDT','TWD','CNY','HKD'] as const).map(currency=>{
  const list=trades.filter(t=>t.currency===currency),wins=list.filter(t=>pnl(t)>0).length;
  const strategies=new Map<string,{count:number;netCents:number}>();
  for(const t of list){const name=t.strategy||'未分類',v=strategies.get(name)||{count:0,netCents:0};v.count++;v.netCents+=cents(pnl(t));strategies.set(name,v);}
  return {currency,unknownCostCount:list.filter(t=>t.commission==null||t.fees==null||(t.market==='tw-stocks'&&t.transactionTax==null)||(t.market==='crypto'&&t.funding==null)).length,count:list.length,net:round(list.reduce((s,t)=>s+cents(pnl(t)),0)),wins,losses:list.filter(t=>pnl(t)<0).length,winRate:list.length?Math.round(wins/list.length*10000)/100:0,commission:round(list.reduce((s,t)=>s+cents(Math.abs(t.commission??0)),0)),transactionTax:round(list.reduce((s,t)=>s+cents(Math.abs(t.transactionTax??0)),0)),fees:round(list.reduce((s,t)=>s+cents(feeCost(t)),0)),strategies:[...strategies].map(([strategy,v])=>({strategy,count:v.count,net:round(v.netCents)}))};
 });
}
export async function reviewFingerprint(trades:Trade[],strategy:string,reflection:string){
 const payload=JSON.stringify({trades:[...trades].sort((a,b)=>a.id.localeCompare(b.id)),strategy,reflection});
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
