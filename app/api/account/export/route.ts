import { currentAccount } from '@/lib/account-auth';
import { db, bucket, failure, ApiError } from '@/lib/server';
import { sameOrigin } from '@/lib/account-validation';
import { enforceRateLimit, recordSecurityEvent } from '@/lib/security';

const encode=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function POST(request:Request){try{
 if(!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);
 const account=await currentAccount(request);if(!account)throw new ApiError('請先登入再操作交易紀錄',401);
 await enforceRateLimit(request,{scope:'account-export',limit:5,windowSeconds:3600,subject:account.userId});
 const database=db(),[trades,reviews,images,preference,events,profiles]=await Promise.all([
  database.prepare('SELECT profile_id,payload,updated_at FROM trades WHERE user_id = ? ORDER BY exit_time').bind(account.userId).all<{profile_id:string;payload:string;updated_at:string}>(),
  database.prepare('SELECT profile_id,kind,start_date,payload,updated_at FROM reviews WHERE user_id = ? ORDER BY start_date').bind(account.userId).all<{profile_id:string;kind:string;start_date:string;payload:string;updated_at:string}>(),
  database.prepare('SELECT id,object_key,mime,filename,size FROM images WHERE user_id = ? ORDER BY id').bind(account.userId).all<{id:string;object_key:string;mime:string;filename:string;size:number}>(),
  database.prepare('SELECT language,show_demo_data,timezone,base_currency,pnl_color,card_layouts,active_profile_id,updated_at FROM account_preferences WHERE user_id = ?').bind(account.userId).first<{card_layouts?:string}>(),
  database.prepare('SELECT event_type,details,created_at FROM security_events WHERE user_id = ? ORDER BY created_at').bind(account.userId).all<{event_type:string;details:string;created_at:string}>(),database.prepare('SELECT id,name,is_main,created_at,updated_at FROM trading_profiles WHERE user_id=? ORDER BY is_main DESC,created_at').bind(account.userId).all(),
 ]);
 const exportedImages=[];for(const image of images.results){const object=await bucket().get(image.object_key);exportedImages.push({id:image.id,filename:image.filename,mime:image.mime,size:image.size,dataBase64:object?encode(new Uint8Array(await object.arrayBuffer())):null});}
 const exportedAt=new Date().toISOString(),token=`${crypto.randomUUID()}${crypto.randomUUID()}`,expiresAt=Date.now()+30*60*1000;
 await database.prepare('INSERT INTO account_exports (user_id,token_hash,exported_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,exported_at=excluded.exported_at,expires_at=excluded.expires_at').bind(account.userId,await digest(token),exportedAt,expiresAt).run();
 await recordSecurityEvent(request,'account_exported',account.userId,{tradeCount:trades.results.length,imageCount:images.results.length});
 const exportedPreferences=preference?{...preference,card_layouts:(preference as {card_layouts?:string}).card_layouts?JSON.parse((preference as {card_layouts:string}).card_layouts):{}}:null;
 const data={format:'tradersregion-account-export-v2',exportedAt,account:{email:account.email,provider:account.provider},preferences:exportedPreferences,profiles:profiles.results,trades:trades.results.map(row=>({profileId:row.profile_id,...JSON.parse(row.payload),recordUpdatedAt:row.updated_at})),reviews:reviews.results.map(row=>({profileId:row.profile_id,kind:row.kind,startDate:row.start_date,...JSON.parse(row.payload),recordUpdatedAt:row.updated_at})),images:exportedImages,securityEvents:events.results.map(row=>({type:row.event_type,details:JSON.parse(row.details),createdAt:row.created_at}))};
 const filename=`tradersregion-backup-${exportedAt.slice(0,10)}.json`;
 return new Response(JSON.stringify(data,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Account-Export-Token':token}});
 }catch(e){return failure(e);}}
