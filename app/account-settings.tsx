'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Download, Globe, KeyRound, Mail, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useI18n } from './language-provider';
import type { Account } from '@/lib/account-auth';

type AccountInfo={account:Account|null;emailEnabled:boolean;canLink:boolean;turnstileSiteKey:string|null;accountDeletionReady:boolean};
type SecurityEvent={type:string;label:string;createdAt:string};
declare global{interface Window{turnstile?:{render:(node:HTMLElement,options:Record<string,unknown>)=>string;reset:(id:string)=>void}}}

export default function AccountSettings(){
 const {language,setLanguage,t,preferenceError}=useI18n();
 const [info,setInfo]=useState<AccountInfo|null>(null),[error,setError]=useState(''),[linkConfirm,setLinkConfirm]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/account').then(async r=>{const d=await r.json() as AccountInfo&{error?:string};if(!r.ok)throw new Error(d.error);if(active)setInfo(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function action(path:string){setBusy(true);setError('');try{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});const d=await r.json() as{error?:string};if(!r.ok)throw new Error(d.error);window.location.assign('/?mode=mine&view=settings');}catch(e){setError(e instanceof Error?e.message:'操作失敗，請重試');setBusy(false);}}
 return <div className="account-settings">
  <section className="panel settings-panel"><div className="settings-title"><Globe size={22}/><div><h2>{t('顯示語言')}</h2><p>{t('選擇你習慣的語言，介面會立即切換。')}</p></div></div>
   <div className="language-options" role="group" aria-label={t('顯示語言')}>{([['zh-Hant','繁體中文','Traditional Chinese'],['zh-Hans','简体中文','Simplified Chinese'],['yue-Hant','粵語','廣東話'],['en','English','英文']] as const).map(([value,label,subtitle])=><button key={value} lang={value} aria-pressed={language===value} onClick={()=>setLanguage(value)}><span><strong>{label}</strong><small>{subtitle}</small></span>{language===value&&<Check size={20}/>}</button>)}</div>
   <p className="field-hint">{t('登入後會同步到你的帳號，未登入時則保存在此瀏覽器。')}</p>{preferenceError&&<p role="alert" className="settings-error">{t(preferenceError)}</p>}
  </section>
  <section className="panel settings-panel"><div className="settings-title"><UserRound size={22}/><div><h2>{t('帳號與登入')}</h2><p>{t('使用電子郵件及密碼登入你的交易空間。')}</p></div></div>
   {error&&<p className="settings-error" role="alert">{t(error)}</p>}
   {!info?<p role="status">{t('載入中…')}</p>:<>{info.account&&<div className="current-account"><ShieldCheck size={20}/><div><strong>{info.account.email}</strong><small>{info.account.provider==='email'?t('電子郵件已驗證'):t('目前使用 ChatGPT 登入')}{info.account.linked?` · ${t('已連結原交易空間')}`:''}</small></div></div>}
    {info.account?.provider==='email'?<>{info.canLink&&<div className="account-link"><h3>{t('連結原本的交易紀錄')}</h3><p>{t('將此電子郵件帳號連結到目前登入的 ChatGPT 交易空間，以後可使用電子郵件存取原有紀錄。電子郵件空間必須沒有交易資料。')}</p><label><input type="checkbox" checked={linkConfirm} onChange={e=>setLinkConfirm(e.target.checked)}/>{t('我確認要連結這兩個自己的帳號')}</label><button className="outline-button" disabled={!linkConfirm||busy} onClick={()=>action('/api/account/link')}>{t('連結交易空間')}</button></div>}<button className="outline-button" disabled={busy} onClick={()=>action('/api/account/auth')}>{t('登出電子郵件帳號')}</button></>:<AuthForm enabled={info.emailEnabled} siteKey={info.turnstileSiteKey}/>}</>}
  </section>
  {info?.account&&<DataSecurity account={info.account} deletionReady={info.accountDeletionReady}/>}
 </div>;
}

function Turnstile({siteKey,onToken,resetKey}:{siteKey:string;onToken:(token:string)=>void;resetKey:number}){
 const ref=useRef<HTMLDivElement>(null),widget=useRef('');
 useEffect(()=>{let cancelled=false,timer:number;const render=()=>{if(cancelled||!ref.current)return;if(window.turnstile){ref.current.replaceChildren();widget.current=window.turnstile.render(ref.current,{sitekey:siteKey,callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>onToken('')});}else timer=window.setTimeout(render,150);};if(!document.querySelector('script[data-tr-turnstile]')){const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.dataset.trTurnstile='1';document.head.appendChild(script);}render();return()=>{cancelled=true;window.clearTimeout(timer);};},[siteKey,onToken]);
 useEffect(()=>{if(widget.current&&window.turnstile)window.turnstile.reset(widget.current);},[resetKey]);
 return <div className="turnstile-wrap"><div ref={ref}/></div>;
}

export function AuthForm({enabled,siteKey=null}:{enabled:boolean;siteKey?:string|null}){
 const {t}=useI18n();
 const [mode,setMode]=useState<'signup'|'login'|'verify'|'forgot'|'reset'>('signup');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState(''),[turnstileToken,setTurnstileToken]=useState(''),[resetKey,setResetKey]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[wait,setWait]=useState(0);
 useEffect(()=>{if(!wait)return;const id=setTimeout(()=>setWait(n=>n-1),1000);return()=>clearTimeout(id);},[wait]);
 useEffect(()=>{const query=new URLSearchParams(window.location.search),recoveryCode=query.get('code');if(!recoveryCode)return;setBusy(true);fetch('/api/account/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'recoveryExchange',code:recoveryCode})}).then(async r=>{const d=await r.json() as{error?:string};if(!r.ok)throw new Error(d.error);query.delete('code');query.delete('recovery');history.replaceState({},'',`${location.pathname}?${query.toString()}`);setMode('reset');setNotice('身分已確認，請設定新密碼。');}).catch(e=>setError(e instanceof Error?e.message:'重設密碼連結已失效，請重新申請。')).finally(()=>setBusy(false));},[]);
 async function submit(action:'signup'|'login'|'verify'|'resend'|'forgot'|'updatePassword'){
  setError('');setNotice('');if((action==='signup'||action==='updatePassword')&&password!==confirm){setError('兩次輸入的密碼不一致');return;}if(siteKey&&['signup','login','resend','forgot'].includes(action)&&!turnstileToken){setError('請先完成人機驗證。');return;}
  setBusy(true);try{const body={action,email,...(action==='signup'||action==='login'||action==='updatePassword'?{password}:{}),...(action==='verify'?{code}:{}),...(siteKey?{turnstileToken}:{}),website:''};const r=await fetch('/api/account/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as{error?:string};if(!r.ok){if(r.status===429)setWait(60);throw new Error(d.error);}
   if(action==='signup'||action==='resend'){setMode('verify');setPassword('');setConfirm('');setCode('');setWait(60);setNotice('若此信箱可註冊，驗證碼將寄至你的信箱。請檢查收件匣與垃圾郵件。');}
   else if(action==='forgot'){setWait(60);setNotice('若此信箱已註冊，重設密碼信件將寄至你的信箱。請開啟信件中的安全連結。');}
   else if(action==='updatePassword'){setNotice('密碼已更新，其他裝置已登出。');setMode('login');setPassword('');setConfirm('');}
   else window.location.assign('/?mode=mine&view=settings');
  }catch(e){setError(e instanceof Error?e.message:'操作失敗，請重試');}finally{setBusy(false);setTurnstileToken('');setResetKey(n=>n+1);}
 }
 const switchMode=(next:typeof mode)=>{setMode(next);setError('');setNotice('');setPassword('');setConfirm('');};
 return <div className="email-auth">
  {!enabled&&<p className="auth-unavailable" role="status">{t('電子郵件註冊尚未啟用，請等待網站管理者完成設定。')}</p>}
  {mode!=='reset'&&<div className="auth-tabs" role="group" aria-label={t('登入方式')}><button aria-pressed={mode==='signup'||mode==='verify'} disabled={busy} onClick={()=>switchMode('signup')}>{t('註冊帳號')}</button><button aria-pressed={mode==='login'||mode==='forgot'} disabled={busy} onClick={()=>switchMode('login')}>{t('登入')}</button></div>}
  <form onSubmit={e=>{e.preventDefault();void submit(mode==='forgot'?'forgot':mode==='reset'?'updatePassword':mode);}}>
   {mode!=='reset'&&<label>{t('電子郵件')}<input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy||mode==='verify'} onChange={e=>setEmail(e.target.value)}/></label>}
   {(mode==='signup'||mode==='login'||mode==='reset')&&<><label>{mode==='reset'?t('新密碼'):t('密碼')}<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:8} maxLength={128} pattern={mode==='login'?undefined:'(?=.*[a-z])(?=.*[A-Z]).{8,128}'} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>{mode!=='login'&&<><p className="field-hint">{t('密碼至少 8 個字元，並包含大寫及小寫英文字母。')}</p><label>{t('再次輸入密碼')}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z]).{8,128}" value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></label></>}</>}
   {mode==='verify'&&<label>{t('電子郵件驗證碼')}<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
   {mode==='forgot'&&<p className="auth-explain">{t('輸入註冊信箱，我們會寄送重設密碼連結。')}</p>}
   {siteKey&&mode!=='verify'&&mode!=='reset'&&<Turnstile siteKey={siteKey} onToken={setTurnstileToken} resetKey={resetKey}/>}
   {error&&<p className="settings-error" role="alert">{t(error)}</p>}{notice&&<p className="settings-notice" role="status">{t(notice)}</p>}
   <button className="primary-button" disabled={!enabled||busy||(mode==='signup'&&wait>0)||(mode==='forgot'&&wait>0)} type="submit"><Mail size={17}/>{busy?t('處理中…'):mode==='signup'?t('寄送驗證碼'):mode==='login'?t('登入'):mode==='verify'?t('確認驗證碼'):mode==='forgot'?t('寄送重設密碼信'):t('更新密碼')}</button>
  </form>
  {mode==='verify'&&<div className="auth-secondary"><button className="text-button" disabled={busy||wait>0||!enabled} onClick={()=>submit('resend')}>{t('重新寄送驗證碼')}{wait>0?` (${wait}s)`:''}</button><button className="text-button" disabled={busy} onClick={()=>switchMode('signup')}>{t('修改電子郵件')}</button></div>}
  {mode==='login'&&<div className="auth-secondary"><button className="text-button" disabled={busy||!enabled} onClick={()=>switchMode('forgot')}><KeyRound size={15}/>{t('忘記密碼')}</button><button className="text-button" disabled={busy||!enabled} onClick={()=>{setMode('verify');setPassword('');setNotice('請輸入註冊信件中的驗證碼，或按重新寄送。');}}>{t('尚未完成驗證？')}</button></div>}
  {mode==='forgot'&&<button className="text-button" disabled={busy} onClick={()=>switchMode('login')}>{t('返回登入')}</button>}
 </div>;
}

function DataSecurity({account,deletionReady}:{account:Account;deletionReady:boolean}){
 const {t}=useI18n();const [events,setEvents]=useState<SecurityEvent[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[exportToken,setExportToken]=useState('');
 const [step,setStep]=useState(0),[downloadConfirmed,setDownloadConfirmed]=useState(false),[typedEmail,setTypedEmail]=useState(''),[phrase,setPhrase]=useState(''),[password,setPassword]=useState('');
 useEffect(()=>{fetch('/api/account/security-events').then(r=>r.ok?r.json():Promise.reject()).then((d:{events:SecurityEvent[]})=>setEvents(d.events)).catch(()=>{});},[]);
 async function downloadAll(){setBusy(true);setError('');try{const response=await fetch('/api/account/export',{method:'POST'});if(!response.ok){const d=await response.json() as{error?:string};throw new Error(d.error);};const token=response.headers.get('x-account-export-token');if(!token)throw new Error('下載憑證建立失敗，請重試。');const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`tradersregion-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportToken(token);setDownloadConfirmed(false);}catch(e){setError(e instanceof Error?e.message:'下載失敗，請重試。');}finally{setBusy(false);}}
 function cancel(){setStep(0);setDownloadConfirmed(false);setTypedEmail('');setPhrase('');setPassword('');setError('');}
 async function removeAccount(){setBusy(true);setError('');try{const response=await fetch('/api/account',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({exportToken,password,confirmations:['downloaded',typedEmail,'註銷我的帳號']})});const data=await response.json() as{error?:string};if(!response.ok)throw new Error(data.error);window.location.assign('/?mode=mine');}catch(e){setError(e instanceof Error?e.message:'註銷失敗，帳號沒有刪除。');setBusy(false);}}
 return <section className="panel settings-panel data-security"><div className="settings-title"><ShieldCheck size={22}/><div><h2>{t('資料與帳號安全')}</h2><p>{t('下載完整備份、查看安全活動，或永久註銷帳號。')}</p></div></div>
  {error&&<p className="settings-error" role="alert">{t(error)}</p>}
  <div className="security-actions"><button className="outline-button" disabled={busy} onClick={downloadAll}><Download size={17}/>{busy?t('準備資料中…'):t('下載所有資料')}</button><p>{t('備份包含交易、心得、設定、安全活動與原始截圖。')}</p></div>
  <div className="security-events"><h3><Clock3 size={17}/>{t('最近安全活動')}</h3>{events.length?<ul>{events.map((event,index)=><li key={`${event.createdAt}-${index}`}><span>{t(event.label)}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>:<p className="field-hint">{t('目前沒有可顯示的安全活動。')}</p>}</div>
  <div className="danger-zone"><h3>{t('註銷帳號')}</h3><p>{t('註銷會永久刪除所有交易、心得、截圖及帳號設定，無法復原。你必須先下載完整資料。')}</p>{!deletionReady&&<p className="settings-error">{t('帳號註銷服務尚未完成安全設定，請稍後再試。')}</p>}<button className="delete-account-button" disabled={!exportToken||!deletionReady||busy} onClick={()=>setStep(1)}><Trash2 size={17}/>{t('開始註銷帳號')}</button>{!exportToken&&<small>{t('請先按上方按鈕下載所有資料。')}</small>}</div>
  <AlertDialog open={step===1} onOpenChange={open=>!open&&cancel()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('註銷確認 1／3')}</AlertDialogTitle><AlertDialogDescription>{t('請確認備份檔已成功下載並保存在安全的位置。')}</AlertDialogDescription></AlertDialogHeader><label className="delete-check"><input type="checkbox" checked={downloadConfirmed} onChange={e=>setDownloadConfirmed(e.target.checked)}/>{t('我已下載並確認完整備份')}</label><AlertDialogFooter><AlertDialogCancel onClick={cancel}>{t('取消')}</AlertDialogCancel><AlertDialogAction disabled={!downloadConfirmed} onClick={()=>setStep(2)}>{t('繼續')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={step===2} onOpenChange={open=>!open&&cancel()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('註銷確認 2／3')}</AlertDialogTitle><AlertDialogDescription>{t('請輸入目前帳號的完整電子郵件：{0}',[account.email])}</AlertDialogDescription></AlertDialogHeader><input className="delete-confirm-input" type="email" autoComplete="off" value={typedEmail} onChange={e=>setTypedEmail(e.target.value)} aria-label={t('確認電子郵件')}/><AlertDialogFooter><AlertDialogCancel onClick={cancel}>{t('取消')}</AlertDialogCancel><AlertDialogAction disabled={typedEmail.trim().toLowerCase()!==account.email.trim().toLowerCase()} onClick={()=>setStep(3)}>{t('繼續')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={step===3} onOpenChange={open=>!open&&cancel()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('註銷確認 3／3')}</AlertDialogTitle><AlertDialogDescription>{t('最後確認：輸入「註銷我的帳號」。完成後所有資料將永久刪除。')}</AlertDialogDescription></AlertDialogHeader><label className="delete-field">{t('確認文字')}<input className="delete-confirm-input" value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off"/></label>{account.provider==='email'&&<label className="delete-field">{t('目前密碼')}<input className="delete-confirm-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>}{error&&<p className="settings-error" role="alert">{t(error)}</p>}<AlertDialogFooter className="final-delete-actions"><AlertDialogAction className="confirm-delete-left" disabled={busy||phrase!=='註銷我的帳號'||(account.provider==='email'&&!password)} onClick={removeAccount}>{busy?t('註銷中…'):t('確認註銷')}</AlertDialogAction><AlertDialogCancel className="cancel-delete-green" onClick={cancel}>{t('取消註銷')}</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
