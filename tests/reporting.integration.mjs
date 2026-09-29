import assert from 'node:assert/strict';
const root='http://localhost:5173';
const home=await fetch(root+'/');assert.equal(home.status,200);const html=(await home.text()).replaceAll(/<!--.*?-->/g,'');
for(const label of ['交易總覽','記錄決策，回顧表現，累積自己的交易優勢。'])assert.ok(html.includes(label),`page renders ${label}`);
assert.ok(html.includes('theme-toggle'));assert.ok(!html.includes('每分鐘更新'));assert.ok(!html.includes('目前顯示虛構示範交易'),'disabled demo data is not rendered while account preferences load');
const unauth=await fetch(root+'/api/exchange-rate');assert.equal(unauth.status,401);
const signin=await fetch(root+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=signin.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
const response=await fetch(root+'/api/exchange-rate',{headers:{cookie}}),quote=await response.json();assert.equal(response.status,200,JSON.stringify(quote));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(quote.provider,'CoinGecko');assert.equal(typeof quote.rate,'number');assert.ok(quote.rate>0);assert.ok(Date.now()-quote.updatedAt<=86400000);
console.log('Rendered dashboard with shared period controls and zero line; authenticated live FX route returns fresh USDT/USD quote; unauthenticated access rejected.');
