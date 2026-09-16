'use client';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
export default function TradeDuplicateWarning({duplicate,busy,onConfirm}:{duplicate:TradeDuplicate;busy:boolean;onConfirm:()=>void}){
 return <div className="trade-duplicate-warning" role="alert"><strong>{duplicate.step===2?'已確認重複錄入':'偵測到重複交易'}</strong><p>進出場時間、進出場價、倉位大小及盈虧，與 {duplicate.count} 筆既有／本次匯入交易完全一致。</p>{duplicate.step===0?<p>這筆預設略過，不影響其他新交易。</p>:duplicate.step===1?<p>再次錄入會重複計算筆數及損益。確定仍要新增同一筆？</p>:<p>已完成兩次確認；這筆將另存一份。</p>}{duplicate.step<2&&<button type="button" disabled={busy} onClick={onConfirm}>{duplicate.step===0?'仍要錄入（第 1 次確認）':'確定重複錄入（第 2 次確認）'}</button>}</div>;
}
