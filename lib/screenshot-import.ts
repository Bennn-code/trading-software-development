import { z } from 'zod';
import { multipliers, type Trade } from './trades';
const number=z.number().finite().nullable();
const text=z.string().max(300).nullable();
const fill=z.object({price:z.number().finite().positive(),quantity:z.number().finite().positive()});
export const extractedRowSchema=z.object({
 sourceLabel:z.string().max(200),symbol:text,market:z.enum(['futures','crypto']).nullable(),side:z.enum(['long','short']).nullable(),
 currency:z.enum(['USD','USDT']).nullable(),entryTime:text,exitTime:text,entry:number,exit:number,quantity:number,multiplier:number,
 fees:number,funding:number,netProfit:number,netProfitIsNet:z.boolean(),strategy:text,
 entryFills:z.array(fill).max(100),exitFills:z.array(fill).max(100),completeFillHistory:z.boolean(),
 warnings:z.array(z.string().max(500)).max(30),
});
export const extractionSchema=z.object({trades:z.array(extractedRowSchema).max(50),warnings:z.array(z.string().max(500)).max(30)});
export type ExtractedRow=z.infer<typeof extractedRowSchema>;
export type ImportCandidate={trade:Trade;warnings:string[];sourceLabel:string;entryBasis:string;exitBasis:string;selected:boolean;confirmed:boolean};
const nullable=(type:string)=>({type:[type,'null']});
const fillJson={type:'object',properties:{price:{type:'number'},quantity:{type:'number'}},required:['price','quantity'],additionalProperties:false};
const properties={
 sourceLabel:{type:'string'},symbol:nullable('string'),market:{type:['string','null'],enum:['futures','crypto',null]},side:{type:['string','null'],enum:['long','short',null]},currency:{type:['string','null'],enum:['USD','USDT',null]},
 entryTime:nullable('string'),exitTime:nullable('string'),entry:nullable('number'),exit:nullable('number'),quantity:nullable('number'),multiplier:nullable('number'),fees:nullable('number'),funding:nullable('number'),netProfit:nullable('number'),netProfitIsNet:{type:'boolean'},strategy:nullable('string'),
 entryFills:{type:'array',items:fillJson},exitFills:{type:'array',items:fillJson},completeFillHistory:{type:'boolean'},warnings:{type:'array',items:{type:'string'}},
};
export const extractionJsonSchema={type:'object',properties:{trades:{type:'array',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}},warnings:{type:'array',items:{type:'string'}}},required:['trades','warnings'],additionalProperties:false};
export function weightedPrice(fills:{price:number;quantity:number}[]){const qty=fills.reduce((s,f)=>s+f.quantity,0);return qty>0?fills.reduce((s,f)=>s+f.price*f.quantity,0)/qty:null;}
export function normalizeTime(value:string|null,offset:number){if(!value||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return '';const stamp=Date.parse(value+'Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,16)!==value)return '';return new Date(stamp+(8-offset)*3600000).toISOString().slice(0,16);}
export function normalizeRow(row:ExtractedRow,context:{id:string;imageId:string;account:string;offset:number}):ImportCandidate{
 const warnings=[...row.warnings];
 const entryQty=row.entryFills.reduce((s,f)=>s+f.quantity,0),exitQty=row.exitFills.reduce((s,f)=>s+f.quantity,0);
 const balanced=entryQty>0&&Math.abs(entryQty-exitQty)<Math.max(1e-9,entryQty*1e-8);
 const canAverage=row.completeFillHistory&&balanced;
 const entry=row.entry??(canAverage?weightedPrice(row.entryFills):null),exit=row.exit??(canAverage?weightedPrice(row.exitFills):null);
 const quantity=row.quantity??(canAverage?exitQty:null);
 if(!row.market)warnings.push('市場未能辨識，請確認市場類型。');
 if(!row.side)warnings.push('多空方向未能辨識，請確認。');
 if(!row.currency)warnings.push('計價幣別未能辨識，請確認。');
 if(row.fees===null)warnings.push('截圖未顯示手續費，目前暫填 0。');
 if(row.funding===null&&row.market==='crypto')warnings.push('截圖未顯示資金費，目前暫填 0。');
 if((row.entryFills.length||row.exitFills.length)&&!canAverage&&(row.entry===null||row.exit===null))warnings.push('成交明細不完整或進出數量不同，不能可靠計算加權均價，請補齊。');
 const symbol=(row.symbol??'').trim().toUpperCase();
 const futuresRoot=Object.keys(multipliers).sort((a,b)=>b.length-a.length).find(s=>symbol===s||new RegExp('^'+s+'[FGHJKMNQUVXZ]\\d{1,4}$').test(symbol));
 const multiplier=row.market==='crypto'?1:row.multiplier??(futuresRoot?multipliers[futuresRoot]:0);
 if(row.market==='crypto'&&row.multiplier!==null&&row.multiplier!==1)warnings.push('此商品的合約乘數不是 1；請改用帳單淨損益，並確認金額與幣別。');
 const trade:Trade={id:context.id,imageId:context.imageId,account:context.account,symbol,market:row.market??'futures',side:row.side??'long',currency:row.currency??(row.market==='crypto'?'USDT':'USD'),entryTime:normalizeTime(row.entryTime,context.offset),exitTime:normalizeTime(row.exitTime,context.offset),entry:entry??0,exit:exit??0,quantity:quantity??0,multiplier,fees:row.fees??0,funding:row.funding??0,strategy:row.strategy??'',notes:'',netOverride:row.netProfitIsNet?row.netProfit:null};
 return {trade,warnings:[...new Set(warnings)],sourceLabel:row.sourceLabel,entryBasis:row.entry!==null?'由截圖直接辨識':entry!==null?'由完整成交明細加權計算':'未能辨識，請補填',exitBasis:row.exit!==null?'由截圖直接辨識':exit!==null?'由完整成交明細加權計算':'未能辨識，請補填',selected:true,confirmed:false};
}
export async function stableImportId(owner:string,digest:string,index:number){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${owner}:${digest}:${index}`));const hex=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
