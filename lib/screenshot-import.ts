import { z } from 'zod';
import { isFuturesMarket, marketCurrencies, multipliers, multiplierForSymbol, type Trade } from './trades';
import { convertWallTime } from './display-currency';
const number=z.number().finite().nullable();
const text=z.string().max(300).nullable();
const fill=z.object({price:z.number().finite().positive(),quantity:z.number().finite().positive()});
export const extractedRowSchema=z.object({
 sourceLabel:z.string().max(200),symbol:text,market:z.enum(['futures','tw-index-futures','crypto','us-stocks','tw-stocks','cn-stocks','hk-stocks']).nullable(),side:z.enum(['long','short']).nullable(),
 currency:z.enum(['USD','USDT','TWD','CNY','HKD']).nullable(),entryTime:text,exitTime:text,entry:number,exit:number,quantity:number,multiplier:number,
 mae:number,mfe:number,exchangeSource:z.enum(['bybit','bitget','okx','kucoin','bingx','mexc','binance']).nullable(),isPerpetual:z.boolean().nullable(),
 commission:number.optional(),commissionSource:text.optional(),transactionTax:number.optional(),transactionTaxSource:text.optional(),feeSource:text.optional(),fundingSource:text.optional(),positionValue:number.optional(),fees:number,feeMode:z.enum(['paid','rebate']).nullable().optional(),funding:number,netProfit:number,netProfitIsNet:z.boolean(),strategy:text,
 entryFills:z.array(fill).max(100),exitFills:z.array(fill).max(100),completeFillHistory:z.boolean(),
 warnings:z.array(z.string().max(500)).max(30),
});
export const extractionSchema=z.object({trades:z.array(extractedRowSchema).max(50),warnings:z.array(z.string().max(500)).max(30)});
export type ExtractedRow=z.infer<typeof extractedRowSchema>;
export type ImportCandidate={trade:Trade;warnings:string[];sourceLabel:string;entryBasis:string;exitBasis:string;selected:boolean;confirmed:boolean;costSources?:string[]};
const nullable=(type:string)=>({type:[type,'null']});
const fillJson={type:'object',properties:{price:{type:'number'},quantity:{type:'number'}},required:['price','quantity'],additionalProperties:false};
const properties={
 sourceLabel:{type:'string'},symbol:nullable('string'),market:{type:['string','null'],enum:['futures','tw-index-futures','crypto','us-stocks','tw-stocks','cn-stocks','hk-stocks',null]},side:{type:['string','null'],enum:['long','short',null]},currency:{type:['string','null'],enum:['USD','USDT','TWD','CNY','HKD',null]},
  entryTime:nullable('string'),exitTime:nullable('string'),entry:nullable('number'),exit:nullable('number'),quantity:nullable('number'),multiplier:nullable('number'),mae:nullable('number'),mfe:nullable('number'),exchangeSource:{type:['string','null'],enum:['bybit','bitget','okx','kucoin','bingx','mexc','binance',null]},isPerpetual:{type:['boolean','null']},commission:nullable('number'),commissionSource:nullable('string'),transactionTax:nullable('number'),transactionTaxSource:nullable('string'),feeSource:nullable('string'),fundingSource:nullable('string'),positionValue:nullable('number'),fees:nullable('number'),feeMode:{type:['string','null'],enum:['paid','rebate',null]},funding:nullable('number'),netProfit:nullable('number'),netProfitIsNet:{type:'boolean'},strategy:nullable('string'),
 entryFills:{type:'array',items:fillJson},exitFills:{type:'array',items:fillJson},completeFillHistory:{type:'boolean'},warnings:{type:'array',items:{type:'string'}},
};
export const extractionJsonSchema={type:'object',properties:{trades:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}},warnings:{type:'array',items:{type:'string'}}},required:['trades','warnings'],additionalProperties:false};
export function weightedPrice(fills:{price:number;quantity:number}[]){const qty=fills.reduce((s,f)=>s+f.quantity,0);return qty>0?fills.reduce((s,f)=>s+f.price*f.quantity,0)/qty:null;}
export function normalizeTime(value:string|null,sourceTimezone:number|string,targetTimezone='Asia/Taipei'){
 if(!value)return '';
 const match=value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(!match)return '';
 const [,y,m,d,h,min,sec='00']=match,canonical=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')+'T'+h.padStart(2,'0')+':'+min+':'+sec;
 const stamp=Date.parse(canonical+'Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,19)!==canonical)return '';
 if(typeof sourceTimezone==='number'){
  const instant=new Date(stamp-sourceTimezone*3600000);
  try{return new Intl.DateTimeFormat('sv-SE',{timeZone:targetTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant).replace(' ','T');}catch{return '';}
 }
 try{return convertWallTime(canonical,sourceTimezone,targetTimezone);}catch{return '';}
}
export function normalizeRow(row:ExtractedRow,context:{id:string;imageId:string;account:string;offset?:number;sourceTimezone?:string;targetTimezone?:string}):ImportCandidate{
 row={...row};
 for(const [field,source,label] of [['commission','commissionSource',/commission|brokerage|佣金|傭金|手續費|手续费/i],['transactionTax','transactionTaxSource',/證券交易稅|证券交易税|證交稅|证交税|交易稅|交易税/i],['fees','feeSource',/fee|其他費用|其他费用|交易費|交易费|平台費|平台费|監管費|监管费|結算費|结算费|返佣/i],['funding','fundingSource',/funding|資金費|资金费/i]] as const){if(source in row&&!label.test(row[source]??'')){row[field]=null;row[source]=null;}}
 const warnings=[...row.warnings];
 const entryQty=row.entryFills.reduce((s,f)=>s+f.quantity,0),exitQty=row.exitFills.reduce((s,f)=>s+f.quantity,0);
 const balanced=entryQty>0&&Math.abs(entryQty-exitQty)<Math.max(1e-9,entryQty*1e-8);
 const canAverage=row.completeFillHistory&&balanced;
 const entry=row.entry??(canAverage?weightedPrice(row.entryFills):null),exit=row.exit??(canAverage?weightedPrice(row.exitFills):null);
 const quantity=row.quantity??(canAverage?exitQty:null);
 if(!row.market)warnings.push('市場未能辨識，請確認市場類型。');
 if(!row.side)warnings.push('多空方向未能辨識，請確認。');
 if(!row.currency)warnings.push('計價幣別未能辨識，請確認。');

 if(row.fees!==null&&row.fees<0&&!row.feeMode)warnings.push('手續費以負數列示，暫按支付費用處理；若是收到返佣，請修改手續費方向後再核對。');

 if((row.entryFills.length||row.exitFills.length)&&!canAverage&&(row.entry===null||row.exit===null))warnings.push('成交明細不完整或進出數量不同，不能可靠計算加權均價，請補齊。');
 const symbol=(row.symbol??'').trim().toUpperCase();
 const futuresRoot=Object.keys(multipliers).sort((a,b)=>b.length-a.length).find(s=>symbol===s||symbol.startsWith(s));
 const isTaiwanIndexFutures=!!futuresRoot&&['TX','TXF','MTX','MXF','TMF'].includes(futuresRoot);
 const market=/USDT(?:$|[^A-Z])|永續/i.test(symbol)?'crypto':isTaiwanIndexFutures?'tw-index-futures':row.market??(row.currency==='TWD'?'tw-stocks':row.currency==='CNY'?'cn-stocks':row.currency==='HKD'?'hk-stocks':'futures');
 const multiplier=isFuturesMarket(market)?row.multiplier??multiplierForSymbol(symbol,market==='tw-index-futures'?200:0):1;
 if(row.market==='crypto'&&row.multiplier!==null&&row.multiplier!==1)warnings.push('此商品的合約乘數不是 1；請改用帳單淨損益，並確認金額與幣別。');

 const sourceTimezone=context.sourceTimezone??context.offset??8,targetTimezone=context.targetTimezone??'Asia/Taipei';
  const trade:Trade={id:context.id,imageId:context.imageId,account:context.account,symbol,market,side:row.side??'long',currency:market==='tw-index-futures'?marketCurrencies[market]:row.currency??marketCurrencies[market],entryTime:normalizeTime(row.entryTime,sourceTimezone,targetTimezone),exitTime:normalizeTime(row.exitTime,sourceTimezone,targetTimezone),timezone:targetTimezone,entry:entry??0,exit:exit??0,quantity:quantity??0,multiplier,positionValue:row.positionValue??null,commission:row.commission==null?null:Math.abs(row.commission),transactionTax:row.transactionTax==null?null:Math.abs(row.transactionTax),fees:row.fees==null?null:(row.feeMode==='rebate'?-1:1)*Math.abs(row.fees),feeMode:row.feeMode??'paid',funding:row.funding??null,strategy:row.strategy??'',notes:'',netOverride:row.netProfit,profitBasis:row.netProfitIsNet?'net':'gross',mae:row.mae==null?null:-Math.abs(row.mae),mfe:row.mfe==null?null:Math.abs(row.mfe),cryptoProductType:market==='crypto'&&row.isPerpetual!=null?(row.isPerpetual?'perpetual':'spot'):null,exchangeSource:market==='crypto'&&row.isPerpetual===true?row.exchangeSource:null};
 return {trade,costSources:[row.commissionSource,row.transactionTaxSource,row.feeSource,row.fundingSource].filter((s):s is string=>!!s),warnings:[...new Set(warnings)],sourceLabel:row.sourceLabel,entryBasis:row.entry!==null?'由截圖直接辨識':entry!==null?'由完整成交明細加權計算':'未能辨識，請補填',exitBasis:row.exit!==null?'由截圖直接辨識':exit!==null?'由完整成交明細加權計算':'未能辨識，請補填',selected:true,confirmed:false};
}
export async function stableImportId(owner:string,digest:string,index:number){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${owner}:${digest}:${index}`));const hex=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
