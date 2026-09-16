import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export type Account = { userId: string; email: string; provider: 'email' | 'chatgpt'; linked: boolean };
export function emailAuthConfigured() { return !!(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY); }
export async function emailClient(request: Request) {
  if (!emailAuthConfigured()) return null;
  const jar = await cookies();
  return createServerClient(env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: 'journal-auth', httpOnly: true, sameSite: 'lax', secure: new URL(request.url).protocol === 'https:', path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => { for (const { name, value, options } of values) jar.set(name, value, options); },
    },
  });
}
export async function currentAccount(request: Request): Promise<Account | null> {
  const jar = await cookies();
  const hasEmailSession = jar.getAll().some(c => c.name === 'journal-auth' || /^journal-auth\.\d+$/.test(c.name));
  if (hasEmailSession) {
    const client = await emailClient(request);
    if (!client) return null;
    // Verify with the auth server; never authorize using a cookie's user object.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email_confirmed_at || !data.user.email) return null;
    const link = await env.DB?.prepare('SELECT owner_id FROM account_links WHERE auth_id = ?').bind(data.user.id).first<{owner_id: string}>();
    return { userId: link?.owner_id ?? `email:${data.user.id}`, email: data.user.email, provider: 'email', linked: !!link };
  }
  const legacy = await getChatGPTUser();
  return legacy ? { userId: legacy.userId, email: legacy.email, provider: 'chatgpt', linked: false } : null;
}
