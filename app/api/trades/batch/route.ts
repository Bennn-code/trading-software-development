import { z } from 'zod';
import { db,identity,json,failure,ApiError } from '@/lib/server';
import { tradeSchema, tradeIssueMessage } from '@/lib/validation';
import { checkTradeDuplicates } from '@/lib/trade-duplicate-server';
import { duplicateInfo } from '@/lib/image-duplicates';
import { enforceRateLimit } from '@/lib/security';
import { activeProfile } from '@/lib/profiles';
export async function POST(request:Request){try{
 const owner=await identity(request,true),profile=await activeProfile(owner);await enforceRateLimit(request,{scope:'trade-batch',limit:20,windowSeconds:3600,subject:owner});const raw=await request.text();if(raw.length>800000)throw new ApiError('匯入資料過大');let input;try{input=JSON.parse(raw);}catch{throw new ApiError('匯入資料格式不正確');}
 const parsed=z.object({trades:z.array(tradeSchema).min(1).max(50)}).safeParse(input);if(!parsed.success){const issue=parsed.error.issues[0];const row=typeof issue.path[1]==='number'?`第 ${issue.path[1]+1} 筆：`:'';throw new ApiError(row+tradeIssueMessage(issue));}
 const trades=parsed.data.trades;if(new Set(trades.map(t=>t.id)).size!==trades.length)throw new ApiError('同批匯入含重複交易，請重新檢查');
 const database=db();for(const imageId of new Set(trades.map(t=>t.imageId).filter(Boolean))){if(!await database.prepare('SELECT id FROM images WHERE id = ? AND user_id = ?').bind(imageId,owner).first())throw new ApiError('無法存取交易截圖',403);}
 const existing=await database.prepare(`SELECT id,user_id FROM trades WHERE id IN (${trades.map(()=>'?').join(',')})`).bind(...trades.map(t=>t.id)).all<{id:string;user_id:string}>();
 if(existing.results.some(t=>t.user_id!==owner))throw new ApiError('無法存取其中一筆交易',403);
 for(const imageId of new Set(trades.map(t=>t.imageId).filter((id):id is string=>!!id))){const duplicate=await duplicateInfo(owner,imageId);if(duplicate.count&&duplicate.step<2)return json({error:'這張截圖已有交易紀錄，尚未完成兩次重複加入確認。',duplicate,imageId},409);}
 const tradeDuplicates=(await checkTradeDuplicates(owner,trades)).filter(d=>d.step<2);if(tradeDuplicates.length)return json({error:'部分交易已存在，請逐筆完成兩次重複錄入確認或略過。',tradeDuplicates},409);
 const at=new Date().toISOString();const result=await database.batch(trades.map(t=>database.prepare('INSERT INTO trades (id,user_id,profile_id,exit_time,payload,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(t.id,owner,profile,t.exitTime,JSON.stringify(t),at)));
 const saved=result.reduce((n,r)=>n+(r.meta.changes??0),0);return json({saved,skipped:trades.length-saved,ids:trades.map(t=>t.id)});
 }catch(e){return failure(e);}}
