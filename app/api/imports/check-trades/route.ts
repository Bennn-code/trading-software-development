import { z } from 'zod';
import { identity,json,failure,ApiError } from '@/lib/server';
import { tradeSchema } from '@/lib/validation';
import { checkTradeDuplicates,confirmTradeDuplicate } from '@/lib/trade-duplicate-server';
export async function POST(request:Request){try{
 const owner=await identity(request,true),raw=await request.text();if(raw.length>800000)throw new ApiError('檢查資料過大');
 const input=z.object({trades:z.array(tradeSchema).max(50),confirm:z.object({tradeId:z.string().uuid(),step:z.number().int().min(1).max(2),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).optional()}).safeParse(JSON.parse(raw));
 if(!input.success)throw new ApiError('請先完成交易的必要欄位，再檢查重複。');
 if(input.data.confirm){const c=input.data.confirm;return json({duplicate:await confirmTradeDuplicate(owner,input.data.trades,c.tradeId,c.step,c.fingerprint)});}
 return json({duplicates:await checkTradeDuplicates(owner,input.data.trades)});
 }catch(e){return failure(e);}}
