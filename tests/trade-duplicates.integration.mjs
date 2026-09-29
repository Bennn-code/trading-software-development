import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,unlinkSync,writeFileSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=process.env.TRADE_DUPLICATE_TEST_URL??'http://localhost:5173';
const ownerId=`duplicate-race-test-${crypto.randomUUID()}`,headers={'oai-authenticated-user-id':ownerId,'oai-authenticated-user-email':'duplicate-race-test@example.test',origin:root,'Content-Type':'application/json'};
const post=(path,body,h=headers)=>fetch(root+path,{method:'POST',headers:h,body:JSON.stringify(body)});
const ids=[];
const base={id:crypto.randomUUID(),market:'futures',symbol:'MNQ',side:'long',account:'__overlap_test__',currency:'USD',entryTime:'2026-01-05T10:02',exitTime:'2026-01-05T10:15',entry:Math.floor(Math.random()*100000)+100,exit:200,quantity:3,multiplier:2,fees:1,commission:2,funding:null,strategy:'',notes:'',imageId:null,netOverride:-400,profitBasis:'gross'};ids.push(base.id);
const batch=trades=>post('/api/trades/batch',{trades});
const check=trades=>post('/api/imports/check-trades',{trades});
try{
 let r=await post('/api/imports/check-trades',{trades:[base]},{'Content-Type':'application/json'});assert.equal(r.status,401);
 r=await post('/api/trades',base);assert.equal(r.status,200,await r.clone().text());
 // A duplicate preview only authorizes the rows the user actually confirmed.
 const raceOverlap={...base,id:crypto.randomUUID()},raceFresh={...base,id:crypto.randomUUID(),exitTime:'2026-01-05T10:25'},lateArrival={...raceFresh,id:crypto.randomUUID()};ids.push(raceOverlap.id,raceFresh.id,lateArrival.id);
 r=await check([raceOverlap,raceFresh]);assert.equal(r.status,200);const previewMatches=(await r.json()).duplicates;assert.deepEqual(previewMatches.map(item=>item.tradeId),[raceOverlap.id]);
 r=await post('/api/trades',lateArrival);assert.equal(r.status,200,'a concurrent writer creates a duplicate after the preview');
 r=await post('/api/trades/batch',{trades:[raceOverlap,raceFresh],authorizedDuplicateTradeIds:[raceOverlap.id]});assert.equal(r.status,409,'a late duplicate outside the confirmed ID list blocks the whole batch');const raced=(await r.json()).tradeDuplicates;assert.deepEqual(raced.map(item=>item.tradeId),[raceFresh.id]);
 r=await fetch(root+'/api/trades',{headers});assert.ok(!(await r.json()).trades.some(trade=>[raceOverlap.id,raceFresh.id].includes(trade.id)),'race rejection is all-or-none');
 r=await post('/api/trades/batch',{trades:[raceOverlap,raceFresh],authorizedDuplicateTradeIds:[raceOverlap.id,raceFresh.id]});assert.equal(r.status,200,'only after the newly red-marked row is explicitly confirmed can it be saved');assert.equal((await r.json()).saved,2);
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
 console.log('Passed overlapping old/new rows, per-trade duplicate authorization under a late-write race, no partial writes, ordered API confirmations, tamper/edit/new-ID protection and idempotency.');
}finally{
 for(const id of ids)await fetch(root+'/api/trades/'+id,{method:'DELETE',headers});
 const wrangler=[process.execPath,'--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',process.env.TRADE_DUPLICATE_TEST_CONFIG??'dist/server/wrangler.json','--persist-to',process.env.TRADE_DUPLICATE_TEST_PERSIST_DIR??'.wrangler/state'];
 const schemaOutput=execFileSync(wrangler[0], [...wrangler.slice(1),'--command',"SELECT name FROM sqlite_master WHERE type='table'"],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const jsonStart=schemaOutput.indexOf('[\n'),jsonEnd=schemaOutput.lastIndexOf(']');
 const tables=jsonStart>=0&&jsonEnd>jsonStart?JSON.parse(schemaOutput.slice(jsonStart,jsonEnd+1))[0]?.results?.map(row=>row.name)??[]:[];
 const statements=[];
 if(tables.includes('trades'))statements.push(`DELETE FROM trades WHERE user_id='${ownerId}'`);
 if(tables.includes('import_duplicate_approvals'))statements.push(`DELETE FROM import_duplicate_approvals WHERE user_id='${ownerId}'`);
 if(tables.includes('account_preferences'))statements.push(`DELETE FROM account_preferences WHERE user_id='${ownerId}'`);
 if(tables.includes('trading_profiles'))statements.push(`DELETE FROM trading_profiles WHERE user_id='${ownerId}'`);
 if(statements.length){
  const directory=mkdtempSync(join(tmpdir(),'trade-duplicate-cleanup-')),file=join(directory,'cleanup.sql');
  try{writeFileSync(file,statements.join(';\n')+';\n',{encoding:'utf8'});execFileSync(wrangler[0],[...wrangler.slice(1),'--file',file],{stdio:'pipe'});}
  finally{try{unlinkSync(file);}catch{}try{rmdirSync(directory);}catch{}}
 }
}
