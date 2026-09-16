'use client';
import { useI18n } from './language-provider';
import { useState } from 'react';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel } from '@/components/ui/alert-dialog';
export type DuplicateCheck={imageId:string;count:number;step:number};
export default function DuplicateNotice({check,onCancel,onApproved}:{check:DuplicateCheck;onCancel:()=>void;onApproved:()=>void}){
 const {t:tx}=useI18n();

 const [step,setStep]=useState(check.step),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function confirm(){setBusy(true);setError('');try{const r=await fetch('/api/imports/duplicate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageId:check.imageId,acknowledge:step+1})});const data=await r.json() as {step:number;error?:string};if(!r.ok)throw new Error(data.error||tx("確認失敗"));if(data.step===2)onApproved();else setStep(data.step);}catch(e){setError(e instanceof Error?e.message:tx("請重試"));}finally{setBusy(false);}}
 return <AlertDialog open onOpenChange={v=>{if(!v&&!busy)onCancel();}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{step===0?tx("重複截圖提醒（1／2）"):tx("再次確認重複加入（2／2）")}</AlertDialogTitle><AlertDialogDescription>{step===0?tx("這張截圖已對應 {0} 筆交易紀錄，目前已阻止再次匯入。建議取消並查看原紀錄。", [check.count]):tx("再次加入會建立另一份交易，可能讓交易筆數與損益重複計算。只有確定要保留兩份時，才繼續加入。")}</AlertDialogDescription></AlertDialogHeader>{error&&<p className="form-error" role="alert">{tx(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy} onClick={onCancel}>{tx("取消，不重複加入")}</AlertDialogCancel><button className="primary-button" disabled={busy} onClick={()=>void confirm()}>{busy?tx("確認中…"):step===0?tx("仍要繼續（第 1 次確認）"):tx("確認重複加入（第 2 次確認）")}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
