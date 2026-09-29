import { z } from 'zod';
import { identity,db,json,failure,ApiError,readJson } from '@/lib/server';
import { sameOrigin } from '@/lib/account-validation';
import { ensureProfiles } from '@/lib/profiles';
import { enforceRateLimit } from '@/lib/security';
import { MAX_TRADING_PROFILES } from '@/lib/profile-limits';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().trim().min(1).max(40)}),z.object({action:z.literal('rename'),id:z.string().uuid(),name:z.string().trim().min(1).max(40)}),z.object({action:z.literal('switch'),id:z.string().uuid()})
]);
export async function POST(request:Request){try{if(!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);const owner=await identity(request,true);await enforceRateLimit(request,{scope:'account-profiles',limit:120,windowSeconds:3600,subject:owner});const parsed=schema.safeParse(await readJson(request,12000));if(!parsed.success)throw new ApiError('子帳號設定不正確');const input=parsed.data,database=db(),at=new Date().toISOString();
 if(input.action==='create'){const id=crypto.randomUUID();const created=await database.prepare('INSERT INTO trading_profiles (id,user_id,name,is_main,created_at,updated_at) SELECT ?,?,?,0,?,? WHERE (SELECT COUNT(*) FROM trading_profiles WHERE user_id=?) < ?').bind(id,owner,input.name,at,at,owner,MAX_TRADING_PROFILES).run();if(!created.meta.changes)throw new ApiError(`最多可建立 ${MAX_TRADING_PROFILES} 個交易帳號。`);}
 else {const row=await database.prepare('SELECT id FROM trading_profiles WHERE id=? AND user_id=?').bind(input.id,owner).first();if(!row)throw new ApiError('找不到這個子帳號',404);if(input.action==='rename')await database.prepare('UPDATE trading_profiles SET name=?,updated_at=? WHERE id=? AND user_id=?').bind(input.name,at,input.id,owner).run();else await database.prepare('UPDATE account_preferences SET active_profile_id=?,updated_at=? WHERE user_id=?').bind(input.id,at,owner).run();}
 return json(await ensureProfiles(owner));
 }catch(e){return failure(e);}}
