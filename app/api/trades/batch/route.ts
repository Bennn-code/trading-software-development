import { z } from 'zod';
import { db,identity,json,failure,ApiError } from '@/lib/server';
import { tradeSchema, tradeIssueMessage } from '@/lib/validation';
export async function POST(request:Request){try{
 const owner=await identity(request,true);const raw=await request.text();if(raw.length>800000)throw new ApiError('匯入資料過大');let input;try{input=JSON.parse(raw);}catch{throw new ApiError('匯入資料格式不正確');}
 const parsed=z.object({trades:z.array(tradeSchema).min(1).max(50)}).safeParse(input);if(!parsed.success){const issue=parsed.error.issues[0];const row=typeof issue.path[1]==='number'?`第 ${issue.path[1]+1} 筆：`:'';throw new ApiError(row+tradeIssueMessage(issue));}
 const trades=parsed.data.trades;if(new Set(trades.map(t=>t.id)).size!==trades.length)throw new ApiError('同批匯入含重複交易，請重新檢查');
 const database=db();for(const imageId of new Set(trades.map(t=>t.imageId).filter(Boolean))){if(!await database.prepare('SELECT id FROM images WHERE id = ? AND user_id = ?').bind(imageId,owner).first())throw new ApiError('無法存取交易截圖',403);}
 const existing=await database.prepare(`SELECT id,user_id FROM trades WHERE id IN (${trades.map(()=>'?').join(',')})`).bind(...trades.map(t=>t.id)).all<{id:string;user_id:string}>();
 if(existing.results.some(t=>t.user_id!==owner))throw new ApiError('無法存取其中一筆交易',403);
 const at=new Date().toISOString();const result=await database.batch(trades.map(t=>database.prepare('INSERT INTO trades (id,user_id,exit_time,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(t.id,owner,t.exitTime,JSON.stringify(t),at)));
 const saved=result.reduce((n,r)=>n+(r.meta.changes??0),0);return json({saved,skipped:trades.length-saved,ids:trades.map(t=>t.id)});
 }catch(e){return failure(e);}}
