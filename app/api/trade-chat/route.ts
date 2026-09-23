import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { activeProfile } from '@/lib/profiles';
import { answerTradeQuestion } from '@/lib/trade-chat';
import { ApiError,db,failure,identity,json } from '@/lib/server';
import { enforceRateLimit,recordSecurityEvent } from '@/lib/security';
import type { Trade } from '@/lib/trades';

export async function POST(request:Request){try{
 const owner=await identity(request,true);await enforceRateLimit(request,{scope:'trade-chat',limit:30,windowSeconds:3600,subject:owner});const profile=await activeProfile(owner),raw=await request.text();if(raw.length>5000)throw new ApiError('問題內容過長。');const parsed=z.object({question:z.string().trim().min(1).max(2000)}).safeParse(JSON.parse(raw));if(!parsed.success)throw new ApiError('請輸入 2,000 字以內的問題。');if(!env.OPENAI_CHAT_API_KEY)throw new ApiError('交易分析聊天尚未連線。',503);
 const result=await db().prepare('SELECT payload FROM trades WHERE user_id=? AND profile_id=? ORDER BY exit_time DESC LIMIT 500').bind(owner,profile).all<{payload:string}>(),trades=result.results.map(r=>JSON.parse(r.payload) as Trade);
 const answer=await answerTradeQuestion({key:env.OPENAI_CHAT_API_KEY,model:env.OPENAI_CHAT_MODEL||'gpt-4.1',question:parsed.data.question,trades});await recordSecurityEvent(request,'trade_chat_used',owner,{tradeCount:trades.length});return json({answer});
 }catch(e){return failure(e);}}
