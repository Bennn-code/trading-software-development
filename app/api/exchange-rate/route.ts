import { identity,json,ApiError,failure } from '@/lib/server';
import { createRateLoader } from '@/lib/exchange-rate';
const loadRate=createRateLoader();
export async function GET(request:Request){try{await identity(request);try{return json(await loadRate());}catch(error){console.warn('Exchange rate unavailable:',error instanceof Error?error.message:'unknown');throw new ApiError('暫時無法取得即時 USDT／USD 匯率，請稍後重試。',503);}}catch(e){return failure(e);}}
