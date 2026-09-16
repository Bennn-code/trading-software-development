import { db,identity,json,ApiError,failure } from '@/lib/server';
import { createRateLoader,isFreshRate } from '@/lib/exchange-rate';
const loadRate=createRateLoader();
export async function GET(request:Request){try{await identity(request);try{
 const cached=await db().prepare("SELECT payload FROM exchange_rates WHERE pair='USDT_USD'").first<{payload:string}>();
 if(cached){const quote=JSON.parse(cached.payload);if(isFreshRate(quote))return json(quote);}
 const quote=await loadRate();await db().prepare("INSERT INTO exchange_rates (pair,payload,fetched_at) VALUES ('USDT_USD',?,?) ON CONFLICT(pair) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at").bind(JSON.stringify(quote),Date.now()).run();return json(quote);
 }catch(error){console.warn('Exchange rate unavailable:',error instanceof Error?error.message:'unknown');throw new ApiError('暫時無法取得今日 USDT／USD 匯率，請稍後重試。',503);}}catch(e){return failure(e);}}
