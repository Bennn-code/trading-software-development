import { z } from 'zod';
const fieldNames:Record<string,string>={id:'交易識別碼',market:'市場',symbol:'商品代號',side:'交易方向',account:'帳戶名稱',currency:'計價幣別',entryTime:'進場時間',exitTime:'出場時間',entry:'平均進場價',exit:'平均出場價',quantity:'交易數量／口數',multiplier:'每點乘數',commission:'佣金／券商手續費',transactionTax:'證券交易稅',fees:'其他交易費 Fee',feeMode:'手續費方向',funding:'資金費',strategy:'交易策略',notes:'交易心得',imageId:'交易截圖',netOverride:'盈虧',positionValue:'進場倉位金額',leverage:'槓桿倍數',marginMode:'保證金模式',profitBasis:'盈虧口徑'};
export function tradeIssueMessage(issue:z.ZodIssue) {
 const field=[...issue.path].reverse().find(p=>typeof p==='string'&&fieldNames[p]);
 const name=typeof field==='string'?fieldNames[field]:'交易資料';
 if(issue.code==='too_small'){
  if(issue.type==='number')return `${name}必須${issue.inclusive?'大於或等於':'大於'} ${issue.minimum}。`;
  if(issue.type==='string')return `請填寫${name}。`;
  if(issue.type==='array')return '請至少選擇一筆交易。';
 }
 if(issue.code==='too_big'){
  if(issue.type==='number')return `${name}不可大於 ${issue.maximum}。`;
  if(issue.type==='string')return `${name}最多 ${issue.maximum} 個字。`;
  if(issue.type==='array')return `一次最多儲存 ${issue.maximum} 筆交易。`;
 }
 if(issue.code==='invalid_type'||issue.code==='not_finite')return `${name}格式不正確，請${issue.code==='not_finite'||issue.expected==='number'?'輸入有效數字':'填寫有效資料'}。`;
 if(issue.code==='invalid_enum_value')return `請選擇有效的${name}。`;
 if(issue.code==='invalid_string')return `${name}格式不正確。`;
 return `${name}：${issue.message}`;
}
const amount=z.number().finite().min(0).max(1e12);
const time=z.string().refine(s=>{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))return false;const d=new Date(s+'Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,16)===s;},'請填寫完整且有效的日期與時間');
export const tradeSchema=z.object({
 id:z.string().uuid(),market:z.enum(['futures','crypto','us-stocks','tw-stocks','cn-stocks','hk-stocks']),symbol:z.string().trim().min(1).max(30),side:z.enum(['long','short']),
 account:z.string().trim().min(1).max(80),currency:z.enum(['USD','USDT','TWD','CNY','HKD']),entryTime:time,exitTime:time,
 entry:amount,exit:amount,quantity:amount,multiplier:amount,
 commission:z.number().finite().min(-1e12).max(1e12).nullable().optional(),transactionTax:z.number().finite().min(-1e12).max(1e12).nullable().optional(),fees:z.number().finite().min(-1e12).max(1e12).nullable().optional(),feeMode:z.enum(['paid','rebate']).optional(),funding:z.number().finite().min(-1e12).max(1e12).nullable().optional(),strategy:z.preprocess(v=>v??'',z.string().trim().max(80)),notes:z.string().max(10000),
 imageId:z.string().uuid().nullable(),netOverride:z.number().finite().min(-1e15).max(1e15).nullable(),
 positionValue:amount.positive().nullable().optional(),leverage:z.number().finite().min(1).max(1000).nullable().optional(),
 marginMode:z.enum(['cross','isolated']).nullable().optional(),profitBasis:z.enum(['net','gross']).optional(),
}).superRefine((t,ctx)=>{if(t.netOverride===null){for(const field of ['entry','exit','quantity',...(t.market==='futures'?['multiplier']:[])] as const){if((t[field as 'entry']??0)<=0)ctx.addIssue({code:z.ZodIssueCode.custom,path:[field],message:'自動計算需要此欄位，或直接填寫帳單盈虧。'});}}}).refine(t=>t.exitTime>=t.entryTime,{message:'出場時間不可早於進場時間',path:['exitTime']})
.refine(t=>t.market!=='futures'||Number.isInteger(t.quantity),{message:'期貨口數必須為整數',path:['quantity']})
.transform(t=>({...t,commission:t.commission==null?null:Math.abs(t.commission),transactionTax:t.transactionTax==null?null:Math.abs(t.transactionTax),feeMode:t.feeMode??'paid',funding:t.funding??null,fees:t.fees==null?null:(t.feeMode==='rebate'?-1:1)*Math.abs(t.fees),...(t.market==='crypto'?{multiplier:1,quantity:t.positionValue!=null&&t.entry>0?t.positionValue/t.entry:t.quantity,transactionTax:null}:t.market!=='futures'?{multiplier:1,positionValue:null,leverage:null,marginMode:null,funding:null}: {transactionTax:null})}));
