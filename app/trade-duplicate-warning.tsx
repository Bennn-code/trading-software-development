'use client';
import { useI18n } from './language-provider';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
export default function TradeDuplicateWarning({duplicate,busy,onConfirm}:{duplicate:TradeDuplicate;busy:boolean;onConfirm?:()=>void}){
 const {t:tx}=useI18n();

 return <div className="trade-duplicate-warning" role="alert"><strong>{tx("偵測到重複交易")}</strong><p>{tx("進出場時間、進出場價、倉位大小及盈虧，與 ")}{duplicate.count} {tx(" 筆既有／本次匯入交易完全一致。")}</p>{onConfirm&&duplicate.step<2?<><p>{duplicate.step===0?tx("這筆預設略過，不影響其他新交易。"):tx("再次錄入會重複計算筆數及損益。確定仍要新增同一筆？")}</p><button type="button" disabled={busy} onClick={onConfirm}>{duplicate.step===0?tx("仍要錄入（第 1 次確認）"):tx("確定重複錄入（第 2 次確認）")}</button></>:<p>{tx("紅框標示的重複交易：如要匯入，請勾選該筆；最後在儲存視窗完成一次整批確認。")}</p>}</div>;
}
