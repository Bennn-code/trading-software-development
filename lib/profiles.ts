import { db,ApiError } from './server';

export type TradingProfile={id:string;name:string;isMain:boolean;createdAt:string;tradeCount:number};
export type ProfilePreferences={language:string;showDemoData:boolean;timezone:string;baseCurrency:string;pnlColor:string};

type ProfileRow={
 id:string;name:string;is_main:number;created_at:string;active_profile_id:string|null;trade_count:number;
 language:string|null;show_demo_data:number|null;timezone:string|null;base_currency:string|null;pnl_color:string|null;
};

async function readProfiles(userId:string){
 return db().prepare(`SELECT p.id,p.name,p.is_main,p.created_at,ap.active_profile_id,
   ap.language,ap.show_demo_data,ap.timezone,ap.base_currency,ap.pnl_color,COUNT(t.id) AS trade_count
   FROM trading_profiles p
   LEFT JOIN account_preferences ap ON ap.user_id=p.user_id
   LEFT JOIN trades t ON t.user_id=p.user_id AND t.profile_id=p.id
   WHERE p.user_id=?
   GROUP BY p.id,p.name,p.is_main,p.created_at,ap.active_profile_id,ap.language,ap.show_demo_data,ap.timezone,ap.base_currency,ap.pnl_color
   ORDER BY p.is_main DESC,p.created_at`).bind(userId).all<ProfileRow>();
}

export async function ensureProfiles(userId:string){
 const database=db();let rows=await readProfiles(userId);
 if(!rows.results.length){
  const id=crypto.randomUUID(),at=new Date().toISOString();
  await database.prepare('INSERT INTO trading_profiles (id,user_id,name,is_main,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,userId,'主要帳戶',1,at,at).run();
  await database.prepare("UPDATE trades SET profile_id=? WHERE user_id=? AND profile_id=''").bind(id,userId).run();
  await database.prepare("UPDATE reviews SET profile_id=? WHERE user_id=? AND profile_id=''").bind(id,userId).run();
  await database.prepare("INSERT INTO account_preferences (user_id,language,show_demo_data,timezone,base_currency,pnl_color,active_profile_id,updated_at) VALUES (?,'zh-Hant',1,'Asia/Taipei','auto','green_gain',?,?) ON CONFLICT(user_id) DO UPDATE SET active_profile_id=COALESCE(account_preferences.active_profile_id,excluded.active_profile_id),updated_at=excluded.updated_at").bind(userId,id,at).run();
  rows=await readProfiles(userId);
 }
 const preferred=rows.results[0].active_profile_id;
 const active=rows.results.find(row=>row.id===preferred)?.id??rows.results[0].id;
 if(active!==preferred)await database.prepare('UPDATE account_preferences SET active_profile_id=?,updated_at=? WHERE user_id=?').bind(active,new Date().toISOString(),userId).run();
 const row=rows.results[0];
 const preferences:ProfilePreferences|null=row.language===null?null:{language:row.language,showDemoData:!!row.show_demo_data,timezone:row.timezone??'Asia/Taipei',baseCurrency:row.base_currency??'auto',pnlColor:row.pnl_color??'green_gain'};
 return {activeProfileId:active,profiles:rows.results.map(profile=>({id:profile.id,name:profile.name,isMain:!!profile.is_main,createdAt:profile.created_at,tradeCount:profile.trade_count})) as TradingProfile[],preferences};
}
export async function activeProfile(userId:string){const {activeProfileId}=await ensureProfiles(userId);if(!activeProfileId)throw new ApiError('找不到交易子帳號',409);return activeProfileId;}
