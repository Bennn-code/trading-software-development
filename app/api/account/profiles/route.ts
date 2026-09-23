import { z } from 'zod';
import { identity,db,json,failure,ApiError } from '@/lib/server';
import { sameOrigin } from '@/lib/account-validation';
import { ensureProfiles } from '@/lib/profiles';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().trim().min(1).max(40)}),z.object({action:z.literal('rename'),id:z.string().uuid(),name:z.string().trim().min(1).max(40)}),z.object({action:z.literal('switch'),id:z.string().uuid()})
]);
export async function POST(request:Request){try{if(!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);const owner=await identity(request,true),parsed=schema.safeParse(await request.json());if(!parsed.success)throw new ApiError('子帳號設定不正確');const input=parsed.data,database=db(),at=new Date().toISOString();
 if(input.action==='create'){const rows=await database.prepare('SELECT is_main FROM trading_profiles WHERE user_id=?').bind(owner).all<{is_main:number}>();if(rows.results.length>=7)throw new ApiError('最多可建立 7 個交易帳號。');const id=crypto.randomUUID();await database.prepare('INSERT INTO trading_profiles (id,user_id,name,is_main,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,owner,input.name,0,at,at).run();}
 else {const row=await database.prepare('SELECT id FROM trading_profiles WHERE id=? AND user_id=?').bind(input.id,owner).first();if(!row)throw new ApiError('找不到這個子帳號',404);if(input.action==='rename')await database.prepare('UPDATE trading_profiles SET name=?,updated_at=? WHERE id=? AND user_id=?').bind(input.name,at,input.id,owner).run();else await database.prepare('UPDATE account_preferences SET active_profile_id=?,updated_at=? WHERE user_id=?').bind(input.id,at,owner).run();}
 return json(await ensureProfiles(owner));
 }catch(e){return failure(e);}}
