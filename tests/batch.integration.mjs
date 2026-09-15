import assert from 'node:assert/strict';
const root='http://localhost:5173';
let r=await fetch(root+'/');assert.equal(r.status,200);
const html=await r.text();assert.ok(html.includes('截圖匯入'));assert.ok(html.includes('V1.1'));
r=await fetch(root+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookies=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookies);
const headers={cookie:cookies,origin:root,'Content-Type':'application/json'};
const ids=[];let imageId;
async function batch(trades,customHeaders=headers){return fetch(root+'/api/trades/batch',{method:'POST',headers:customHeaders,body:JSON.stringify({trades})});}
const fd=new FormData();fd.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],'batch-test.png',{type:'image/png'}));
r=await fetch(root+'/api/images',{method:'POST',headers:{cookie:cookies,origin:root},body:fd});assert.equal(r.status,200,await r.clone().text());imageId=(await r.json()).id;
const base={id:crypto.randomUUID(),market:'crypto',symbol:'BTCUSDT',side:'long',account:'__batch_test__',currency:'USDT',entryTime:'2026-09-01T20:00',exitTime:'2026-09-01T21:00',entry:100,exit:110,quantity:99,multiplier:20,fees:2,funding:-3,notes:'',imageId,netOverride:null,positionValue:1000,leverage:10,marginMode:'cross'};
const second={...base,id:crypto.randomUUID(),symbol:'ETHUSDT',strategy:null,netOverride:-1000,profitBasis:'net'};ids.push(base.id,second.id);
try{
 r=await batch([base],{origin:root,'Content-Type':'application/json'});assert.equal(r.status,401);
 r=await batch([base],{...headers,origin:'https://other.example'});assert.equal(r.status,403);
 r=await batch([base,{...second,entry:0}]);assert.equal(r.status,400,'invalid row rejects entire batch');
 r=await fetch(root+'/api/trades',{headers});let all=(await r.json()).trades;assert.ok(!all.some(t=>ids.includes(t.id)));
 r=await batch([base,second]);assert.equal(r.status,200,await r.clone().text());assert.deepEqual(await r.json(),{saved:2,skipped:0,ids});
 r=await fetch(root+'/api/trades',{headers});all=(await r.json()).trades;let stored=all.find(t=>t.id===base.id);assert.equal(stored.strategy,'');assert.equal(stored.quantity,10);assert.equal(stored.multiplier,1);assert.equal(stored.leverage,10);assert.equal(stored.marginMode,'cross');assert.equal(stored.positionValue,1000);assert.equal(all.find(t=>t.id===second.id).netOverride,-1000);
 r=await batch([{...base,notes:'must not overwrite'},second]);assert.equal(r.status,200);assert.equal((await r.json()).saved,0);
 r=await fetch(root+'/api/trades',{headers});all=(await r.json()).trades;assert.equal(all.find(t=>t.id===base.id).notes,'');
 r=await fetch(root+'/api/imports/recognize',{headers});assert.equal(r.status,200);assert.equal((await r.json()).available,false,'AI accurately reports inactive');
 r=await fetch(root+'/api/imports/recognize',{method:'POST',headers,body:JSON.stringify({imageId,account:'test',offset:8})});assert.equal(r.status,503,'no live recognition without configured key');
 r=await fetch(root+'/api/trades/'+base.id,{method:'DELETE',headers});assert.equal(r.status,200);
 r=await fetch(root+'/api/images/'+imageId,{headers});assert.equal(r.status,200,'shared image retained after first deletion');
 r=await fetch(root+'/api/trades/'+second.id,{method:'DELETE',headers});assert.equal(r.status,200);
 r=await fetch(root+'/api/images/'+imageId,{headers});assert.equal(r.status,404,'last reference deletes attachment');
 console.log('Passed HTTP checks: updated page, batch authorization/CSRF, all-or-none validation, separate records, optional strategies, canonical crypto values, safe retries, disabled AI, shared image lifecycle.');
}finally{for(const id of ids)await fetch(root+'/api/trades/'+id,{method:'DELETE',headers});}
