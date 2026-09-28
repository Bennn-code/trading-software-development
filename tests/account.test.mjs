// Real Supabase SSR client + in-memory D1 + a loopback auth provider.
// No real email, credentials or production data are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const require = createRequire(import.meta.url), context = new AsyncLocalStorage();
const sqlite = new DatabaseSync(':memory:');
for (const name of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(`drizzle/${name}`, 'utf8'));
const DB = { prepare(sql) { let params=[]; return { bind(...values) { params=values; return this; }, async first() { return sqlite.prepare(sql).get(...params) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...params) }; }, async run() { return { meta: sqlite.prepare(sql).run(...params) }; } }; } };
const users=new Map(), sessions=new Map(); let autoConfirm=false, providerUserReads=0, serial=0;
const stamp=()=>new Date().toISOString();
function session(user) { const claims={sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),nonce:serial++}; const access_token=[{alg:'HS256',typ:'JWT'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.test-signature'; const s={access_token,token_type:'bearer',expires_in:3600,expires_at:claims.exp,refresh_token:crypto.randomUUID(),user};sessions.set(access_token,s);return s; }
const provider=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk; const body=raw?JSON.parse(raw):{},route=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');
 const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 const fail=(code='invalid_credentials')=>send({code,msg:code},400);
 if(route.pathname==='/auth/v1/signup') { let u=users.get(body.email);if(!u){u={id:crypto.randomUUID(),email:body.email,aud:'authenticated',role:'authenticated',created_at:stamp(),app_metadata:{provider:'email'},user_metadata:{},password:body.password,otp:'123456'};users.set(u.email,u);} if(autoConfirm){u.email_confirmed_at=stamp();return send(session(u));}return send(u); }
 if(route.pathname==='/auth/v1/resend'){const u=users.get(body.email);if(u)u.otp='654321';return send({});}
 if(route.pathname==='/auth/v1/verify'){const u=users.get(body.email);if(!u||!u.otp||body.token!==u.otp)return fail('otp_expired');u.otp=null;u.email_confirmed_at=stamp();return send(session(u));}
 if(route.pathname==='/auth/v1/token'){const u=users.get(body.email);if(!u||u.password!==body.password)return fail();if(!u.email_confirmed_at)return fail('email_not_confirmed');return send(session(u));}
 const token=(req.headers.authorization??'').replace(/^Bearer /,'');
 if(route.pathname==='/auth/v1/user'){providerUserReads++;const s=sessions.get(token);if(!s)return send({code:'bad_jwt',msg:'bad token'},401);return send(s.user);}
 if(route.pathname==='/auth/v1/logout'){sessions.delete(token);res.statusCode=204;return res.end();}
 send({error:'unexpected endpoint'},404);
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const env={DB,SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,SUPABASE_PUBLISHABLE_KEY:'local-test-publishable-key'};
const cache=new Map();
function load(file) {file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const commonJsModule={exports:{}};cache.set(file,commonJsModule);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 function localRequire(name){if(name==='cloudflare:workers')return{env};if(name==='next/headers')return{cookies:async()=>({getAll:()=>[...context.getStore().jar].map(([name,v])=>({name,value:v.value})),set:(name,value,options)=>{if(value)context.getStore().jar.set(name,{value,options});else context.getStore().jar.delete(name);}}),headers:async()=>context.getStore().request.headers};if(name==='next/navigation')return{redirect:()=>{throw Error('unexpected redirect');}};if(name==='@/lib/security'){const security=load('lib/security.ts');return{...security,verifyTurnstile:async()=>{}};}if(name.startsWith('@/')||name.startsWith('.')){let next=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(next))next+='.ts';return load(next);}return require(name);}
 const run=vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file});run(localRequire,commonJsModule,commonJsModule.exports);return commonJsModule.exports;
}
const auth=load('app/api/account/auth/route.ts'),account=load('app/api/account/route.ts'),preferences=load('app/api/account/preferences/route.ts'),link=load('app/api/account/link/route.ts'),trades=load('app/api/trades/route.ts');
const root='https://journal.test',a=new Map(),b=new Map();
async function call(handler,jar,body,extra={}) {const request=new Request(root+'/api/test',{method:body?'POST':'GET',headers:{origin:root,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});return context.run({jar,request},()=>handler(request));}
async function json(handler,jar,body,extra){const r=await call(handler,jar,body,extra);return{status:r.status,data:await r.json()};}
const pass='A long test-only passphrase',email='one@example.test';
try{
 assert.equal((await call(auth.POST,a,{action:'signup',email,password:pass},{origin:'https://evil.test'})).status,403);
 for(const weak of ['Short1','lowercase1','UPPERCASE1']) assert.equal((await call(auth.POST,a,{action:'signup',email,password:weak})).status,400);
 const missing=env.SUPABASE_URL;env.SUPABASE_URL='';assert.equal((await call(auth.POST,a,{action:'signup',email,password:pass})).status,503);env.SUPABASE_URL=missing;
 assert.equal((await call(auth.POST,a,{action:'signup',email,password:pass})).status,200);assert.equal([...a.keys()].filter(k=>/^journal-auth(\.\d+)?$/.test(k)).length,0,'signup cannot establish an unverified session');
 assert.equal((await call(auth.POST,a,{action:'login',email,password:pass})).status,400);
 assert.equal((await call(auth.POST,a,{action:'verify',email,code:'000000'})).status,400);
 assert.equal((await call(auth.POST,a,{action:'verify',email,code:'00000000'})).status,400);
 assert.equal((await call(auth.POST,a,{action:'resend',email})).status,200);
 assert.equal((await call(auth.POST,a,{action:'verify',email,code:'123456'})).status,400,'old code cannot be reused');
 assert.equal((await call(auth.POST,a,{action:'verify',email,code:'654321'})).status,200);
 assert.ok(a.size>0);for(const c of a.values()){assert.equal(c.options.httpOnly,true);assert.equal(c.options.secure,true);assert.equal(c.options.sameSite,'lax');}
 assert.equal((await call(auth.POST,b,{action:'verify',email,code:'654321'})).status,400,'code is single use');
 assert.equal((await json(account.GET,a)).data.account.email,email);assert.ok(providerUserReads>0);
 assert.equal((await call(preferences.PUT,a,{language:'en'})).status,200);assert.equal((await json(account.GET,a)).data.language,'en');
 assert.equal((await call(preferences.PUT,a,{language:'en'},{origin:''})).status,403,'authenticated writes require an exact same-origin header');
 assert.equal((await call(preferences.PUT,a,{language:'yue-Hant'})).status,200);assert.equal((await json(account.GET,a)).data.language,'yue-Hant');
 assert.equal((await call(preferences.PUT,a,{language:'ja'})).status,400);assert.equal((await call(preferences.PUT,b,{language:'en'})).status,401);
 const t={id:crypto.randomUUID(),market:'futures',symbol:'MNQ',side:'long',account:'test',currency:'USD',entryTime:'2026-09-01T10:00',exitTime:'2026-09-01T10:05',entry:100,exit:110,quantity:1,multiplier:2,fees:null,commission:null,funding:null,strategy:'',notes:'私人心得',imageId:null,netOverride:null};
 assert.equal((await call(trades.POST,a,t)).status,200);
 await call(auth.POST,b,{action:'signup',email:'two@example.test',password:pass});await call(auth.POST,b,{action:'verify',email:'two@example.test',code:'123456'});
 assert.deepEqual((await json(trades.GET,b)).data.trades,[],'other accounts cannot read trades');
 assert.equal((await call(trades.POST,b,{...t,notes:'overwrite'})).status,403,'other accounts cannot overwrite trades');
 const legacy={'oai-authenticated-user-id':'legacy-owner','oai-authenticated-user-email':'legacy@example.test'};
 assert.equal((await call(link.POST,b,{},{})).status,401,'link requires both authenticated accounts');
 assert.equal((await call(link.POST,a,{},legacy)).status,409,'nonempty email space cannot be silently merged');
 assert.equal((await call(link.POST,b,{},legacy)).status,200);
 assert.equal((await json(account.GET,b)).data.account.userId,'legacy-owner');
 assert.equal((await call(link.POST,b,{},legacy)).status,409,'links are unique and cannot be reassigned');
 assert.equal((await call(auth.POST,a,{action:'logout'})).status,200);assert.equal(a.size,0);assert.equal((await call(trades.GET,a)).status,401);
 assert.equal((await call(auth.POST,a,{action:'login',email,password:'wrong password'})).status,400);
 assert.equal((await call(auth.POST,a,{action:'login',email,password:pass})).status,200);
 sessions.clear();assert.equal((await call(trades.GET,a,undefined,legacy)).status,401,'invalid email session must not fall back to another identity in the same request');
 assert.equal((await call(auth.POST,new Map(),{action:'forgot',email:'unknown@example.test'})).status,200,'password reset does not reveal whether an account exists');
 const limiter=new Map();for(let i=0;i<10;i++)assert.notEqual((await call(auth.POST,limiter,{action:'login',email:'rate-limit@example.test',password:'wrong'})).status,429);assert.equal((await call(auth.POST,limiter,{action:'login',email:'rate-limit@example.test',password:'wrong'})).status,429,'repeated login attempts are rate limited');
 autoConfirm=true;const c=new Map();assert.equal((await call(auth.POST,c,{action:'signup',email:'three@example.test',password:pass})).status,503);assert.equal(c.size,0,'misconfigured auto-confirm must fail closed');
 console.log('Passed auth validation, signup/OTP/resend/replay, password reset privacy, login throttling, strict same-origin writes, secure cookies, verified identity, password login, logout, language persistence, account isolation, and explicit safe linking. Mock provider only; real email delivery still requires setup.');
}finally{await new Promise(resolve=>provider.close(resolve));sqlite.close();}
