import { z } from 'zod';
export const timezoneOptions=[
 ['UTC','世界標準時間'],['Pacific/Honolulu','檀香山'],['America/Anchorage','安克拉治'],['America/Vancouver','溫哥華'],['America/Los_Angeles','洛杉磯'],['America/Denver','丹佛'],['America/Chicago','芝加哥'],['America/Toronto','多倫多'],['America/New_York','紐約'],['America/Mexico_City','墨西哥城'],['America/Sao_Paulo','聖保羅'],['America/Argentina/Buenos_Aires','布宜諾斯艾利斯'],['Europe/Lisbon','里斯本'],['Europe/London','倫敦'],['Europe/Dublin','都柏林'],['Europe/Paris','巴黎'],['Europe/Amsterdam','阿姆斯特丹'],['Europe/Brussels','布魯塞爾'],['Europe/Madrid','馬德里'],['Europe/Rome','羅馬'],['Europe/Berlin','法蘭克福／柏林'],['Europe/Zurich','蘇黎世'],['Europe/Stockholm','斯德哥爾摩'],['Europe/Warsaw','華沙'],['Africa/Johannesburg','約翰尼斯堡'],['Africa/Cairo','開羅'],['Europe/Istanbul','伊斯坦堡'],['Asia/Riyadh','利雅德'],['Asia/Dubai','杜拜'],['Asia/Karachi','喀拉蚩'],['Asia/Kolkata','孟買／加爾各答'],['Asia/Dhaka','達卡'],['Asia/Bangkok','曼谷'],['Asia/Ho_Chi_Minh','胡志明市'],['Asia/Jakarta','雅加達'],['Asia/Singapore','新加坡'],['Asia/Kuala_Lumpur','吉隆坡'],['Asia/Shanghai','上海'],['Asia/Hong_Kong','香港'],['Asia/Taipei','台北'],['Asia/Manila','馬尼拉'],['Asia/Seoul','首爾'],['Asia/Tokyo','東京'],['Australia/Perth','伯斯'],['Australia/Adelaide','阿德雷德'],['Australia/Brisbane','布里斯本'],['Australia/Sydney','雪梨'],['Australia/Melbourne','墨爾本'],['Pacific/Auckland','奧克蘭']
] as const;
export const currencyOptions=[
 ['USD','美元'],['USDT','泰達幣'],['TWD','新台幣'],['CNY','人民幣'],['HKD','港幣'],['JPY','日圓'],['EUR','歐元'],['GBP','英鎊'],['AUD','澳幣'],['CAD','加拿大幣'],['CHF','瑞士法郎'],['SGD','新加坡幣'],['KRW','韓元'],['INR','印度盧比'],['THB','泰銖'],['MYR','馬來西亞令吉'],['NZD','紐西蘭幣'],['PHP','菲律賓披索'],['IDR','印尼盾'],['AED','阿聯酋迪拉姆'],['SAR','沙烏地里亞里爾'],['ZAR','南非蘭特'],['BRL','巴西里亞爾'],['MXN','墨西哥披索'],['TRY','土耳其里拉']
] as const;
export const baseCurrencies=['auto',...currencyOptions.map(v=>v[0])] as const;
export type BaseCurrency=typeof baseCurrencies[number];
export function currencyName(code:string){return currencyOptions.find(v=>v[0]===code)?.[1]??code;}
export function timezoneName(zone:string){return timezoneOptions.find(v=>v[0]===zone)?.[1]??zone;}
export function utcOffsetLabel(zone:string,date=new Date()){
 try{const part=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value??'GMT';return part.replace('GMT','UTC').replace(/([+-])0(\d)(?=:|$)/,'$1$2').replace(':00','');}catch{return 'UTC';}
}
export const preferenceSchema=z.object({
 language:z.enum(['zh-Hant','zh-Hans','yue-Hant','en']).optional(),showDemoData:z.boolean().optional(),
 timezone:z.enum(timezoneOptions.map(v=>v[0]) as [string,...string[]]).optional(),baseCurrency:z.enum(baseCurrencies as unknown as [string,...string[]]).optional(),pnlColor:z.enum(['green_gain','red_gain']).optional(),
}).refine(v=>Object.keys(v).length>0,'沒有可更新的設定');
export type UserPreferences={language:'zh-Hant'|'zh-Hans'|'yue-Hant'|'en';showDemoData:boolean;timezone:string;baseCurrency:BaseCurrency;pnlColor:'green_gain'|'red_gain';activeProfileId:string|null};
export const defaultPreferences:UserPreferences={language:'zh-Hant',showDemoData:true,timezone:'Asia/Taipei',baseCurrency:'auto',pnlColor:'green_gain',activeProfileId:null};
export function localDateTime(date=new Date(),timeZone='Asia/Taipei'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
