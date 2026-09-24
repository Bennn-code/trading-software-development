import { emailClient } from '@/lib/account-auth';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { sameOrigin } from '@/lib/account-validation';
import { db, json, ApiError, failure } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new ApiError('不允許跨網站操作', 403);
    const legacy = await getChatGPTUser(), client = await emailClient(request);
    if (!legacy || !client) throw new ApiError('請先登入原本的 ChatGPT 帳號與已驗證的電子郵件帳號。', 401);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email_confirmed_at) throw new ApiError('請先完成電子郵件驗證。', 401);
    await enforceRateLimit(request,{scope:'account-link',limit:3,windowSeconds:86400,subject:data.user.id,ipLimit:12});
    // Both identities are authenticated on the server. Never take either owner ID from the browser.
    // Link only an empty email workspace; do not hide existing trades by merging implicitly.
    const result = await db().prepare(`INSERT INTO account_links (auth_id, owner_id, created_at)
      SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM trades WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM images WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM reviews WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM account_links WHERE auth_id = ? OR owner_id = ?)`)
      .bind(data.user.id, legacy.userId, new Date().toISOString(), ...Array(3).fill(`email:${data.user.id}`), data.user.id, legacy.userId).run();
    if (!result.meta.changes) throw new ApiError('無法連結：帳號已連結，或電子郵件空間已有交易資料。請先確認兩邊紀錄。', 409);
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
