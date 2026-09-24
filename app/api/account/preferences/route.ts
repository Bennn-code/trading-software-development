import { sameOrigin } from '@/lib/account-validation';
import { identity, db, json, ApiError, failure, readJson } from '@/lib/server';
import { preferenceSchema } from '@/lib/preferences';
import { enforceRateLimit } from '@/lib/security';
export async function PUT(request: Request) {
  try {
    if (!sameOrigin(request)) throw new ApiError('不允許跨網站操作', 403);
    const userId = await identity(request, true);
    await enforceRateLimit(request,{scope:'account-preferences',limit:120,windowSeconds:3600,subject:userId});
    const parsed=preferenceSchema.safeParse(await readJson(request,16000));if(!parsed.success)throw new ApiError('設定內容不正確');const input=parsed.data,at=new Date().toISOString();
    const current=await db().prepare('SELECT language,show_demo_data,timezone,base_currency,pnl_color,active_profile_id FROM account_preferences WHERE user_id=?').bind(userId).first<{language:string;show_demo_data:number;timezone:string;base_currency:string;pnl_color:string;active_profile_id:string|null}>();
    await db().prepare('INSERT INTO account_preferences (user_id,language,show_demo_data,timezone,base_currency,pnl_color,active_profile_id,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,show_demo_data=excluded.show_demo_data,timezone=excluded.timezone,base_currency=excluded.base_currency,pnl_color=excluded.pnl_color,updated_at=excluded.updated_at').bind(userId,input.language??current?.language??'zh-Hant',input.showDemoData===undefined?(current?.show_demo_data??1):(input.showDemoData?1:0),input.timezone??current?.timezone??'Asia/Taipei',input.baseCurrency??current?.base_currency??'auto',input.pnlColor??current?.pnl_color??'green_gain',current?.active_profile_id??null,at).run();
    return json({ ok: true });
  } catch (e) { return failure(e); }
}
