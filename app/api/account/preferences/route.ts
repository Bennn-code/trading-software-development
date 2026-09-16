import { languageSchema, sameOrigin } from '@/lib/account-validation';
import { identity, db, json, ApiError, failure } from '@/lib/server';
export async function PUT(request: Request) {
  try {
    if (!sameOrigin(request)) throw new ApiError('不允許跨網站操作', 403);
    const userId = await identity(request, true);
    const input = await request.json() as {language?:unknown}, parsed = languageSchema.safeParse(input.language);
    if (!parsed.success) throw new ApiError('不支援此語言');
    await db().prepare('INSERT INTO account_preferences (user_id, language, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language, updated_at=excluded.updated_at').bind(userId, parsed.data, new Date().toISOString()).run();
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
