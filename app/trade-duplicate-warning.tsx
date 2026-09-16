'use client';
import { useI18n } from './language-provider';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
export default function TradeDuplicateWarning({duplicate,busy,onConfirm}:{duplicate:TradeDuplicate;busy:boolean;onConfirm:()=>void}){
 const {t:tx}=useI18n();

 return <div className="trade-duplicate-warning" role="alert"><strong>{duplicate.step===2?tx("已確認重複錄入"):tx("偵測到重複交易")}</strong><p>{tx("進出場時間、進出場價、倉位大小及盈虧，與 ")}{duplicate.count} {tx(" 筆既有／本次匯入交易完全一致。")}</p>{duplicate.step===0?<p>{tx("這筆預設略過，不影響其他新交易。")}</p>:duplicate.step===1?<p>{tx("再次錄入會重複計算筆數及損益。確定仍要新增同一筆？")}</p>:<p>{tx("已完成兩次確認；這筆將另存一份。")}</p>}{duplicate.step<2&&<button type="button" disabled={busy} onClick={onConfirm}>{duplicate.step===0?tx("仍要錄入（第 1 次確認）"):tx("確定重複錄入（第 2 次確認）")}</button>}</div>;
}
