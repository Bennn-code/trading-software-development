import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=process.env.TEST_ORIGIN||'http://localhost:5173';
let r=await fetch(root+'/');assert.equal(r.status,200);
const ownerId=`duplicate-image-test-${crypto.randomUUID()}`,headers={'oai-authenticated-user-id':ownerId,'oai-authenticated-user-email':'duplicate-image-test@example.test',origin:root,'Content-Type':'application/json'};
// A valid tiny PNG with a unique trailing test marker; the exact same bytes are uploaded twice.
const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64'),Buffer.from(crypto.randomUUID())]);
async function upload(name){const body=new FormData();body.set('file',new File([bytes],name,{type:'image/png'}));const response=await fetch(root+'/api/images',{method:'POST',headers:{'oai-authenticated-user-id':ownerId,'oai-authenticated-user-email':'duplicate-image-test@example.test',origin:root},body});assert.equal(response.status,200,await response.clone().text());return response.json();}
const first=await upload('first.png');assert.equal(first.duplicate.count,0);
const base={market:'crypto',symbol:'PROMUSDT',side:'long',currency:'USDT',account:'__duplicate_test__',entryTime:'2026-08-25T13:47',exitTime:'2026-08-30T09:41',entry:4.349,exit:6.208,quantity:0,multiplier:1,commission:null,fees:null,funding:null,netOverride:63.0751,profitBasis:'gross',strategy:'',notes:'',imageId:first.id};
const t={...base,id:crypto.randomUUID()},ids=[t.id];
const batch=async(trades,authorizedDuplicateTradeIds=[])=>fetch(root+'/api/trades/batch',{method:'POST',headers,body:JSON.stringify({trades,authorizedDuplicateTradeIds})});
try{
 r=await batch([t]);assert.equal(r.status,200,await r.clone().text());
 assert.match(first.id,/^[0-9a-f-]{36}$/);execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',process.env.DUPLICATE_TEST_CONFIG||'dist/server/wrangler.json','--persist-to',process.env.DUPLICATE_TEST_PERSIST_DIR||'.wrangler/state','--command',`UPDATE images SET digest=NULL WHERE id='${first.id}'`],{stdio:'pipe'});
 const second=await upload('renamed-same-content.png');assert.equal(second.duplicate.count,1);assert.equal(second.duplicate.step,0);
 const repeat={...t,id:crypto.randomUUID(),imageId:second.id};ids.push(repeat.id);
 r=await batch([repeat]);assert.equal(r.status,409);assert.equal((await r.json()).duplicate.step,0);
 r=await fetch(root+'/api/trades',{method:'POST',headers,body:JSON.stringify(repeat)});assert.equal(r.status,409,'single manual save cannot bypass duplicate protection');
 r=await fetch(root+'/api/imports/recognize',{method:'POST',headers,body:JSON.stringify({imageId:second.id,account:'test',offset:8})});assert.equal(r.status,409,'reject before spending on AI');
 const ack=async(n)=>fetch(root+'/api/imports/duplicate',{method:'POST',headers,body:JSON.stringify({imageId:second.id,acknowledge:n})});
 r=await ack(2);assert.notEqual(r.status,200,'duplicate screenshot confirmation accepts only one acknowledgment');
 r=await ack(1);assert.equal(r.status,200);assert.equal((await r.json()).step,1);
 r=await ack(1);assert.equal(r.status,200,'retrying the one duplicate screenshot confirmation is idempotent');assert.equal((await r.json()).step,1);
 r=await batch([repeat]);assert.equal(r.status,409,'a repeated trade still needs the final batch confirmation');assert.equal((await r.json()).tradeDuplicates.length,1);
 r=await batch([repeat],[repeat.id]);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).saved,1);
 r=await batch([repeat],[repeat.id]);assert.equal(r.status,200);assert.equal((await r.json()).saved,0,'retry after approval does not save a third copy');
 r=await fetch(root+'/api/trades',{headers});const stored=(await r.json()).trades.filter(x=>ids.includes(x.id));assert.equal(stored.length,2);for(const row of stored){assert.equal(row.fees,null);assert.equal(row.commission,null);assert.equal(row.funding,null);assert.equal(row.quantity,0);assert.equal(row.netOverride,63.0751);}
 console.log('Passed identical-content detection across filenames, one ordered image acknowledgment, duplicate trade warning and one batch-save confirmation, bypass rejection, idempotent retry and persistent unknown fees.');
}finally{for(const id of ids)await fetch(root+'/api/trades/'+id,{method:'DELETE',headers});}
