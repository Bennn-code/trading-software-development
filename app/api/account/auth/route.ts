import { emailClient } from '@/lib/account-auth';
import { authSchema, authError, sameOrigin } from '@/lib/account-validation';
import { ApiError, json, failure, readJson } from '@/lib/server';
import { enforceRateLimit, recordSecurityEvent, verifyTurnstile } from '@/lib/security';
export async function POST(request: Request) {
  let eventAction='unknown';
  try {
    if (!sameOrigin(request)) throw new ApiError('不允許跨網站操作', 403);
    const parsed = authSchema.safeParse(await readJson(request,20000));
    if (!parsed.success) throw new ApiError(parsed.error.issues[0].message);
    const input = parsed.data;eventAction=input.action;
    if('website' in input&&input.website)throw new ApiError('操作未完成，請稍後再試。',400);
    if('email' in input){
      await enforceRateLimit(request,{scope:`auth-${input.action}`,limit:input.action==='login'?10:5,windowSeconds:600,subject:input.email,ipLimit:input.action==='login'?100:30});
      if(['signup','login','resend','forgot'].includes(input.action))await verifyTurnstile(request,'turnstileToken' in input?input.turnstileToken:undefined);
    }else await enforceRateLimit(request,{scope:`auth-${input.action}`,limit:20,windowSeconds:600,ipLimit:60});
    const client = await emailClient(request);
    if (!client) throw new ApiError('電子郵件註冊尚未啟用，請等待網站管理者完成設定。', 503);
    if (input.action === 'logout') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new ApiError('登出未完成，請重試。', 503);
      await recordSecurityEvent(request,'logout',null);
      return json({ ok: true });
    }
    if(input.action==='forgot'){
      const {error}=await client.auth.resetPasswordForEmail(input.email,{redirectTo:`${new URL(request.url).origin}/?mode=mine&view=settings&recovery=1`});
      if(error&&error.status===429)throw new ApiError(authError(error.code),429);
      await recordSecurityEvent(request,'password_reset_requested',null);
      return json({ok:true});
    }
    if(input.action==='recoveryExchange'){
      const {error}=await client.auth.exchangeCodeForSession(input.code);if(error)throw new ApiError('重設密碼連結已失效，請重新申請。',400);
      return json({ok:true,reset:true});
    }
    if(input.action==='updatePassword'){
      const {data}=await client.auth.getUser();if(!data.user)throw new ApiError('重設密碼連結已失效，請重新申請。',401);
      const {error}=await client.auth.updateUser({password:input.password});if(error)throw new ApiError(authError(error.code),400);
      await client.auth.signOut({scope:'others'});await recordSecurityEvent(request,'password_changed',`email:${data.user.id}`);
      return json({ok:true});
    }
    if (input.action === 'signup') {
      const { data, error } = await client.auth.signUp({ email: input.email, password: input.password });
      if (error) throw new ApiError(authError(error.code), error.status === 429 ? 429 : 400);
      // Fail closed if the provider's mandatory email confirmation was disabled.
      if (data.session) { await client.auth.signOut({ scope: 'local' }); throw new ApiError('網站的電子郵件驗證設定尚未完成，請聯絡管理者。', 503); }
      await recordSecurityEvent(request,'signup_requested',null);return json({ ok: true, verify: true });
    }
    if (input.action === 'resend') {
      const { error } = await client.auth.resend({ type: 'signup', email: input.email });
      if (error) throw new ApiError(authError(error.code), error.status === 429 ? 429 : 400);
      await recordSecurityEvent(request,'verification_resent',null);return json({ ok: true });
    }
    const result = input.action === 'login'
      ? await client.auth.signInWithPassword({ email: input.email, password: input.password })
      : await client.auth.verifyOtp({ email: input.email, token: input.code, type: 'email' });
    if (result.error) throw new ApiError(authError(result.error.code), result.error.status === 429 ? 429 : 400);
    if (!result.data.user?.email_confirmed_at || !result.data.session) {
      await client.auth.signOut({ scope: 'local' }); throw new ApiError('請先完成電子郵件驗證。', 401);
    }
    await recordSecurityEvent(request,input.action==='login'?'login_success':'email_verified',`email:${result.data.user.id}`);
    return json({ ok: true });
  } catch (e) { await recordSecurityEvent(request,'auth_failed',null,{action:eventAction,status:e instanceof ApiError?e.status:500});if (e instanceof SyntaxError) return json({ error: '請提供有效的資料。' }, 400); return failure(e); }
}
