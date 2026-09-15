import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db,bucket,identity,json,failure,ApiError } from '@/lib/server';
import { extractScreenshot } from '@/lib/vision';
import { normalizeRow,stableImportId } from '@/lib/screenshot-import';
import { duplicateInfo } from '@/lib/image-duplicates';
export async function GET(request:Request){try{await identity(request);return json({available:!!env.OPENAI_API_KEY});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const owner=await identity(request,true);if(!env.OPENAI_API_KEY)throw new ApiError('AI 截圖辨識尚未連線。請先完成辨識服務設定；手動新增仍可使用。',503);
 const raw=await request.text();if(raw.length>12000000)throw new ApiError('截圖細節過大，請裁切後重試。');
 const parsed=z.object({imageId:z.string().uuid(),account:z.string().trim().min(1).max(80),detailImages:z.array(z.string().max(2800000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/)).max(4).optional(),offset:z.union([z.literal(8),z.literal(0),z.literal(-4),z.literal(-5)])}).safeParse(JSON.parse(raw));if(!parsed.success)throw new ApiError('請確認帳戶名稱與截圖時區');
 const {imageId,account,offset}=parsed.data;const duplicate=await duplicateInfo(owner,imageId);if(duplicate.count&&duplicate.step<2)return json({error:'這張截圖已有交易紀錄，需先完成兩次確認。',duplicate,imageId},409);const image=await db().prepare('SELECT object_key,mime FROM images WHERE id = ? AND user_id = ?').bind(imageId,owner).first<{object_key:string;mime:string}>();if(!image)throw new ApiError('找不到這張截圖',404);const obj=await bucket().get(image.object_key);if(!obj)throw new ApiError('找不到這張截圖',404);if(obj.size>5*1024*1024)throw new ApiError('截圖請小於 5 MB');
 const bytes=new Uint8Array(await obj.arrayBuffer());const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 let extraction;try{extraction=await extractScreenshot({key:env.OPENAI_API_KEY,model:env.OPENAI_VISION_MODEL||'gpt-4.1',dataUrl:`data:${image.mime};base64,${btoa(binary)}`,detailImages:parsed.data.detailImages});}catch(e){throw new ApiError(e instanceof Error?e.message:'辨識失敗，請重試',502);}
 const candidates=await Promise.all(extraction.trades.map(async(row,index)=>normalizeRow(row,{id:await stableImportId(owner,duplicate.step===2?digest+':'+imageId:digest,index),imageId,account,offset})));
 return json({candidates,warnings:extraction.warnings});
 }catch(e){return failure(e);}}
