import { z } from 'zod';
export const timezoneOptions=[
 ['Asia/Taipei','台北','UTC+8'],['Asia/Hong_Kong','香港','UTC+8'],['Asia/Shanghai','上海','UTC+8'],['Asia/Singapore','新加坡','UTC+8'],['Asia/Tokyo','東京','UTC+9'],['America/New_York','紐約','UTC−5／UTC−4'],['America/Chicago','芝加哥','UTC−6／UTC−5'],['America/Los_Angeles','洛杉磯','UTC−8／UTC−7'],['Europe/London','倫敦','UTC+0／UTC+1']
] as const;
export const baseCurrencies=['auto','USD','USDT','TWD','CNY','HKD'] as const;
export const preferenceSchema=z.object({
 language:z.enum(['zh-Hant','zh-Hans','yue-Hant','en']).optional(),showDemoData:z.boolean().optional(),
 timezone:z.enum(timezoneOptions.map(v=>v[0]) as [string,...string[]]).optional(),baseCurrency:z.enum(baseCurrencies).optional(),pnlColor:z.enum(['green_gain','red_gain']).optional(),
}).refine(v=>Object.keys(v).length>0,'沒有可更新的設定');
export type UserPreferences={language:'zh-Hant'|'zh-Hans'|'yue-Hant'|'en';showDemoData:boolean;timezone:string;baseCurrency:typeof baseCurrencies[number];pnlColor:'green_gain'|'red_gain';activeProfileId:string|null};
export const defaultPreferences:UserPreferences={language:'zh-Hant',showDemoData:true,timezone:'Asia/Taipei',baseCurrency:'auto',pnlColor:'green_gain',activeProfileId:null};
export function localDateTime(date=new Date(),timeZone='Asia/Taipei'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
