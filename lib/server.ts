import { env } from 'cloudflare:workers';
import { currentAccount } from './account-auth';
import { sameOrigin } from './account-validation';
export function db(){if(!env.DB)throw new Error('交易資料庫尚未就緒');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('截圖儲存空間尚未就緒');return env.BUCKET;}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function identity(request:Request,write=false){
 const user=await currentAccount(request);if(!user)throw new ApiError('請先登入再操作交易紀錄',401);
 if(write&&!sameOrigin(request))throw new ApiError('不允許跨網站操作',403);
 return user.userId;
}
export class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
export function failure(e:unknown){if(e instanceof ApiError)return json({error:e.message},e.status);console.error('Journal storage operation failed',e);return json({error:'暫時無法存取資料，請稍後重試。你的輸入仍保留在畫面上。'},503);}
