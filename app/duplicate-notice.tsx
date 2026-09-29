'use client';
import { useI18n } from './language-provider';
import { useState } from 'react';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel } from '@/components/ui/alert-dialog';
export type DuplicateCheck={imageId:string;count:number;step:number};
export default function DuplicateNotice({check,onCancel,onApproved}:{check:DuplicateCheck;onCancel:()=>void;onApproved:()=>void}){
 const {t:tx}=useI18n();

 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function confirm(){setBusy(true);setError('');try{const r=await fetch('/api/imports/duplicate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageId:check.imageId,acknowledge:1})});const data=await r.json() as {step:number;error?:string};if(!r.ok)throw new Error(data.error||tx("確認失敗"));if(data.step>=1)onApproved();}catch(e){setError(e instanceof Error?e.message:tx("請重試"));}finally{setBusy(false);}}
 return <AlertDialog open onOpenChange={v=>{if(!v&&!busy)onCancel();}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tx("重複截圖提醒")}</AlertDialogTitle><AlertDialogDescription>{tx("這張截圖已對應 {0} 筆交易紀錄。若繼續，系統會先辨識，再檢查交易內容；重複交易可能再次計入筆數與損益。",[check.count])}</AlertDialogDescription></AlertDialogHeader>{error&&<p className="form-error" role="alert">{tx(error)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy} onClick={onCancel}>{tx("取消，不重複加入")}</AlertDialogCancel><button className="primary-button save-confirm-button" disabled={busy} onClick={()=>void confirm()}>{busy?tx("確認中…"):tx("仍要繼續")}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
