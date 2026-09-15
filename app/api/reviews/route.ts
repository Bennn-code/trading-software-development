import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db, identity, json, failure, ApiError } from '@/lib/server';
import { emptyReview, reviewSelection, reviewBounds, reviewFingerprint, type ReviewRecord } from '@/lib/reviews';
import { generateReview } from '@/lib/review-ai';
import type { Trade } from '@/lib/trades';

async function load(owner:string,kind:string,start:string){
 const row=await db().prepare('SELECT payload FROM reviews WHERE user_id = ? AND kind = ? AND start_date = ?').bind(owner,kind,start).first<{payload:string}>();
 return row?JSON.parse(row.payload) as ReviewRecord:emptyReview();
}
async function tradesIn(owner:string,start:string,end:string){
 const result=await db().prepare('SELECT payload FROM trades WHERE user_id = ? AND exit_time >= ? AND exit_time <= ? ORDER BY exit_time').bind(owner,start+'T00:00',end+'T23:59').all<{payload:string}>();
 return result.results.map(r=>JSON.parse(r.payload) as Trade);
}
async function save(owner:string,kind:string,start:string,record:ReviewRecord){
 await db().prepare('INSERT INTO reviews (user_id,kind,start_date,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,kind,start_date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(owner,kind,start,JSON.stringify(record),new Date().toISOString()).run();
}
export async function GET(request:Request){try{
 const owner=await identity(request),params=new URL(request.url).searchParams;
 const parsed=reviewSelection.safeParse({kind:params.get('kind'),date:params.get('date')});if(!parsed.success)throw new ApiError('請選擇有效的總結期間與日期。');
 const {kind,date}=parsed.data,{start,end}=reviewBounds(kind,date),record=await load(owner,kind,start),trades=await tradesIn(owner,start,end);
 return json({record,stale:!!record.summary&&record.sourceFingerprint!==await reviewFingerprint(trades,record.strategy,record.reflection),available:!!env.OPENAI_API_KEY});
 }catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const owner=await identity(request,true);const raw=await request.text();if(raw.length>25000)throw new ApiError('心得內容過長。');
 let input;try{input=JSON.parse(raw);}catch{throw new ApiError('心得格式不正確。');}
 const parsed=reviewSelection.extend({strategy:z.string().max(5000),reflection:z.string().max(10000),action:z.enum(['save','generate'])}).safeParse(input);if(!parsed.success)throw new ApiError('請確認期間、日期與心得長度。');
 const {kind,date,strategy,reflection,action}=parsed.data,{start,end}=reviewBounds(kind,date),record={...await load(owner,kind,start),strategy,reflection};
 await save(owner,kind,start,record); // Preserve writing even if the provider subsequently fails.
 const trades=await tradesIn(owner,start,end),fingerprint=await reviewFingerprint(trades,strategy,reflection);
 if(action==='generate'){
  if(!env.OPENAI_API_KEY)throw new ApiError('心得已儲存，AI 服務尚未連線。',503);
  if(!trades.length)throw new ApiError('心得已儲存；這個期間沒有已平倉交易，請先新增紀錄。');
  let summary;try{summary=await generateReview({key:env.OPENAI_API_KEY,model:env.OPENAI_VISION_MODEL||'gpt-4.1',kind,start,end,trades,strategy,reflection});}catch(e){throw new ApiError(e instanceof Error?e.message:'AI 總結失敗',502);}
  const latest=await load(owner,kind,start);
  if(latest.strategy!==strategy||latest.reflection!==reflection)throw new ApiError('心得已在另一頁更新；本次 AI 結果未覆蓋新內容，請重新載入。',409);
  record.summary=summary;record.generatedAt=new Date().toISOString();record.sourceFingerprint=fingerprint;await save(owner,kind,start,record);
 }
 return json({record,stale:!!record.summary&&record.sourceFingerprint!==fingerprint});
 }catch(e){return failure(e);}}
