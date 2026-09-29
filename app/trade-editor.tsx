'use client';
import { useI18n } from './language-provider';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, X, ScanLine, LoaderCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { tradeSchema, tradeIssueMessage } from '@/lib/validation';
import { newTrade, positionValue, type Trade } from '@/lib/trades';
import type { TradeDuplicate } from '@/lib/trade-duplicates';
import { timezoneName, utcOffsetLabel } from '@/lib/preferences';
import DuplicateNotice, {type DuplicateCheck} from './duplicate-notice';
import TradeFields from './trade-fields';
import TradingAccountSelect, { type TradingAccountOption } from './trading-account-select';
import TradeDuplicateWarning from './trade-duplicate-warning';

export default function TradeEditor({open,onClose,trade,demo,onSave,accounts=[],activeProfileId=null,timezone='Asia/Taipei'}:{
 open:boolean;onClose:()=>void;trade:Trade|null;demo:boolean;
 onSave:(t:Trade,profileId?:string)=>Promise<void>;
 accounts?:TradingAccountOption[];activeProfileId?:string|null;timezone?:string;
}) {
 const {t:tx}=useI18n();
 const initialDraft=trade?{...trade,positionValue:trade.market==='crypto'?positionValue(trade):null}:newTrade(timezone);
 const [draft,setDraft]=useState<Trade>(initialDraft);
 const [profileOverride,setProfileOverride]=useState<string|null>(null);
 const targetProfileId=profileOverride??activeProfileId??'';
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(trade?.imageId?`/api/images/${trade.imageId}`:''),[tradeDuplicate,setTradeDuplicate]=useState<TradeDuplicate|null>(null);
 const [duplicate,setDuplicate]=useState<DuplicateCheck|null>(null);
 const picker=useRef<HTMLInputElement>(null),previewObjectUrl=useRef('');
 useEffect(()=>()=>{if(previewObjectUrl.current)URL.revokeObjectURL(previewObjectUrl.current);},[]);
 function chooseFile(f:File|undefined){if(!f)return;if(f.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(f.type)){setError(tx('請選擇 5 MB 以下的 PNG、JPG 或 WebP 圖片。'));return;}if(previewObjectUrl.current)URL.revokeObjectURL(previewObjectUrl.current);previewObjectUrl.current=URL.createObjectURL(f);setPreview(previewObjectUrl.current);setError('');setFile(f);}
 async function submit(e?:React.FormEvent){
  e?.preventDefault();setError('');
  if(!demo&&!targetProfileId){setError(tx('請先選擇交易帳號'));return;}
  const parsed=tradeSchema.safeParse({...draft,id:draft.id.startsWith('demo-')?crypto.randomUUID():draft.id});
  if(!parsed.success){setError(Number.isNaN(draft.netOverride)?tx('盈虧格式不正確，請輸入 +1000 或 -1000 之類的金額。'):tradeIssueMessage(parsed.error.issues[0]));return;}
  setBusy(true);
  try{
   const t={...parsed.data};if(demo)t.id=draft.id;
   if(file&&!demo){
    const body=new FormData();body.set('file',file);const r=await fetch('/api/images',{method:'POST',body});const data=await r.json() as {error?:string;id:string;duplicate?:{count:number;step:number}};
    if(!r.ok)throw new Error(data.error||tx('截圖上傳失敗'));
    t.imageId=data.id;setDraft(t);
    if(previewObjectUrl.current){URL.revokeObjectURL(previewObjectUrl.current);previewObjectUrl.current='';}
    setPreview(`/api/images/${data.id}`);setFile(null);
    if(!trade&&data.duplicate?.count&&data.duplicate.step<1){setDuplicate({imageId:data.id,...data.duplicate});return;}
   }
   await onSave(t,demo?undefined:targetProfileId);onClose();
  }catch(e){const detail=e as Error&{duplicate?:{count:number;step:number};imageId?:string;tradeDuplicates?:TradeDuplicate[]};if(detail.duplicate&&detail.imageId)setDuplicate({imageId:detail.imageId,...detail.duplicate});else if(detail.tradeDuplicates?.[0])setTradeDuplicate(detail.tradeDuplicates[0]);else setError(e instanceof Error?e.message:tx('儲存失敗，請重試'));}
  finally{setBusy(false);}
 }
 async function confirmTradeDuplicate(){if(!tradeDuplicate)return;setBusy(true);setError('');try{const candidate={...draft};const response=await fetch('/api/imports/check-trades',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trades:[candidate],profileId:targetProfileId,confirm:{tradeId:candidate.id,step:1,fingerprint:tradeDuplicate.fingerprint}})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||tx('確認失敗'));await onSave(candidate,targetProfileId);setTradeDuplicate(null);onClose();}catch(e){const detail=e as Error&{duplicate?:{count:number;step:number};imageId?:string;tradeDuplicates?:TradeDuplicate[]};if(detail.duplicate&&detail.imageId)setDuplicate({imageId:detail.imageId,...detail.duplicate});else if(detail.tradeDuplicates?.[0])setTradeDuplicate(detail.tradeDuplicates[0]);else setError(e instanceof Error?e.message:tx('儲存失敗，請重試'));}finally{setBusy(false);}}
 const timezoneLabel=`${tx(timezoneName(timezone))} · ${utcOffsetLabel(timezone)}`;
 return <>
  <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}>
   <DialogContent className="trade-editor sm:max-w-[900px]" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{trade?tx('編輯交易'):tx('記下這筆交易')}</DialogTitle><DialogDescription>{demo?tx('示範模式：變更只在本次瀏覽有效。'):tx('已平倉交易 · 時間使用 {0}',[timezoneLabel])}</DialogDescription></DialogHeader>
    {draft&&<form onSubmit={submit} noValidate>
     <fieldset disabled={busy}>
      <div className="editor-body">
       <div className="editor-main"><h3>{tx('交易資訊')}</h3>{!demo&&<TradingAccountSelect accounts={accounts} value={targetProfileId} onChange={setProfileOverride} disabled={!!trade}/>}<TradeFields key={draft.id} trade={draft} onChange={value=>{setDraft(value);setTradeDuplicate(null);}}/></div>
       <aside className="editor-aside"><h3>{tx('交易截圖')}</h3><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>chooseFile(e.target.files?.[0])}/>
        {preview?<div className="image-preview"><img src={preview} alt={tx('交易截圖預覽')}/><button type="button" aria-label={tx('移除截圖')} onClick={()=>{if(previewObjectUrl.current)URL.revokeObjectURL(previewObjectUrl.current);previewObjectUrl.current='';setFile(null);setPreview('');setDraft({...draft,imageId:null});}}><X size={16}/></button></div>:<button type="button" className="upload-zone" disabled={demo||busy} onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!demo&&!busy)chooseFile(e.dataTransfer.files[0]);}}><ImagePlus size={30}/><strong>{demo?tx('在我的紀錄保存截圖'):tx('點選或拖曳上傳截圖')}</strong><span>{tx('PNG、JPG、WebP · 最大 5 MB')}</span></button>}
        <div className="ai-note"><ScanLine size={19}/><div><strong>{tx('同一張圖有多筆交易？')}</strong><p>{tx('主頁的「截圖匯入」可逐筆確認並分開儲存。自動辨識需先啟用辨識服務。')}</p></div></div>
       </aside>
     </div>
     {tradeDuplicate&&<TradeDuplicateWarning duplicate={tradeDuplicate} busy={busy} onConfirm={()=>void confirmTradeDuplicate()}/>}
     </fieldset>
     <div className="editor-footer"><p>{demo?tx('示範變更不會永久儲存。'):tx('這筆交易將保存到所選交易帳號；策略可空白。')}</p><div><button className="outline-button" type="button" onClick={onClose} disabled={busy}>{tx('取消')}</button><button className="primary-button" type="submit" disabled={busy||(!demo&&!targetProfileId)}>{busy?<LoaderCircle className="animate-spin" size={16}/>:<Save size={16}/>} {busy?tx('儲存中…'):tx('儲存交易')}</button></div></div>
     {error&&<p className="form-error" role="alert">{tx('無法儲存：')}{tx(error)}</p>}
    </form>}
   </DialogContent>
  </Dialog>
  {duplicate&&<DuplicateNotice key={duplicate.imageId} check={duplicate} onCancel={()=>{setDuplicate(null);setError(tx('已取消重複新增，交易尚未儲存。'));}} onApproved={()=>{setDuplicate(null);void submit();}}/>}
 </>;
}
