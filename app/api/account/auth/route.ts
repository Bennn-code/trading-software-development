import { emailClient } from '@/lib/account-auth';
import { authSchema, authError, sameOrigin } from '@/lib/account-validation';
import { ApiError, json, failure } from '@/lib/server';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new ApiError('不允許跨網站操作', 403);
    const parsed = authSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0].message);
    const input = parsed.data, client = await emailClient(request);
    if (!client) throw new ApiError('電子郵件註冊尚未啟用，請等待網站管理者完成設定。', 503);
    if (input.action === 'logout') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new ApiError('登出未完成，請重試。', 503);
      return json({ ok: true });
    }
    if (input.action === 'signup') {
      const { data, error } = await client.auth.signUp({ email: input.email, password: input.password });
      if (error) throw new ApiError(authError(error.code), error.status === 429 ? 429 : 400);
      // Fail closed if the provider's mandatory email confirmation was disabled.
      if (data.session) { await client.auth.signOut({ scope: 'local' }); throw new ApiError('網站的電子郵件驗證設定尚未完成，請聯絡管理者。', 503); }
      return json({ ok: true, verify: true });
    }
    if (input.action === 'resend') {
      const { error } = await client.auth.resend({ type: 'signup', email: input.email });
      if (error) throw new ApiError(authError(error.code), error.status === 429 ? 429 : 400);
      return json({ ok: true });
    }
    const result = input.action === 'login'
      ? await client.auth.signInWithPassword({ email: input.email, password: input.password })
      : await client.auth.verifyOtp({ email: input.email, token: input.code, type: 'email' });
    if (result.error) throw new ApiError(authError(result.error.code), result.error.status === 429 ? 429 : 400);
    if (!result.data.user?.email_confirmed_at || !result.data.session) {
      await client.auth.signOut({ scope: 'local' }); throw new ApiError('請先完成電子郵件驗證。', 401);
    }
    return json({ ok: true });
  } catch (e) { if (e instanceof SyntaxError) return json({ error: '請提供有效的資料。' }, 400); return failure(e); }
}
