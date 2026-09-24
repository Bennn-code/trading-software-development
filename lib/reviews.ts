import { z } from 'zod';
import { reportPeriod, validDate, type DateRange, type ReportPeriod } from './report-period';
import { pnl, feeCost, type Trade } from './trades';

const date=z.string().refine(s=>validDate(s)&&s>='1900-01-01'&&s<='2200-12-31','日期格式不正確');
const reviewSelectionFields=z.object({kind:z.enum(['week','month','quarter','year','custom']),date,start:date.optional(),end:date.optional()});
function validateReviewSelection(value:z.infer<typeof reviewSelectionFields>,ctx:z.RefinementCtx){if(value.kind==='custom'&&(!value.start||!value.end||value.start>value.end))ctx.addIssue({code:z.ZodIssueCode.custom,path:['start'],message:'請選擇有效的自訂日期範圍'});}
export const reviewSelection=reviewSelectionFields.superRefine(validateReviewSelection);
export const reviewSaveSelection=reviewSelectionFields.extend({strategy:z.string().max(5000).optional(),reflection:z.string().max(10000).optional(),action:z.enum(['save','generate'])}).superRefine(validateReviewSelection);
export type ReviewKind=ReportPeriod;
export function reviewBounds(kind:ReviewKind,anchor:string,custom?:DateRange){
 const parsed=reviewSelection.parse({kind,date:anchor,start:custom?.start,end:custom?.end});
 const range=reportPeriod(parsed.kind,parsed.date,{start:parsed.start??parsed.date,end:parsed.end??parsed.date});
 if(!range.valid)throw new Error('日期範圍不正確');
 return {start:range.start,end:range.end};
}
export const summarySchema=z.object({overview:z.string().max(3000),strategySummary:z.string().max(4000),reflectionSummary:z.string().max(4000),strengths:z.array(z.string().max(1200)).max(6),improvements:z.array(z.string().max(1200)).max(6),nextSteps:z.array(z.string().max(1200)).max(6)});
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
