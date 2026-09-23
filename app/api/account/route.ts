import { env } from 'cloudflare:workers';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { currentAccount, emailAuthConfigured, emailClient } from '@/lib/account-auth';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { db, bucket, json, failure, ApiError } from '@/lib/server';
import { sameOrigin } from '@/lib/account-validation';
import { enforceRateLimit, recordSecurityEvent } from '@/lib/security';
import { ensureProfiles } from '@/lib/profiles';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    const [legacy,spaces] = await Promise.all([
      getChatGPTUser(),
      account ? ensureProfiles(account.userId) : Promise.resolve({profiles:[],activeProfileId:null}),
    ]);
    const preference = account ? await db().prepare('SELECT language,show_demo_data,timezone,base_currency,pnl_color,active_profile_id FROM account_preferences WHERE user_id = ?').bind(account.userId).first<{language:string;show_demo_data:number;timezone:string;base_currency:string;pnl_color:string;active_profile_id:string|null}>() : null;
    return json({ account, emailEnabled: emailAuthConfigured(), language: preference?.language ?? null,preferences:preference?{language:preference.language,showDemoData:!!preference.show_demo_data,timezone:preference.timezone,baseCurrency:preference.base_currency,pnlColor:preference.pnl_color,activeProfileId:spaces.activeProfileId}:null,profiles:spaces.profiles,activeProfileId:spaces.activeProfileId, canLink: !!legacy && account?.provider === 'email' && !account.linked, turnstileSiteKey:env.TURNSTILE_SITE_KEY??null, accountDeletionReady:account?.provider!=='email'||!!env.SUPABASE_SERVICE_ROLE_KEY });
  } catch (e) { return failure(e); }
}

const deletionSchema=z.object({exportToken:z.string().min(20).max(200),password:z.string().max(128).optional(),confirmations:z.tuple([z.literal('downloaded'),z.string().min(1).max(254),z.literal('註銷我的帳號')])});
async function tokenHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function DELETE(request:Request){try{
 if(!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);
 const account=await currentAccount(request);if(!account)throw new ApiError('請先登入再操作交易紀錄',401);
 await enforceRateLimit(request,{scope:'account-delete',limit:3,windowSeconds:86400,subject:account.userId});
 const parsed=deletionSchema.safeParse(await request.json());if(!parsed.success)throw new ApiError('三次確認尚未完成，帳號沒有刪除。');
 const input=parsed.data;if(input.confirmations[1].trim().toLowerCase()!==account.email.trim().toLowerCase())throw new ApiError('輸入的電子郵件與目前帳號不一致。');
 const exported=await db().prepare('SELECT token_hash,expires_at FROM account_exports WHERE user_id = ?').bind(account.userId).first<{token_hash:string;expires_at:number}>();
 if(!exported||exported.expires_at<Date.now()||exported.token_hash!==await tokenHash(input.exportToken))throw new ApiError('請先重新下載完整資料，再進行註銷。',409);
 let client=null;
 if(account.provider==='email'){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!account.authId)throw new ApiError('帳號註銷服務尚未完成安全設定，請稍後再試。',503);
  if(!input.password)throw new ApiError('請輸入目前密碼以完成註銷。');
  client=await emailClient(request);const verified=client&&await client.auth.signInWithPassword({email:account.email,password:input.password});
  if(!verified||verified.error)throw new ApiError('目前密碼不正確，帳號沒有刪除。',401);
 }
 const images=await db().prepare('SELECT object_key FROM images WHERE user_id = ?').bind(account.userId).all<{object_key:string}>();
 for(const image of images.results)await bucket().delete(image.object_key);
 const database=db();await database.batch([
  database.prepare('DELETE FROM import_duplicate_approvals WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM trades WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM reviews WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM images WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM account_preferences WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM trading_profiles WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM security_events WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM account_exports WHERE user_id = ?').bind(account.userId),
  database.prepare('DELETE FROM account_links WHERE owner_id = ? OR auth_id = ?').bind(account.userId,account.authId??''),
 ]);
 if(account.provider==='email'&&account.authId){
  await client?.auth.signOut({scope:'local'});
  const admin=createClient(env.SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await admin.auth.admin.deleteUser(account.authId);if(error){await recordSecurityEvent(request,'account_delete_provider_failed',null,{code:error.code});throw new ApiError('交易資料已刪除，但登入帳號註銷尚未完成，請聯絡管理者。',503);}
 }
 await recordSecurityEvent(request,'account_deleted',null,{provider:account.provider});return json({ok:true});
 }catch(e){return failure(e);}}
