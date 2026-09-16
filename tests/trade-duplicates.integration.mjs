import assert from 'node:assert/strict';
const root='http://localhost:5173';
const sign=await fetch(root+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=sign.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),headers={cookie,origin:root,'Content-Type':'application/json'};
const post=(path,body,h=headers)=>fetch(root+path,{method:'POST',headers:h,body:JSON.stringify(body)});
const ids=[],images=[];
const base={id:crypto.randomUUID(),market:'futures',symbol:'MNQ',side:'long',account:'__overlap_test__',currency:'USD',entryTime:'2026-01-05T10:02',exitTime:'2026-01-05T10:15',entry:Math.floor(Math.random()*100000)+100,exit:200,quantity:3,multiplier:2,fees:1,commission:2,funding:null,strategy:'',notes:'',imageId:null,netOverride:-400,profitBasis:'gross'};ids.push(base.id);
const batch=trades=>post('/api/trades/batch',{trades});
const check=trades=>post('/api/imports/check-trades',{trades});
try{
 let r=await post('/api/imports/check-trades',{trades:[base]},{'Content-Type':'application/json'});assert.equal(r.status,401);
 r=await post('/api/trades',base);assert.equal(r.status,200,await r.clone().text());
 // Different screenshots can contain the same earlier trade plus a genuinely new row.
 const overlap={...base,id:crypto.randomUUID()},fresh={...base,id:crypto.randomUUID(),exitTime:'2026-01-05T10:16'};ids.push(overlap.id,fresh.id);
 r=await check([overlap,fresh]);assert.equal(r.status,200);let matches=(await r.json()).duplicates;assert.equal(matches.length,1);assert.equal(matches[0].tradeId,overlap.id);assert.equal(matches[0].step,0);
 r=await batch([overlap,fresh]);assert.equal(r.status,409);assert.equal((await r.json()).tradeDuplicates.length,1);
 r=await fetch(root+'/api/trades',{headers});assert.ok(!(await r.json()).trades.some(t=>t.id===fresh.id),'blocked batch has no partial writes');
 r=await batch([fresh]);assert.equal(r.status,200,'new row can be saved without duplicate');
 const confirm=(step,fingerprint=matches[0].fingerprint,trade=overlap)=>post('/api/imports/check-trades',{trades:[trade],confirm:{tradeId:trade.id,step,fingerprint}});
 r=await confirm(2);assert.equal(r.status,409,'cannot skip first confirmation');
 r=await confirm(1);assert.equal(r.status,200);assert.equal((await r.json()).duplicate.step,1);
 r=await batch([overlap]);assert.equal(r.status,409,'one confirmation is insufficient');
 r=await confirm(2,'0'.repeat(64));assert.equal(r.status,409,'wrong signature blocked');
 r=await confirm(2);assert.equal(r.status,200);assert.equal((await r.json()).duplicate.step,2);
 r=await batch([overlap]);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).saved,1);
 r=await batch([overlap]);assert.equal(r.status,200);assert.equal((await r.json()).saved,0,'retry cannot create another copy');
 const third={...overlap,id:crypto.randomUUID()};ids.push(third.id);r=await check([third]);let thirdMatch=(await r.json()).duplicates[0];assert.equal(thirdMatch.step,0,'approval cannot transfer to a new candidate');
 r=await post('/api/imports/check-trades',{trades:[third],confirm:{tradeId:third.id,step:1,fingerprint:thirdMatch.fingerprint}});assert.equal(r.status,200);
 // A changed image binding must invalidate an old approval even when business fields still match.
 r=await check([{...third,imageId:crypto.randomUUID()}]);assert.equal((await r.json()).duplicates[0].step,0);
 r=await fetch(root+'/api/exchange-rate',{headers});assert.equal(r.status,200);const first=await r.json();r=await fetch(root+'/api/exchange-rate',{headers});assert.equal(r.status,200);assert.deepEqual(await r.json(),first,'daily quote shared across requests');
 console.log('Passed overlapping old/new rows, red-warning response, no partial writes, separate new-row save, ordered two-step confirmation, tamper/edit/new-ID protection, idempotency and persistent quote cache.');
}finally{for(const id of ids)await fetch(root+'/api/trades/'+id,{method:'DELETE',headers});}
