import { db,ApiError } from './server';
import { findTradeMatches,tradeExitScanRange,tradeMatchKey,type TradeDuplicate } from './trade-duplicates';
import type { Trade } from './trades';
import { activeProfile } from './profiles';
const lifetime=30*60*1000;
async function digest(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
export async function checkTradeDuplicates(owner:string,trades:Trade[],requestedProfileId?:string):Promise<TradeDuplicate[]>{
 const profileId=requestedProfileId??await activeProfile(owner),database=db();
 const candidates=trades.filter(trade=>tradeMatchKey(trade));
 if(!candidates.length)return [];

 // Stored trade timestamps are local to their source timezone. Scan a narrow
 // indexed window around each UTC minute so imports made in another timezone
 // (and legacy rows with seconds) are included without loading the account.
 const ranges=[...new Map(candidates.flatMap(trade=>{const range=tradeExitScanRange(trade);return range?[[range.join('|'),range] as const]:[]})).values()];
 const chunks:[string,string][][]=[];
 for(let index=0;index<ranges.length;index+=30)chunks.push(ranges.slice(index,index+30));
 const existingRows=(await Promise.all(chunks.map(chunk=>database.prepare(`SELECT payload FROM trades WHERE user_id=? AND profile_id=? AND (${chunk.map(()=>'(exit_time>=? AND exit_time<?)').join(' OR ')})`).bind(owner,profileId,...chunk.flat()).all<{payload:string}>()))).flatMap(result=>result.results);
 const matches=findTradeMatches(trades,existingRows.map(row=>JSON.parse(row.payload) as Trade));
 if(!matches.length)return [];

 // Avoid one database round-trip per candidate: compute fingerprints in
 // parallel, read approvals once, then write any resets in a single batch.
 const fingerprints=await Promise.all(matches.map(async match=>{
  const trade=trades.find(item=>item.id===match.tradeId)!;
  return {...match,fingerprint:await digest(JSON.stringify([trade.id,trade.imageId,tradeMatchKey(trade),match.matchIds]))};
 }));
 const tradeIds=[...new Set(fingerprints.map(match=>match.tradeId))];
 const approvals=await database.prepare(`SELECT trade_id,fingerprint,step,expires_at FROM import_duplicate_approvals WHERE user_id=? AND trade_id IN (${tradeIds.map(()=>'?').join(',')})`).bind(owner,...tradeIds).all<{trade_id:string;fingerprint:string;step:number;expires_at:number}>();
 const approvalById=new Map(approvals.results.map(approval=>[approval.trade_id,approval]));
 const now=Date.now(),writes=[] as ReturnType<typeof database.prepare>[];
 const result=fingerprints.map(match=>{
  const approval=approvalById.get(match.tradeId),valid=approval?.fingerprint===match.fingerprint&&approval.expires_at>now;
  if(!valid)writes.push(database.prepare('INSERT INTO import_duplicate_approvals (user_id,trade_id,fingerprint,step,expires_at) VALUES (?,?,?,0,?) ON CONFLICT(user_id,trade_id) DO UPDATE SET fingerprint=excluded.fingerprint,step=0,expires_at=excluded.expires_at WHERE fingerprint!=excluded.fingerprint OR expires_at<=?').bind(owner,match.tradeId,match.fingerprint,now+lifetime,now));
  return {...match,step:valid?approval.step:0};
 });
 if(writes.length)await database.batch(writes);
 return result;
}
export async function confirmTradeDuplicate(owner:string,trades:Trade[],tradeId:string,step:number,fingerprint:string,profileId?:string){
 const duplicates=await checkTradeDuplicates(owner,trades,profileId),match=duplicates.find(d=>d.tradeId===tradeId);
 if(!match||match.fingerprint!==fingerprint)throw new ApiError('交易或比對結果已變更，請重新檢查並確認。',409);
 if(step!==1)throw new ApiError('這筆重複交易已完成一次確認，請重新整理清單。',409);
 if(match.step>=1)return match;
 const changed=await db().prepare('UPDATE import_duplicate_approvals SET step=?,expires_at=? WHERE user_id=? AND trade_id=? AND fingerprint=? AND step=? AND expires_at>?').bind(step,Date.now()+lifetime,owner,tradeId,fingerprint,step-1,Date.now()).run();
 if(!changed.meta.changes){const latest=(await checkTradeDuplicates(owner,trades,profileId)).find(d=>d.tradeId===tradeId);if(latest?.fingerprint===fingerprint&&latest.step>=1)return latest;throw new ApiError('確認已過期或狀態已更新，請重新檢查。',409);}
 return {...match,step};
}
