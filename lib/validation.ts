import { z } from 'zod';
const amount=z.number().finite().min(0).max(1e12);
const time=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,'請填寫完整日期與時間').refine(s=>{const d=new Date(s+'Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,16)===s;},'時間格式不正確');
export const tradeSchema=z.object({
 id:z.string().uuid(),market:z.enum(['futures','crypto']),symbol:z.string().trim().min(1).max(30),side:z.enum(['long','short']),
 account:z.string().trim().min(1).max(80),currency:z.enum(['USD','USDT']),entryTime:time,exitTime:time,
 entry:amount.positive(),exit:amount.positive(),quantity:amount.positive(),multiplier:amount.positive(),
 fees:amount,funding:z.number().finite().min(-1e12).max(1e12),strategy:z.preprocess(v=>v??'',z.string().trim().max(80)),notes:z.string().max(10000),
 imageId:z.string().uuid().nullable(),netOverride:z.number().finite().min(-1e15).max(1e15).nullable(),
 positionValue:amount.positive().nullable().optional(),leverage:z.number().finite().min(1).max(1000).nullable().optional(),
 marginMode:z.enum(['cross','isolated']).nullable().optional(),profitBasis:z.enum(['net','gross']).optional(),
}).refine(t=>t.exitTime>=t.entryTime,{message:'出場時間不可早於進場時間',path:['exitTime']})
.refine(t=>t.market!=='futures'||Number.isInteger(t.quantity),{message:'期貨口數必須為整數',path:['quantity']})
.transform(t=>t.market==='crypto'?{...t,multiplier:1,quantity:t.positionValue!=null?t.positionValue/t.entry:t.quantity}:t);
