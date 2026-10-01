import type { CryptoCursor, CryptoQuoteSource } from './market-candles';
import type { Trade } from './trades';
import { excursionInput } from './trade-excursions';
import type { MaeMfeQueueState } from './mae-mfe-queue';

/** Quote keys and provider responses never belong in this durable, account-scoped state. */
export type ExcursionScan = {
  version: 2;
  input: string;
  status: 'complete' | 'missing' | 'pending' | 'blocked';
  source: CryptoQuoteSource;
  resume?: CryptoCursor;
  reason?: string;
  diagnostic?: { provider: string; status: number };
  updatedAt: string;
};

export function validExcursionScan(trade: Trade) {
  const scan = trade.excursionScan;
  return scan?.version === 2 && scan.input === excursionInput(trade) ? scan : null;
}

/** Both the React queue and reload tests use the same account-saved continuation policy. */
export function hydrateMaeMfeQueue<Row extends {id:string}>(local:MaeMfeQueueState<Row>,trades:Trade[],source:CryptoQuoteSource,retryRequested=false):MaeMfeQueueState<Row>&{requiresRetry:boolean}{
 const attempted=new Set(local.attempted),skipped=new Map(local.skipped.map(item=>[item.id,item])),resume={...local.resume};
 let requiresRetry=false;
 for(const trade of trades){const scan=validExcursionScan(trade);if(!scan)continue;
  // A saved refusal pauses the whole queue after reload, including trades not yet started.
  // A different source only releases it when the user explicitly requests a new query.
  if(scan.status==='blocked'&&!retryRequested)requiresRetry=true;
  if(scan.resume)resume[trade.id]=scan.resume;
  const exhausted=scan.status==='missing'&&(scan.resume?.complete||scan.source===source);
  if(scan.status==='complete'||exhausted||scan.status==='blocked'&&!retryRequested)attempted.add(trade.id);
  if(exhausted||scan.status==='blocked'&&!retryRequested)skipped.set(trade.id,{id:trade.id,reason:scan.reason??'尚無完整行情',retryable:scan.status==='blocked',diagnostic:scan.diagnostic});
 }
 return{...local,attempted:[...attempted],skipped:[...skipped.values()],resume,requiresRetry};
}
