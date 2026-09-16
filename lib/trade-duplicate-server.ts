import { db,ApiError } from './server';
import { findTradeMatches,tradeMatchKey,type TradeDuplicate } from './trade-duplicates';
import type { Trade } from './trades';
const lifetime=30*60*1000;
async function digest(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
export async function checkTradeDuplicates(owner:string,trades:Trade[]):Promise<TradeDuplicate[]>{
 const database=db(),existing=await database.prepare('SELECT payload FROM trades WHERE user_id=?').bind(owner).all<{payload:string}>();
 const matches=findTradeMatches(trades,existing.results.map(row=>JSON.parse(row.payload) as Trade));
 const result:TradeDuplicate[]=[];
 for(const match of matches){
  const trade=trades.find(t=>t.id===match.tradeId)!;
  const fingerprint=await digest(JSON.stringify([trade.id,trade.imageId,tradeMatchKey(trade),match.matchIds]));
  const approval=await database.prepare('SELECT fingerprint,step,expires_at FROM import_duplicate_approvals WHERE user_id=? AND trade_id=?').bind(owner,trade.id).first<{fingerprint:string;step:number;expires_at:number}>();
  const step=approval?.fingerprint===fingerprint&&approval.expires_at>Date.now()?approval.step:0;
  if(!step)await database.prepare('INSERT INTO import_duplicate_approvals (user_id,trade_id,fingerprint,step,expires_at) VALUES (?,?,?,0,?) ON CONFLICT(user_id,trade_id) DO UPDATE SET fingerprint=excluded.fingerprint,step=0,expires_at=excluded.expires_at WHERE fingerprint!=excluded.fingerprint OR expires_at<=?').bind(owner,trade.id,fingerprint,Date.now()+lifetime,Date.now()).run();
  result.push({...match,fingerprint,step});
 }
 return result;
}
export async function confirmTradeDuplicate(owner:string,trades:Trade[],tradeId:string,step:number,fingerprint:string){
 const duplicates=await checkTradeDuplicates(owner,trades),match=duplicates.find(d=>d.tradeId===tradeId);
 if(!match||match.fingerprint!==fingerprint)throw new ApiError('交易或比對結果已變更，請重新檢查並確認。',409);
 if(step!==match.step+1||![1,2].includes(step))throw new ApiError('請依序完成兩次確認。',409);
 const changed=await db().prepare('UPDATE import_duplicate_approvals SET step=?,expires_at=? WHERE user_id=? AND trade_id=? AND fingerprint=? AND step=? AND expires_at>?').bind(step,Date.now()+lifetime,owner,tradeId,fingerprint,step-1,Date.now()).run();
 if(!changed.meta.changes)throw new ApiError('確認已過期或狀態已更新，請重新檢查。',409);
 return {...match,step};
}
