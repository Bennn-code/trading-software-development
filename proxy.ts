import { NextResponse, type NextRequest } from 'next/server';

const csp=[
 "default-src 'self'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'","object-src 'none'",
 "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:",
 "font-src 'self' data:","connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com","frame-src https://challenges.cloudflare.com",
 "worker-src 'self' blob:","upgrade-insecure-requests",
].join('; ');

export function proxy(_request:NextRequest){
 const response=NextResponse.next();
 response.headers.set('Content-Security-Policy',csp);
 response.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains; preload');
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('X-Frame-Options','DENY');
 response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
 response.headers.set('Cross-Origin-Opener-Policy','same-origin');
 response.headers.set('Cross-Origin-Resource-Policy','same-origin');
 return response;
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.svg).*)']};
