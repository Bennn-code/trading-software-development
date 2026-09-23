import { db,identity,json,ApiError,failure } from '@/lib/server';
import { currencyOptions } from '@/lib/preferences';
const HOUR=60*60*1000;
type Quote={rates:Record<string,number>;updatedAt:number;provider:string};
function usable(q:Quote){return q&&typeof q.updatedAt==='number'&&Object.values(q.rates||{}).some(value=>Number.isFinite(value)&&value>0);}
function valid(q:Quote){return usable(q)&&Date.now()-q.updatedAt<HOUR;}
export async function GET(request:Request){try{await identity(request);const database=db(),cached=await database.prepare("SELECT payload FROM exchange_rates WHERE pair='DISPLAY_USD'").first<{payload:string}>();if(cached){const q=JSON.parse(cached.payload) as Quote;if(valid(q)&&Date.now()-q.updatedAt<HOUR)return json(q);}
 const previous=cached?JSON.parse(cached.payload) as Quote:null;
 try{const fiatResponse=await fetch('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(10000)});if(!fiatResponse.ok)throw new Error('fiat provider');const f=await fiatResponse.json() as{rates?:Record<string,number>};if(!f.rates)throw new Error('fiat payload');
  const rates:Record<string,number>={...(previous?.rates||{}),USD:1};for(const [code] of currencyOptions){const value=f.rates[code];if(Number.isFinite(value)&&value>0)rates[code]=value;}
  try{const usdtResponse=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd',{signal:AbortSignal.timeout(7000)});if(usdtResponse.ok){const u=await usdtResponse.json() as{tether?:{usd?:number}};if(u.tether?.usd&&u.tether.usd>0)rates.USDT=1/u.tether.usd;}}catch{}
  rates.USDT??=previous?.rates?.USDT??1;
  const q:Quote={rates,updatedAt:Date.now(),provider:rates.USDT===previous?.rates?.USDT?'ExchangeRate-API (USDT 暫用快取或 1:1)':'ExchangeRate-API / CoinGecko'};await database.prepare("INSERT INTO exchange_rates(pair,payload,fetched_at) VALUES('DISPLAY_USD',?,?) ON CONFLICT(pair) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at").bind(JSON.stringify(q),q.updatedAt).run();return json(q);
 }catch{if(previous&&usable(previous))return json({...previous,stale:true});throw new ApiError('暫時無法取得今日匯率',503);}
 }catch(e){return failure(e);}}
