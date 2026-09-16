'use client';
import { useEffect, useState } from 'react';
import { Check, Globe, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useI18n } from './language-provider';
import type { Account } from '@/lib/account-auth';

type AccountInfo = { account: Account | null; emailEnabled: boolean; canLink: boolean };
export default function AccountSettings() {
  const { language, setLanguage, t, preferenceError } = useI18n();
  const [info, setInfo] = useState<AccountInfo | null>(null), [error, setError] = useState('');
  const [linkConfirm, setLinkConfirm] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; fetch('/api/account').then(async r => { const d = await r.json() as AccountInfo & {error?:string}; if (!r.ok) throw new Error(d.error); if (active) setInfo(d); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function action(path: string) {
    setBusy(true); setError('');
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      const d = await r.json() as {error?:string}; if (!r.ok) throw new Error(d.error);
      window.location.assign('/?mode=mine&view=settings');
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗，請重試'); setBusy(false); }
  }
  return <div className="account-settings">
    <section className="panel settings-panel"><div className="settings-title"><Globe size={22}/><div><h2>{t('顯示語言')}</h2><p>{t('選擇你習慣的語言，介面會立即切換。')}</p></div></div>
      <div className="language-options" role="group" aria-label={t('顯示語言')}>
        {([['zh-Hant', '繁體中文', 'Traditional Chinese'], ['zh-Hans', '简体中文', 'Simplified Chinese'], ['en', 'English', '英文']] as const).map(([value, label, subtitle]) => <button key={value} lang={value} aria-pressed={language === value} onClick={() => setLanguage(value)}><span><strong>{label}</strong><small>{subtitle}</small></span>{language === value && <Check size={20}/>}</button>)}
      </div><p className="field-hint">{t('登入後會同步到你的帳號，未登入時則保存在此瀏覽器。')}</p>{preferenceError && <p role="alert" className="settings-error">{t(preferenceError)}</p>}
    </section>
    <section className="panel settings-panel"><div className="settings-title"><UserRound size={22}/><div><h2>{t('帳號與登入')}</h2><p>{t('使用電子郵件及密碼登入你的交易空間。')}</p></div></div>
      {error && <p className="settings-error" role="alert">{t(error)}</p>}
      {!info ? <p role="status">{t('載入中…')}</p> : <>
        {info.account && <div className="current-account"><ShieldCheck size={20}/><div><strong>{info.account.email}</strong><small>{info.account.provider === 'email' ? t('電子郵件已驗證') : t('目前使用 ChatGPT 登入')}{info.account.linked ? ` · ${t('已連結原交易空間')}` : ''}</small></div></div>}
        {info.account?.provider === 'email' ? <>
          {info.canLink && <div className="account-link"><h3>{t('連結原本的交易紀錄')}</h3><p>{t('將此電子郵件帳號連結到目前登入的 ChatGPT 交易空間，以後可使用電子郵件存取原有紀錄。電子郵件空間必須沒有交易資料。')}</p><label><input type="checkbox" checked={linkConfirm} onChange={e => setLinkConfirm(e.target.checked)}/>{t('我確認要連結這兩個自己的帳號')}</label><button className="outline-button" disabled={!linkConfirm || busy} onClick={() => action('/api/account/link')}>{t('連結交易空間')}</button></div>}
          <button className="outline-button" disabled={busy} onClick={() => action('/api/account/auth')}>{t('登出電子郵件帳號')}</button>
        </> : <AuthForm enabled={info.emailEnabled}/>}
      </>}
    </section>
  </div>;
}

export function AuthForm({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'signup' | 'login' | 'verify'>('signup');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [code, setCode] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [wait, setWait] = useState(0);
  useEffect(() => { if (!wait) return; const id = setTimeout(() => setWait(n => n - 1), 1000); return () => clearTimeout(id); }, [wait]);
  async function submit(action: 'signup' | 'login' | 'verify' | 'resend') {
    setError(''); setNotice('');
    if (action === 'signup' && password !== confirm) { setError('兩次輸入的密碼不一致'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/account/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, email, ...(action === 'signup' || action === 'login' ? { password } : {}), ...(action === 'verify' ? { code } : {}) }) });
      const d = await r.json() as {error?:string}; if (!r.ok) { if (r.status === 429) setWait(60); throw new Error(d.error); }
      if (action === 'signup' || action === 'resend') { setMode('verify'); setPassword(''); setConfirm(''); setCode(''); setWait(60); setNotice('若此信箱可註冊，驗證碼將寄至你的信箱。請檢查收件匣與垃圾郵件。'); }
      else window.location.assign('/?mode=mine&view=settings');
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗，請重試'); }
    finally { setBusy(false); }
  }
  return <div className="email-auth">
    {!enabled && <p className="auth-unavailable" role="status">{t('電子郵件註冊尚未啟用，請等待網站管理者完成設定。')}</p>}
    <div className="auth-tabs" role="group" aria-label={t('登入方式')}><button aria-pressed={mode === 'signup'} disabled={busy} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>{t('註冊帳號')}</button><button aria-pressed={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>{t('登入')}</button></div>
    <form onSubmit={e => { e.preventDefault(); void submit(mode); }}>
      <label>{t('電子郵件')}<input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy || mode === 'verify'} onChange={e => setEmail(e.target.value)}/></label>
      {mode !== 'verify' ? <>
        <label>{t('密碼')}<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 12 : 1} maxLength={128} value={password} disabled={busy} onChange={e => setPassword(e.target.value)}/></label>
        {mode === 'signup' && <><p className="field-hint">{t('密碼至少 12 個字元，可使用較長的詞句。')}</p><label>{t('再次輸入密碼')}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)}/></label></>}
      </> : <label>{t('電子郵件驗證碼')}<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required minLength={6} maxLength={8} value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}/></label>}
      {error && <p className="settings-error" role="alert">{t(error)}</p>}{notice && <p className="settings-notice" role="status">{t(notice)}</p>}
      <button className="primary-button" disabled={!enabled || busy || (mode === 'signup' && wait > 0)} type="submit"><Mail size={17}/>{busy ? t('處理中…') : mode === 'signup' ? t('寄送驗證碼') : mode === 'login' ? t('登入') : t('確認驗證碼')}</button>
    </form>
    {mode === 'verify' && <div className="auth-secondary"><button className="text-button" disabled={busy || wait > 0 || !enabled} onClick={() => submit('resend')}>{t('重新寄送驗證碼')}{wait > 0 ? ` (${wait}s)` : ''}</button><button className="text-button" disabled={busy} onClick={() => { setMode('signup'); setNotice(''); setError(''); }}>{t('修改電子郵件')}</button></div>}
    {mode === 'login' && <button className="text-button" disabled={busy || !enabled} onClick={() => { setMode('verify'); setPassword(''); setNotice('請輸入註冊信件中的驗證碼，或按重新寄送。'); }}>{t('尚未完成驗證？')}</button>}
  </div>;
}
