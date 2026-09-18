import { z } from 'zod';
export const languageSchema = z.enum(['zh-Hant', 'zh-Hans', 'yue-Hant', 'en']);
export const emailSchema = z.string().trim().email('請輸入有效的電子郵件地址').max(254).transform(s => s.toLowerCase());
export const passwordSchema = z.string()
  .min(8, '密碼至少需要 8 個字元')
  .max(128, '密碼最多 128 個字元')
  .regex(/[a-z]/, '密碼至少需要一個小寫英文字母')
  .regex(/[A-Z]/, '密碼至少需要一個大寫英文字母');
export const otpSchema = z.string().regex(/^\d{6}$/, '請輸入信件中的 6 位數驗證碼');
export const authSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('signup'), email: emailSchema, password: passwordSchema }),
  z.object({ action: z.literal('login'), email: emailSchema, password: z.string().min(1).max(128) }),
  z.object({ action: z.literal('verify'), email: emailSchema, code: otpSchema }),
  z.object({ action: z.literal('resend'), email: emailSchema }),
  z.object({ action: z.literal('logout') }),
]);
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export function authError(code?: string) {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return '操作太頻繁，請稍後再試。';
  if (code === 'email_not_confirmed') return '電子郵件尚未驗證，請輸入驗證碼或重新寄送。';
  if (code === 'otp_expired') return '驗證碼錯誤或已過期，請重新寄送。';
  if (code === 'weak_password') return '密碼強度不足，請使用至少 8 位且包含大小寫英文字母的密碼。';
  return '操作未完成，請確認電子郵件、密碼或驗證碼後再試。';
}
