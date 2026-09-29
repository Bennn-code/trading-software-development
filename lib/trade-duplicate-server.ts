import { db,ApiError } from './server';
import { findTradeMatches,tradeMatchKey,type TradeDuplicate } from './trade-duplicates';
import type { Trade } from './trades';
import { activeProfile } from './profiles';
const lifetime=30*60*1000;
async function digest(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
export async function checkTradeDuplicates(owner:string,trades:Trade[],requestedProfileId?:string):Promise<TradeDuplicate[]>{
 const profileId=requestedProfileId??await activeProfile(owner),database=db();
 const candidates=trades.filter(trade=>tradeMatchKey(trade));
 if(!candidates.length)return [];

 // exit_time is indexed per user/profile. Restrict the duplicate scan to the
 // only dates that can match instead of loading and parsing the whole account.
 const exitTimes=[...new Set(candidates.flatMap(trade=>{
  const match=trade.exitTime.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/);
  return match?match[2]?match[2]==='00'?[trade.exitTime,match[1]]:[trade.exitTime]:[trade.exitTime,`${match[1]}:00`]:[];
 }))];
 const chunks:string[][]=[];
 for(let index=0;index<exitTimes.length;index+=40)chunks.push(exitTimes.slice(index,index+40));
 const existingRows=(await Promise.all(chunks.map(chunk=>database.prepare(`SELECT payload FROM trades WHERE user_id=? AND profile_id=? AND exit_time IN (${chunk.map(()=>'?').join(',')})`).bind(owner,profileId,...chunk).all<{payload:string}>()))).flatMap(result=>result.results);
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
 if(step!==match.step+1||![1,2].includes(step))throw new ApiError('請依序完成兩次確認。',409);
 const changed=await db().prepare('UPDATE import_duplicate_approvals SET step=?,expires_at=? WHERE user_id=? AND trade_id=? AND fingerprint=? AND step=? AND expires_at>?').bind(step,Date.now()+lifetime,owner,tradeId,fingerprint,step-1,Date.now()).run();
 if(!changed.meta.changes)throw new ApiError('確認已過期或狀態已更新，請重新檢查。',409);
 return {...match,step};
}
