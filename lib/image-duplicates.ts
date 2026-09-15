import { db,bucket,ApiError } from './server';
export async function imageDigest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function duplicateInfo(owner:string,imageId:string){
 const database=db();
 const image=await database.prepare('SELECT digest,duplicate_step,object_key FROM images WHERE id=? AND user_id=?').bind(imageId,owner).first<{digest:string|null;duplicate_step:number;object_key:string}>();
 if(!image)throw new ApiError('無法存取交易截圖',403);
 if(!image.digest){const object=await bucket().get(image.object_key);if(!object)throw new ApiError('找不到原始截圖，請重新上傳。',404);image.digest=await imageDigest(new Uint8Array(await object.arrayBuffer()));await database.prepare('UPDATE images SET digest=? WHERE id=? AND user_id=?').bind(image.digest,imageId,owner).run();}
 // Backfill only this owner's previously saved screenshots, so earlier uploads are protected too.
 const old=await database.prepare("SELECT DISTINCT i.id,i.object_key FROM images i JOIN trades t ON json_extract(t.payload,'$.imageId')=i.id AND t.user_id=i.user_id WHERE i.user_id=? AND i.digest IS NULL").bind(owner).all<{id:string;object_key:string}>();
 for(const image of old.results){const obj=await bucket().get(image.object_key);if(obj)await database.prepare('UPDATE images SET digest=? WHERE id=? AND user_id=?').bind(await imageDigest(new Uint8Array(await obj.arrayBuffer())),image.id,owner).run();}
 const match=await database.prepare("SELECT COUNT(*) AS count FROM trades t JOIN images i ON json_extract(t.payload,'$.imageId')=i.id AND t.user_id=i.user_id WHERE i.user_id=? AND i.digest=?").bind(owner,image.digest).first<{count:number}>();
 return {count:match?.count??0,step:image.duplicate_step};
}
