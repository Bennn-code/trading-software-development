import { env } from 'cloudflare:workers';
import { ApiError, db } from './server';

type RateLimitOptions={scope:string;limit:number;windowSeconds:number;subject?:string;ipLimit?:number};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function hash(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
// Cloudflare sets this header at the edge. Do not trust X-Forwarded-For here:
// a client can supply it when the request does not pass through a trusted proxy.
function clientAddress(request:Request){return request.headers.get('cf-connecting-ip')?.trim()||null;}
export async function actorHash(request:Request){return hash(clientAddress(request)||'unknown-client');}

export async function enforceRateLimit(request:Request,{scope,limit,windowSeconds,subject='',ipLimit}:RateLimitOptions){
 if(!Number.isInteger(limit)||limit<1||!Number.isInteger(windowSeconds)||windowSeconds<1||!/^[-a-zA-Z0-9:_]{1,120}$/.test(scope))throw new ApiError('安全限制設定不正確。',500);
 const now=Math.floor(Date.now()/1000),windowStart=Math.floor(now/windowSeconds),expiresAt=(windowStart+1)*windowSeconds+300;
 const ip=clientAddress(request),counters:{kind:string;value:string;limit:number}[]=[];
 counters.push({kind:ip?'ip':'missing-ip',value:await hash(ip||'missing-client-ip'),limit:ipLimit??Math.max(limit*10,100)});
 if(subject.trim())counters.push({kind:'subject',value:await hash(subject.trim().toLowerCase()),limit});
 // Count by IP and account separately: changing a User-Agent or rotating IPs
 // must not erase the account bucket, and one shared IP should not merge users.
 for(const counter of counters){
  const key=`${scope}:${windowStart}:${counter.kind}:${counter.value}`;
  const row=await db().prepare('INSERT INTO security_rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=security_rate_limits.hits+1 RETURNING hits').bind(key,expiresAt).first<{hits:number}>();
  const hits=row?.hits??1;
  if(hits>counter.limit){
   // Record only the first rejected request in each bucket to avoid turning
   // blocked traffic into an unbounded security-event write amplification.
   if(hits===counter.limit+1)await recordSecurityEvent(request,'rate_limit_blocked',null,{scope,dimension:counter.kind});
   throw new ApiError('操作太頻繁，請稍後再試。',429);
  }
 }
 const actor=await actorHash(request);
 if(actor.endsWith('00'))db().prepare('DELETE FROM security_rate_limits WHERE expires_at < ?').bind(now).run().catch(()=>{});
}

export async function recordSecurityEvent(request:Request,eventType:string,userId:string|null,details:Record<string,unknown>={}){
 try{
  const safe=JSON.stringify(details).slice(0,1000);
  await db().prepare('INSERT INTO security_events (id,user_id,actor_hash,event_type,details,created_at) VALUES (?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),userId,await actorHash(request),eventType,safe,new Date().toISOString()).run();
 }catch(error){console.error('Security event logging failed',{errorType:error instanceof Error?error.name:'UnknownError'});}
}

export async function verifyTurnstile(request:Request,token?:string){
 if(!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY)throw new ApiError('人機驗證服務尚未完成安全設定，請稍後再試。',503);
 if(!token||token.length>2048)throw new ApiError('請先完成人機驗證。',403);
 const body=new FormData();body.set('secret',env.TURNSTILE_SECRET_KEY);body.set('response',token);
 const ip=clientAddress(request);if(ip)body.set('remoteip',ip);
 let response:Response;
 try{response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(5000)});}
 catch{throw new ApiError('人機驗證服務暫時無法連線，請稍後再試。',503);}
 let result:{success?:boolean};
 try{result=await response.json() as {success?:boolean};}catch{throw new ApiError('人機驗證服務回應無效，請稍後再試。',503);}
 if(!response.ok)throw new ApiError('人機驗證服務暫時無法連線，請稍後再試。',503);
 if(result.success!==true)throw new ApiError('人機驗證未完成，請重新勾選後再試。',403);
}

export function securityEventLabel(eventType:string){
 return ({login_success:'登入成功',password_reset_requested:'已申請重設密碼',password_changed:'密碼已更新',account_exported:'已下載完整資料',account_deleted:'帳號已註銷',logout:'已登出'} as Record<string,string>)[eventType]||eventType;
}
