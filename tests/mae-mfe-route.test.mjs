import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);const code=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}})`)(path=>path.startsWith('./')?load(path.slice(2)):require(path),module,module.exports);return module.exports;}
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let outbound=0,rateChecks=0,authorized=true,mode='empty';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');outbound++;const u=new URL(url),start=Number(u.searchParams.get('startTime')??u.searchParams.get('start')),end=Number(u.searchParams.get('endTime')??u.searchParams.get('end')),interval=u.searchParams.get('interval'),step=(interval==='1h'?60:interval==='4h'?240:interval==='1d'?1440:parseInt(interval??'1'))*60000;if(mode==='blocked')return new Response('',{status:429});const candles=mode==='success'?Array.from({length:Math.floor((end-start)/step)+1},(_,i)=>[start+i*step,'100','105','95']):[];return Response.json(u.hostname.includes('binance')?candles:u.hostname.includes('bybit')?{retCode:0,result:{list:candles}}:{code:0,data:candles});};
const mocks={
 '@/lib/server':{ApiError,identity:async(_request,write)=>{assert.equal(write,true);if(!authorized)throw new ApiError('login required',401);return 'fixture-owner';},db:()=>({prepare:sql=>{assert.ok(sql.startsWith('INSERT INTO security_rate_limits'));return{bind:()=>({first:async()=>({hits:1,expires_at:0})})};}}),json:data=>Response.json(data),readJson:req=>req.json(),failure:error=>Response.json({error:error.message},{status:error.status??503})},
 '@/lib/security':{enforceRateLimit:async(_request,options)=>{assert.equal(options.limit,60);assert.equal(options.ipLimit,240);rateChecks++;}},
};
const module={exports:{}};const code=ts.transpileModule(fs.readFileSync('app/api/trade-status/mae-mfe/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInThisContext(`(function(require,module,exports){${code}})`)(path=>mocks[path]??(path.startsWith('@/lib/')?load(path.slice(6)):require(path)),module,module.exports);
const {POST}=module.exports;
const trade=symbol=>({id:crypto.randomUUID(),market:'crypto',currency:'USDT',cryptoProductType:'perpetual',symbol,side:'long',account:'fixture',timezone:'UTC',entryTime:'2026-09-21T10:00',exitTime:'2026-09-21T10:02',entry:100,exit:103,quantity:2,multiplier:1,fees:null,funding:null,strategy:'',notes:'',imageId:null,netOverride:null});
const call=body=>POST(new Request('https://fixture.test/api/trade-status/mae-mfe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
try{
 const trades=['QONEUSDT','QTWOUSDT','QTHREEUSDT'].map(trade);
 const first=await(await call({trades})).json();assert.equal(outbound,32,'server request cap remains bounded');assert.deepEqual(first.completed,[trades[0].id]);assert.equal(first.skipped.length,1);assert.equal(first.deferred.length,2);assert.deepEqual(first.deferred[0].resume,{providerIndex:0,intervalIndex:4});assert.equal(first.stopped,false,'a segment budget is continuation, not an upstream ban');
 mode='success';const resume=Object.fromEntries(first.deferred.filter(item=>item.resume).map(item=>[item.id,item.resume]));const second=await(await call({trades:trades.slice(1),resume})).json();assert.deepEqual(second.completed,trades.slice(1).map(t=>t.id));assert.equal(second.rows.length,2);assert.equal(second.deferred.length,0);assert.equal(outbound,34);
 mode='blocked';const blockedTrades=['QBANNEDUSDT','QNOTSTARTEDUSDT'].map(trade);const blocked=await(await call({trades:blockedTrades})).json();assert.equal(blocked.stopped,true);assert.equal(blocked.skipped[0].retryable,true);assert.equal(blocked.completed.length,0);assert.deepEqual(blocked.deferred.map(t=>t.id),[blockedTrades[1].id]);assert.equal(outbound,35,'provider 429 must stop without another venue or another trade');
 assert.deepEqual(blocked.skipped[0].diagnostic,{provider:'binance',status:429},'the response identifies the actual fixed supplier and HTTP status without URL, key or account data');
 mode='redirect';const original=globalThis.fetch;globalThis.fetch=async(_url,init)=>{assert.equal(init.redirect,'manual');outbound++;return new Response('',{status:307,headers:{location:'https://attacker.invalid/'}});};const redirect=await(await call({trades:[trade('REDIRECTUSDT'),trade('UNSTARTEDUSDT')]})).json();assert.equal(redirect.stopped,true);assert.equal(redirect.completed.length,0);assert.ok(redirect.skipped[0].reason.includes('重新導向'));assert.equal(outbound,36);globalThis.fetch=original;
 const before=outbound;const noSize=await(await call({trades:[{...trade('QNOSIZEUSDT'),quantity:0,netOverride:10,profitBasis:'net'}]})).json();assert.equal(noSize.completed.length,1);assert.equal(outbound,before,'unknown size is rejected before any price query');
 const invalid=await call({trades:[trade('INVALIDUSDT')],resume:{[crypto.randomUUID()]:{providerIndex:4,intervalIndex:0}}});assert.equal(invalid.status,400);assert.equal(outbound,before);
 const oversized=await call({trades:Array.from({length:4},()=>trade('MANYUSDT'))});assert.equal(oversized.status,400);
 authorized=false;assert.equal((await call({trades:[trade('AUTHUSDT')]})).status,401);assert.equal(outbound,before,'unauthorized requests never query prices');assert.ok(rateChecks>0);
 authorized=true;
 const badSource=await call({trades:[trade('UNSAFEUSDT')],cryptoSource:'https://attacker.invalid'});assert.equal(badSource.status,400);assert.equal(outbound,before,'custom quote URLs are rejected');
 const badCursor=await call({trades:[blockedTrades[0]],cryptoSource:'okx',resume:{[blockedTrades[0].id]:{providerIndex:1,intervalIndex:0}}});assert.equal(badCursor.status,400);
 globalThis.fetch=async(url,init)=>{assert.equal(new URL(url).hostname,'openapi.okx.com');assert.equal(init.method,'GET');assert.equal(Object.keys(init.headers).some(key=>key.toLowerCase().includes('authorization')),false);outbound++;const start=Date.parse('2026-09-21T10:00Z');return Response.json({code:'0',data:[[start,100,104,98],[start+60000,102,106,99]]});};
 const direct=await(await call({trades:[trade('DIRECTUSDT')],cryptoSource:'okx'})).json();assert.equal(direct.rows.length,1);assert.equal(direct.rows[0].provider,'okx');assert.equal(direct.rows[0].mae,-4);assert.equal(direct.rows[0].mfe,12);assert.equal(outbound,before+1);
 console.log('Passed actual MAE/MFE route: 32-call cap, crypto continuation, unstarted IDs, provider ban stop, size validation, input bounds and authentication.');
}finally{globalThis.fetch=originalFetch;}
