'use client';
import { useI18n } from './language-provider';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
export default function TradeDuplicateWarning({duplicate,busy,onConfirm}:{duplicate:TradeDuplicate;busy:boolean;onConfirm?:()=>void}){
 const {t:tx}=useI18n();

 return <div className="trade-duplicate-warning" role="alert"><strong>{tx("偵測到重複交易")}</strong><p>{tx("同一商品的進出場時間、進出場價格及淨損益，與 ")}{duplicate.count} {tx(" 筆既有／本次匯入交易一致。")}</p>{onConfirm&&duplicate.step<1?<><p>{tx("這筆預設略過，不影響其他新交易。")}</p><button type="button" className="save-confirm-button" disabled={busy} onClick={onConfirm}>{tx("仍要錄入")}</button></>:duplicate.step<1?<p>{tx("紅框標示的重複交易：如要匯入，請勾選該筆；最後在儲存視窗完成一次整批確認。")}</p>:<p>{tx("已完成一次重複交易確認。若仍要匯入，請完成核對後再儲存。")}</p>}</div>;
}
