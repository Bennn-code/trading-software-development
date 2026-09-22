import { env } from 'cloudflare:workers';
import { ApiError, db } from './server';

type RateLimitOptions={scope:string;limit:number;windowSeconds:number;subject?:string};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function hash(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
function clientAddress(request:Request){return request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';}
export async function actorHash(request:Request){return hash(`${clientAddress(request)}|${request.headers.get('user-agent')?.slice(0,180)||'unknown'}`);}

export async function enforceRateLimit(request:Request,{scope,limit,windowSeconds,subject=''}:RateLimitOptions){
 const now=Math.floor(Date.now()/1000),windowStart=Math.floor(now/windowSeconds)*windowSeconds;
 const actor=await actorHash(request),subjectHash=subject?await hash(subject.trim().toLowerCase()):'';
 const key=`${scope}:${windowStart}:${actor}:${subjectHash}`;
 await db().prepare('INSERT INTO security_rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=security_rate_limits.hits+1').bind(key,windowStart+windowSeconds+300).run();
 const row=await db().prepare('SELECT hits FROM security_rate_limits WHERE key = ?').bind(key).first<{hits:number}>();
 if((row?.hits??1)>limit){await recordSecurityEvent(request,'rate_limit_blocked',null,{scope});throw new ApiError('操作太頻繁，請稍後再試。',429);}
 if(actor.endsWith('00'))db().prepare('DELETE FROM security_rate_limits WHERE expires_at < ?').bind(now).run().catch(()=>{});
}

export async function recordSecurityEvent(request:Request,eventType:string,userId:string|null,details:Record<string,unknown>={}){
 try{
  const safe=JSON.stringify(details).slice(0,1000);
  await db().prepare('INSERT INTO security_events (id,user_id,actor_hash,event_type,details,created_at) VALUES (?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),userId,await actorHash(request),eventType,safe,new Date().toISOString()).run();
 }catch(error){console.error('Security event logging failed',error);}
}

export async function verifyTurnstile(request:Request,token?:string){
 if(!env.TURNSTILE_SECRET_KEY)return;
 if(!token)throw new ApiError('請先完成人機驗證。',403);
 const body=new FormData();body.set('secret',env.TURNSTILE_SECRET_KEY);body.set('response',token);body.set('remoteip',clientAddress(request));
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});
 const result=await response.json() as {success?:boolean};
 if(!response.ok||!result.success)throw new ApiError('人機驗證未完成，請重新勾選後再試。',403);
}

export function securityEventLabel(eventType:string){
 return ({login_success:'登入成功',password_reset_requested:'已申請重設密碼',password_changed:'密碼已更新',account_exported:'已下載完整資料',account_deleted:'帳號已註銷',logout:'已登出'} as Record<string,string>)[eventType]||eventType;
}
