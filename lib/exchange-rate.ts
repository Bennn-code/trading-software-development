export type ExchangeRate={rate:number;updatedAt:number;provider:'CoinGecko'};
export const RATE_MAX_AGE_MS=24*60*60*1000;
export function isFreshRate(value:unknown,now=Date.now()):value is ExchangeRate{if(!value||typeof value!=='object')return false;const quote=value as ExchangeRate;return typeof quote.rate==='number'&&Number.isFinite(quote.rate)&&quote.rate>0&&typeof quote.updatedAt==='number'&&Number.isFinite(quote.updatedAt)&&quote.updatedAt<=now+60000&&now-quote.updatedAt<=RATE_MAX_AGE_MS;}
export function parseExchangeRate(data:unknown,now=Date.now()):ExchangeRate{
 const price=(data as {tether?:{usd?:unknown;last_updated_at?:unknown}})?.tether;
 if(typeof price?.usd!=='number'||typeof price.last_updated_at!=='number')throw new Error('匯率資料不完整');
 const quote:ExchangeRate={rate:price.usd,updatedAt:price.last_updated_at*1000,provider:'CoinGecko'};
 if(!isFreshRate(quote,now)||now-quote.updatedAt>5*60*1000)throw new Error('匯率報價已過期或無效');
 return quote;
}
export function combinedUSD(usd:number,usdt:number,quote:ExchangeRate|null,now=Date.now()){
 if(!Number.isFinite(usd)||!Number.isFinite(usdt))return null;
 if(usdt===0)return Math.round(usd*100)/100;
 if(!isFreshRate(quote,now))return null;
 return Math.round((usd+usdt*quote.rate)*100)/100;
}
export function createRateLoader(fetcher:typeof fetch=fetch,clock:()=>number=Date.now){
 let cached:ExchangeRate|null=null,checkedAt=0,pending:Promise<ExchangeRate>|null=null;
 return async function load():Promise<ExchangeRate>{
  if(cached&&clock()-checkedAt<RATE_MAX_AGE_MS&&isFreshRate(cached,clock()))return cached;
  if(pending)return pending;
  pending=(async()=>{
   const response=await fetcher('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd&include_last_updated_at=true&precision=full',{headers:{accept:'application/json','User-Agent':'TradeJournal/1.0'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error(`目前無法取得即時匯率（HTTP ${response.status}）`);
   const quote=parseExchangeRate(await response.json(),clock());cached=quote;checkedAt=clock();return quote;
  })();
  try{return await pending;}finally{pending=null;}
 };
}
