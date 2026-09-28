import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;

function loadTypeScript(path, mockRequire = () => { throw new Error('Unexpected import in standalone module'); }) {
  const source = fs.readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  new Function('require', 'exports', 'module', compiled)(mockRequire, commonJsModule.exports, commonJsModule);
  return commonJsModule.exports;
}

const counters = new Map();
const eventWrites = [];
const db = () => ({
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async first() {
            if (!sql.includes('RETURNING hits')) return null;
            const hits = (counters.get(values[0]) ?? 0) + 1;
            counters.set(values[0], hits);
            return { hits };
          },
          async run() { if (sql.includes('INSERT INTO security_events')) eventWrites.push(sql); return { meta: { changes: 1 } }; },
        };
      },
    };
  },
});
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const env = {};
const security = loadTypeScript('lib/security.ts', name => {
  if (name === 'cloudflare:workers') return { env };
  if (name === './server') return { ApiError, db };
  throw new Error(`Unexpected import in security test: ${name}`);
});

const request = (ip, userAgent = 'test-browser') => new Request('https://tradersregion.com/api/test', {
  headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), 'user-agent': userAgent },
});

assert.equal(await security.actorHash(request('203.0.113.4', 'browser-a')), await security.actorHash(request('203.0.113.4', 'browser-b')), 'User-Agent changes must not reset an IP identity bucket');
assert.equal(await security.actorHash(new Request('https://tradersregion.com', { headers: { 'x-forwarded-for': '192.0.2.8' } })), await security.actorHash(new Request('https://tradersregion.com', { headers: { 'x-forwarded-for': '198.51.100.9' } })), 'untrusted X-Forwarded-For must not select the client IP');

await security.enforceRateLimit(request('203.0.113.1'), { scope: 'test-account', limit: 1, ipLimit: 10, windowSeconds: 60, subject: 'owner-a' });
await assert.rejects(() => security.enforceRateLimit(request('203.0.113.2', 'rotated-agent'), { scope: 'test-account', limit: 1, ipLimit: 10, windowSeconds: 60, subject: 'owner-a' }), error => error instanceof ApiError && error.status === 429, 'changing IP and User-Agent must not bypass the account bucket');
await assert.rejects(() => security.enforceRateLimit(request('203.0.113.3'), { scope: 'test-account', limit: 1, ipLimit: 10, windowSeconds: 60, subject: 'owner-a' }), error => error instanceof ApiError && error.status === 429);
assert.equal(eventWrites.length, 1, 'subsequent blocked traffic must not create one event write per request');
await security.enforceRateLimit(request('203.0.113.3'), { scope: 'test-ip', limit: 10, ipLimit: 1, windowSeconds: 60, subject: 'owner-a' });
await assert.rejects(() => security.enforceRateLimit(request('203.0.113.3'), { scope: 'test-ip', limit: 10, ipLimit: 1, windowSeconds: 60, subject: 'owner-b' }), error => error instanceof ApiError && error.status === 429, 'the IP bucket must be independent of account buckets');
await security.enforceRateLimit(request(null), { scope: 'missing-ip', limit: 10, ipLimit: 1, windowSeconds: 60, subject: 'owner-a' });
await assert.rejects(() => security.enforceRateLimit(request(null), { scope: 'missing-ip', limit: 10, ipLimit: 1, windowSeconds: 60, subject: 'owner-b' }), error => error instanceof ApiError && error.status === 429, 'requests without a trusted Cloudflare IP must not bypass IP limits');

await assert.rejects(() => security.verifyTurnstile(request('203.0.113.1'), 'token'), error => error instanceof ApiError && error.status === 503, 'missing Turnstile secret must fail closed');
env.TURNSTILE_SECRET_KEY = 'test-secret';
env.TURNSTILE_SITE_KEY = 'test-site-key';
await assert.rejects(() => security.verifyTurnstile(request('203.0.113.1')), error => error instanceof ApiError && error.status === 403);
let sentBody;
const oldFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => { sentBody = init.body; return Response.json({ success: true }); };
await security.verifyTurnstile(request('203.0.113.1'), 'verified-token');
assert.equal(sentBody.get('secret'), 'test-secret');
assert.equal(sentBody.get('response'), 'verified-token');
assert.equal(sentBody.get('remoteip'), '203.0.113.1');
globalThis.fetch = async () => Response.json({ success: false });
await assert.rejects(() => security.verifyTurnstile(request('203.0.113.1'), 'invalid-token'), error => error instanceof ApiError && error.status === 403);
globalThis.fetch = oldFetch;

const bounded = loadTypeScript('lib/bounded-response.ts');
assert.equal(await bounded.readBoundedText(new Response('safe'), 4), 'safe');
assert.equal((await bounded.readBoundedBytes(new Response(null), 4)).byteLength, 0, 'empty bodies must return an empty byte array');
await assert.rejects(() => bounded.readBoundedText(new Response('oversized'), 4), error => error instanceof bounded.ResponseTooLargeError);
const streamed = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('123')); controller.enqueue(new TextEncoder().encode('456')); controller.close(); } }));
await assert.rejects(() => bounded.readBoundedText(streamed, 5), error => error instanceof bounded.ResponseTooLargeError, 'streamed bodies must be capped even without Content-Length');

const dimensions = loadTypeScript('lib/image-dimensions.ts');
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
new DataView(png.buffer).setUint32(16, 4000);
new DataView(png.buffer).setUint32(20, 3000);
assert.deepEqual(dimensions.imageDimensions(png, 'image/png'), { width: 4000, height: 3000 });
assert.equal(dimensions.imageDimensionsWithinLimit({ width: 4000, height: 3000 }), true);
assert.equal(dimensions.imageDimensionsWithinLimit({ width: 5000, height: 5000 }), false, 'decompression-bomb dimensions must be rejected');
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 2, 0, 3, 1]);
assert.deepEqual(dimensions.imageDimensions(jpeg, 'image/jpeg'), { width: 3, height: 2 });
const webp = new Uint8Array(30);
webp.set(new TextEncoder().encode('RIFF'), 0); webp.set(new TextEncoder().encode('WEBP'), 8); webp.set(new TextEncoder().encode('VP8X'), 12);
webp[24] = 99; webp[27] = 49;
assert.deepEqual(dimensions.imageDimensions(webp, 'image/webp'), { width: 100, height: 50 });

console.log('Passed rate-limit identity, fail-closed Turnstile, bounded upstream bodies, and image dimension checks.');
