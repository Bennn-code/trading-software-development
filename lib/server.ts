import { env } from 'cloudflare:workers';
import { currentAccount } from './account-auth';
import { sameOrigin } from './account-validation';
import { readBoundedText, ResponseTooLargeError } from './bounded-response';
export function db(){if(!env.DB)throw new Error('交易資料庫尚未就緒');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('截圖儲存空間尚未就緒');return env.BUCKET;}
export function json(data:unknown,status=200,extraHeaders?:HeadersInit){const headers=new Headers(extraHeaders);headers.set('Cache-Control','no-store');return Response.json(data,{status,headers});}
export async function readJson(request:Request,maxBytes:number){
 const contentType=request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
 if(contentType!=='application/json')throw new ApiError('請提供有效的資料格式。',415);
 try{return JSON.parse(await readBoundedText(request,maxBytes)) as unknown;}
 catch(error){if(error instanceof ResponseTooLargeError)throw new ApiError('請求資料過大。',413);throw new ApiError('請提供有效的資料格式。',400);}
}
export async function identity(request:Request,write=false){
 const user=await currentAccount(request);if(!user)throw new ApiError('請先登入再操作交易紀錄',401);
 if(write&&!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);
 return user.userId;
}
export class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
export function failure(e:unknown){if(e instanceof ApiError)return json({error:e.message},e.status);const requestId=crypto.randomUUID();console.error('Journal storage operation failed',{requestId,errorType:e instanceof Error?e.name:'UnknownError'});return json({error:'暫時無法存取資料，請稍後重試。你的輸入仍保留在畫面上。',requestId},503,{'X-Request-Id':requestId});}
