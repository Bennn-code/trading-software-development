import assert from 'node:assert/strict';
const root='http://localhost:5173';
let r=await fetch(root+'/api/account'),data=await r.json();assert.equal(r.status,200);assert.equal(data.account,null);assert.equal(data.emailEnabled,false,'this test expects no live auth provider');assert.equal(r.headers.get('cache-control'),'no-store');
const headers={origin:root,'Content-Type':'application/json'};
r=await fetch(root+'/api/account/auth',{method:'POST',headers,body:JSON.stringify({action:'signup',email:'not-sent@example.test',password:'Long test-only passphrase'})});assert.equal(r.status,503);assert.ok((await r.json()).error.includes('尚未啟用'));
r=await fetch(root+'/api/account/auth',{method:'POST',headers:{...headers,origin:'https://other.test'},body:JSON.stringify({action:'logout'})});assert.equal(r.status,403);
r=await fetch(root+'/api/account/preferences',{method:'PUT',headers,body:JSON.stringify({language:'en'})});assert.equal(r.status,401);
r=await fetch(root+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});const cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert.ok(cookie);
const own={...headers,cookie};const previous=await(await fetch(root+'/api/account',{headers:own})).json();assert.equal(previous.account.provider,'chatgpt');
try{
 for(const language of ['en','zh-Hans','yue-Hant','zh-Hant']){
  r=await fetch(root+'/api/account/preferences',{method:'PUT',headers:own,body:JSON.stringify({language})});assert.equal(r.status,200,await r.clone().text());
  data=await(await fetch(root+'/api/account',{headers:own})).json();assert.equal(data.language,language);
 }
 r=await fetch(root+'/api/account/preferences',{method:'PUT',headers:own,body:JSON.stringify({language:'ja'})});assert.equal(r.status,400);
 r=await fetch(root+'/?view=settings',{headers:own});assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('profile-button'));assert.ok(html.includes('space-link'));
 console.log('Passed live local routes: unconfigured email fails clearly, CSRF/anonymous rejection, existing ChatGPT identity, language persistence and clickable space entry.');
}finally{await fetch(root+'/api/account/preferences',{method:'PUT',headers:own,body:JSON.stringify({language:previous.language??'zh-Hant'})});}
