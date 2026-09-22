import { z } from 'zod';
import { db, identity, json, failure, ApiError } from '@/lib/server';
import { emptyReview, type ReviewRecord } from '@/lib/reviews';
import { validDate } from '@/lib/report-period';

const day=z.string().refine(value=>validDate(value)&&value>='1900-01-01'&&value<='2200-12-31');
async function load(owner:string,date:string){
 const row=await db().prepare("SELECT payload FROM reviews WHERE user_id = ? AND kind = 'day' AND start_date = ?").bind(owner,date).first<{payload:string}>();
 return row?JSON.parse(row.payload) as ReviewRecord:emptyReview();
}
export async function GET(request:Request){try{
 const owner=await identity(request),params=new URL(request.url).searchParams,date=params.get('date')??'',month=params.get('month')??date.slice(0,7);
 if(!day.safeParse(date).success||!day.safeParse(`${month}-01`).success)throw new ApiError('請選擇有效日期。');
 const start=`${month}-01`,cursor=new Date(`${start}T00:00:00Z`);cursor.setUTCMonth(cursor.getUTCMonth()+1);cursor.setUTCDate(0);const end=cursor.toISOString().slice(0,10);
 const result=await db().prepare("SELECT start_date,payload FROM reviews WHERE user_id = ? AND kind = 'day' AND start_date >= ? AND start_date <= ? ORDER BY start_date").bind(owner,start,end).all<{start_date:string;payload:string}>();
 const dates=result.results.filter(row=>{const record=JSON.parse(row.payload) as ReviewRecord;return !!record.strategy.trim()||!!record.reflection.trim();}).map(row=>row.start_date);
 return json({record:await load(owner,date),dates});
 }catch(e){return failure(e);}}

export async function POST(request:Request){try{
 const owner=await identity(request,true),raw=await request.text();if(raw.length>18000)throw new ApiError('心得內容過長。');
 let input;try{input=JSON.parse(raw);}catch{throw new ApiError('心得格式不正確。');}
 const parsed=z.object({date:day,strategy:z.string().max(5000),reflection:z.string().max(10000)}).safeParse(input);if(!parsed.success)throw new ApiError('請確認日期與心得長度。');
 const record={...emptyReview(),strategy:parsed.data.strategy,reflection:parsed.data.reflection};
 await db().prepare("INSERT INTO reviews (user_id,kind,start_date,payload,updated_at) VALUES (?,'day',?,?,?) ON CONFLICT(user_id,kind,start_date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(owner,parsed.data.date,JSON.stringify(record),new Date().toISOString()).run();
 return json({record});
 }catch(e){return failure(e);}}
