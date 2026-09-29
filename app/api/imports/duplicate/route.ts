import { z } from 'zod';
import { db,identity,json,failure,ApiError,readJson } from '@/lib/server';
import { duplicateInfo } from '@/lib/image-duplicates';
import { enforceRateLimit } from '@/lib/security';
export async function POST(request:Request){try{
 const owner=await identity(request,true);await enforceRateLimit(request,{scope:'image-duplicate-confirm',limit:120,windowSeconds:3600,subject:owner});const parsed=z.object({imageId:z.string().uuid(),acknowledge:z.literal(1)}).safeParse(await readJson(request,4000));
 if(!parsed.success)throw new ApiError('請依序確認重複截圖提醒。');
 const {imageId,acknowledge}=parsed.data,info=await duplicateInfo(owner,imageId);
 if(!info.count)throw new ApiError('這張截圖尚無重複交易，請返回匯入。');
 if(info.step>=1)return json({step:1,count:info.count});
 const result=await db().prepare('UPDATE images SET duplicate_step=1 WHERE id=? AND user_id=? AND duplicate_step=0').bind(imageId,owner).run();
 if(result.meta.changes!==1){const latest=await duplicateInfo(owner,imageId);if(latest.step<1)throw new ApiError('確認狀態已更新，請重試。',409);}
 return json({step:acknowledge,count:info.count});
 }catch(e){return failure(e);}}
