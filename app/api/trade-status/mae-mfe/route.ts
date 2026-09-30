import { z } from 'zod';
import { convertWallTime } from '@/lib/display-currency';
import { calculateMaeMfe } from '@/lib/trade-status';
import { ApiError, db, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';

const providerSchema = z.enum(['bybit','bitget','okx','kucoin','bingx','mexc']);
const tradeSchema = z.object({
  id:z.string().uuid(),market:z.literal('crypto'),currency:z.enum(['USD','USDT','TWD','CNY','HKD']),
  symbol:z.string().trim().min(1).max(30),side:z.enum(['long','short']),
  entryTime:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),exitTime:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone:z.string().max(80).optional(),entry:z.number().finite().positive(),exit:z.number().finite().positive(),
  quantity:z.number().finite().positive(),multiplier:z.number().finite().positive(),positionValue:z.number().finite().positive().nullable().optional(),exchangeSource:providerSchema.nullable().optional(),
  netOverride:z.number().finite().nullable().optional(),profitBasis:z.enum(['net','gross']).optional(),fees:z.number().finite().nullable().optional(),funding:z.number().finite().nullable().optional(),
  feeMode:z.enum(['paid','rebate']).optional(),commission:z.number().finite().nullable().optional(),transactionTax:z.number().finite().nullable().optional(),exchangeFee:z.number().finite().nullable().optional(),
  clearingFee:z.number().finite().nullable().optional(),settlementFee:z.number().finite().nullable().optional(),regulatoryFee:z.number().finite().nullable().optional(),secFee:z.number().finite().nullable().optional(),finraFee:z.number().finite().nullable().optional(),futuresTax:z.number().finite().nullable().optional(),
});
const inputSchema=z.object({trades:z.array(tradeSchema).min(1).max(3)});
type Provider=z.infer<typeof providerSchema>;
type Candle={time:number;high:number;low:number};
type ProviderConfig={host:string;path:string;limit:number};
const configs:Record<Provider,ProviderConfig>={
  bybit:{host:'api.bybit.com',path:'/v5/market/kline',limit:1000},
  bitget:{host:'api.bitget.com',path:'/api/v3/market/history-candles',limit:100},
  okx:{host:'www.okx.com',path:'/api/v5/market/history-candles',limit:300},
  kucoin:{host:'api-futures.kucoin.com',path:'/api/v1/kline/query',limit:500},
  bingx:{host:'open-api.bingx.com',path:'/openApi/swap/v3/quote/klines',limit:1440},
  mexc:{host:'contract.mexc.com',path:'/api/v1/contract/kline',limit:2000},
};
const CACHE_TTL=60*60*1000;
const candleCache=new Map<string,{expiresAt:number;candles:Candle[]}>();
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function reserveOutboundSlot(provider:Provider){
  const key=`market-candle-egress:${provider}`;
  for(let attempt=0;attempt<8;attempt++){
    const now=Math.floor(Date.now()/1000);
    const row=await db().prepare(`INSERT INTO security_rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN security_rate_limits.expires_at<=? THEN 1 ELSE security_rate_limits.hits+1 END,expires_at=CASE WHEN security_rate_limits.expires_at<=? THEN ? ELSE security_rate_limits.expires_at END RETURNING hits,expires_at`).bind(key,now+1,now,now,now+1).first<{hits:number;expires_at:number}>();
    if(row?.hits===1)return;
    await delay(Math.max(80,(Number(row?.expires_at??now+1)-now)*1000-(Date.now()%1000)+20));
  }
  throw new ApiError('市場資料查詢目前繁忙，請稍後再分析。',429);
}

function isoMinuteMs(value:string,timezone:string){
  try{const utc=convertWallTime(value,timezone,'UTC');const timestamp=Date.parse(`${utc}:00Z`);return Number.isFinite(timestamp)?timestamp:NaN;}catch{return NaN;}
}
function validProviderSymbol(provider:Provider,symbol:string){
  if(provider==='bybit'||provider==='bitget')return /^[A-Z0-9]{2,24}USDT$/.test(symbol);
  if(provider==='okx')return /^[A-Z0-9]+-USDT-SWAP$/.test(symbol);
  if(provider==='kucoin')return /^[A-Z0-9]{4,20}USDTM$/.test(symbol);
  if(provider==='bingx')return /^[A-Z0-9]{2,20}-USDT$/.test(symbol);
  return /^[A-Z0-9]{2,20}_USDT$/.test(symbol);
}
function candleRows(provider:Provider,payload:unknown):Candle[]{
  if(provider==='bybit'){
    const list=(payload as {retCode?:number;result?:{list?:unknown[][]}})?.result?.list??[];
    if((payload as {retCode?:number}).retCode!==0)throw new ApiError('Bybit 暫時拒絕市場 K 線查詢，請稍後重試。',502);
    return list.flatMap(row=>{const time=Number(row[0]),high=Number(row[2]),low=Number(row[3]);return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)?[{time,high,low}]:[];});
  }
  if(provider==='mexc'){
    const data=(payload as {success?:boolean;data?:{time?:number[];high?:number[];low?:number[]}})?.data;
    if((payload as {success?:boolean}).success!==true||!data)throw new ApiError('MEXC 暫時拒絕市場 K 線查詢，請稍後重試。',502);
    return (data.time??[]).flatMap((time,index)=>{const high=Number(data.high?.[index]),low=Number(data.low?.[index]);return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)?[{time:Number(time)*1000,high,low}]:[];});
  }
  const data=(payload as {code?:string|number;data?:unknown[]})?.data??[];
  if(provider==='bitget'&&(payload as {code?:string}).code!=='00000')throw new ApiError('Bitget 暫時拒絕市場 K 線查詢，請稍後重試。',502);
  if(provider==='okx'&&(payload as {code?:string}).code!=='0')throw new ApiError('OKX 暫時拒絕市場 K 線查詢，請稍後重試。',502);
  if(provider==='kucoin'&&(payload as {code?:string}).code!=='200000')throw new ApiError('KuCoin 暫時拒絕市場 K 線查詢，請稍後重試。',502);
  if(provider==='bingx'&&![0,'0'].includes((payload as {code?:number|string}).code??-1))throw new ApiError('BingX 暫時拒絕市場 K 線查詢，請稍後重試。',502);
  return data.flatMap(row=>{
    if(Array.isArray(row)){const time=Number(row[0]),high=Number(row[2]),low=Number(row[3]);return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)?[{time,high,low}]:[];}
    if(row&&typeof row==='object'){
      const candle=row as Record<string,unknown>,time=Number(candle.time??candle.timestamp??candle.ts),high=Number(candle.high??candle.h),low=Number(candle.low??candle.l);
      return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)?[{time:time<1e12?time*1000:time,high,low}]:[];
    }
    return [];
  });
}

async function fetchPage(provider:Provider,symbol:string,start:number,end:number):Promise<Candle[]>{
  const config=configs[provider],params=new URLSearchParams();
  if(provider==='bybit'){params.set('category','linear');params.set('symbol',symbol);params.set('interval','1');params.set('start',String(start));params.set('end',String(end));params.set('limit',String(config.limit));}
  else if(provider==='bitget'){params.set('category','USDT-FUTURES');params.set('symbol',symbol);params.set('interval','1m');params.set('startTime',String(start));params.set('endTime',String(end));params.set('limit',String(config.limit));}
  else if(provider==='okx'){params.set('instId',symbol);params.set('bar','1m');params.set('after',String(end+60_000));params.set('limit',String(config.limit));}
  else if(provider==='kucoin'){params.set('symbol',symbol);params.set('granularity','60');params.set('from',String(start));params.set('to',String(end));}
  else if(provider==='bingx'){params.set('symbol',symbol);params.set('interval','1m');params.set('startTime',String(start));params.set('endTime',String(end));params.set('limit',String(config.limit));}
  else {params.set('interval','Min1');params.set('start',String(Math.floor(start/1000)));params.set('end',String(Math.floor(end/1000)));}
  const url=`https://${config.host}${config.path}${provider==='mexc'?`/${encodeURIComponent(symbol)}`:''}?${params}`;
  const endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.hostname!==config.host||endpoint.pathname!==`${config.path}${provider==='mexc'?`/${encodeURIComponent(symbol)}`:''}`)throw new ApiError('市場資料查詢目標無效。',500);
  await reserveOutboundSlot(provider);
  let response:Response;try{response=await fetch(endpoint,{method:'GET',cache:'no-store',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});}catch{throw new ApiError('交易所市場資料連線逾時，請稍後再試。',502);}
  if(response.status===418||response.status===429||response.status===403)throw new ApiError('交易所暫時限制了市場資料查詢，請稍後重試。',429);
  if(!response.ok)throw new ApiError('交易所暫時無法提供市場 K 線，請稍後再試。',502);
  const length=Number(response.headers.get('content-length')??0);if(length>1_500_000)throw new ApiError('市場 K 線回應過大，請縮短分析期間。',502);
  let payload:unknown;try{const text=await response.text();if(text.length>1_500_000)throw new Error();payload=JSON.parse(text);}catch{throw new ApiError('交易所回傳的市場 K 線格式無法辨識。',502);}
  // Entry/exit inputs are minute precision. Include the entry candle and exclude
  // the candle beginning at the exit minute so post-exit prices cannot skew MFE/MAE.
  return candleRows(provider,payload).filter(candle=>candle.time>=start&&candle.time<end).sort((a,b)=>a.time-b.time);
}

async function candlesForTrade(provider:Provider,symbol:string,startMs:number,endMs:number){
  const start=Math.floor(startMs/60_000)*60_000,end=Math.floor(endMs/60_000)*60_000,key=`${provider}|${symbol}|${start}|${end}`,cached=candleCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.candles;
  const config=configs[provider],pageMinutes=config.limit*3;
  if(Math.floor((end-start)/60_000)+1>pageMinutes)return null;
  const all:Candle[]=[];let pageStart=start,pages=0;
  while(pageStart<=end){const pageEnd=Math.min(end,pageStart+(config.limit-1)*60_000);all.push(...await fetchPage(provider,symbol,pageStart,pageEnd));pages++;if(pages>3)throw new ApiError('市場 K 線頁數超出安全查詢上限，請縮短所選期間。',413);pageStart=pageEnd+60_000;}
  const unique=[...new Map(all.map(candle=>[candle.time,candle])).values()];candleCache.set(key,{expiresAt:Date.now()+CACHE_TTL,candles:unique});
  if(candleCache.size>500)candleCache.delete(candleCache.keys().next().value!);
  return unique;
}

export async function POST(request:Request){
 try{
  const owner=await identity(request,true);
  await enforceRateLimit(request,{scope:'trade-status-mae-mfe',limit:60,ipLimit:240,windowSeconds:3600,subject:owner});
  const body=await readJson(request,12_000),parsed=inputSchema.safeParse(body);if(!parsed.success)throw new ApiError('每次分析最多選三筆有效的加密貨幣交易。');
  const rows=[] as {id:string;provider:Provider;symbol:string;currency:string;entryTime:string;mae:number;mfe:number;actual:number;candleCount:number}[],skipped=[] as {id:string;reason:string}[];
  for(const source of parsed.data.trades){
   const provider=source.exchangeSource;
   if(!provider){skipped.push({id:source.id,reason:'尚未設定價格資料來源交易所。'});continue;}
   if(!validProviderSymbol(provider,source.symbol)){skipped.push({id:source.id,reason:'商品代號格式與價格資料來源不相符，或此來源不支援該商品。'});continue;}
   const timezone=source.timezone||'Asia/Taipei',start=isoMinuteMs(source.entryTime,timezone),end=isoMinuteMs(source.exitTime,timezone);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){skipped.push({id:source.id,reason:'進出場時間無效或相同；請先確認交易時間。'});continue;}
   const candles=await candlesForTrade(provider,source.symbol,start,end);
   if(candles===null){skipped.push({id:source.id,reason:'持倉時間超過該交易所本次安全查詢上限，未送出大量分頁請求。'});continue;}
   if(!candles.length){skipped.push({id:source.id,reason:'交易所未回傳這段期間的一分鐘 K 線。'});continue;}
   const stats=calculateMaeMfe(source,candles);if(!stats){skipped.push({id:source.id,reason:'交易資料或 K 線數值無效。'});continue;}
   rows.push({id:source.id,provider,symbol:source.symbol,currency:source.currency,entryTime:source.entryTime,mae:stats.mae,mfe:stats.mfe,actual:stats.actual,candleCount:stats.candleCount});
  }
  return json({rows,skipped,interval:'1m'});
 }catch(error){return failure(error);}
}
