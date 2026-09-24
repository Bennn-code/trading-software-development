import { z } from 'zod';
import { identity,json,failure,ApiError,readJson } from '@/lib/server';
import { tradeSchema } from '@/lib/validation';
import { checkTradeDuplicates,confirmTradeDuplicate } from '@/lib/trade-duplicate-server';
import { enforceRateLimit } from '@/lib/security';
export async function POST(request:Request){try{
 const owner=await identity(request,true);await enforceRateLimit(request,{scope:'import-check-trades',limit:300,windowSeconds:3600,subject:owner});const body=await readJson(request,800000);
 const input=z.object({trades:z.array(tradeSchema).max(50),confirm:z.object({tradeId:z.string().uuid(),step:z.number().int().min(1).max(2),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).optional()}).safeParse(body);
 if(!input.success)throw new ApiError('請先完成交易的必要欄位，再檢查重複。');
 if(input.data.confirm){const c=input.data.confirm;return json({duplicate:await confirmTradeDuplicate(owner,input.data.trades,c.tradeId,c.step,c.fingerprint)});}
 return json({duplicates:await checkTradeDuplicates(owner,input.data.trades)});
 }catch(e){return failure(e);}}
