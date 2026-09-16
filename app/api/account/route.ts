import { currentAccount, emailAuthConfigured } from '@/lib/account-auth';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { db, json, failure } from '@/lib/server';
export async function GET(request: Request) {
  try {
    const account = await currentAccount(request);
    const legacy = await getChatGPTUser();
    const preference = account ? await db().prepare('SELECT language FROM account_preferences WHERE user_id = ?').bind(account.userId).first<{language:string}>() : null;
    return json({ account, emailEnabled: emailAuthConfigured(), language: preference?.language ?? null, canLink: !!legacy && account?.provider === 'email' && !account.linked });
  } catch (e) { return failure(e); }
}
