import { stableImportId } from './screenshot-import';
import { localTime, type Trade } from './trades';

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

function base64(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

export async function hmacSha256Hex(secret: string, message: string) {
  return hex(await hmac(secret, message));
}

export async function hmacSha256Base64(secret: string, message: string) {
  return base64(await hmac(secret, message));
}

function number(value: unknown) {
  if (value === null || value === undefined || value === '') return NaN;
  return typeof value === 'number' ? value : Number(String(value));
}

function timestamp(value: unknown) {
  const parsed = number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return NaN;
  // KuCoin UTA position timestamps are nanoseconds; other supported endpoints use milliseconds.
  return parsed > 1e15 ? Math.floor(parsed / 1_000_000) : parsed;
}

type PositionInput = {
  provider: 'bitget' | 'okx' | 'kucoin';
  identity: string;
  symbol: string;
  side: string;
  openTime: unknown;
  closeTime: unknown;
  entry: unknown;
  exit: unknown;
  quantity: unknown;
  net: unknown;
  commission?: unknown;
  fees?: unknown;
  funding?: unknown;
};

async function mapPosition(row: PositionInput, ownerId: string, timezone: string): Promise<Trade | null> {
  const side = row.side.toLowerCase();
  const openTime = timestamp(row.openTime), closeTime = timestamp(row.closeTime);
  const entry = number(row.entry), exit = number(row.exit), quantity = number(row.quantity), net = number(row.net);
  const commission = row.commission == null ? null : number(row.commission);
  const fees = row.fees == null ? null : number(row.fees);
  const funding = row.funding == null ? null : number(row.funding);
  if (!/^[A-Z0-9-]{2,30}$/.test(row.symbol) || !['long', 'short'].includes(side)
    || !Number.isFinite(openTime) || !Number.isFinite(closeTime) || closeTime < openTime
    || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0
    || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(net)
    || (commission !== null && !Number.isFinite(commission)) || (fees !== null && !Number.isFinite(fees))
    || (funding !== null && !Number.isFinite(funding))) return null;

  return {
    id: await stableImportId(ownerId, `${row.provider}:${row.identity}`, 0),
    market: 'crypto', symbol: row.symbol, side: side as Trade['side'], account: `${row.provider === 'kucoin' ? 'KuCoin' : row.provider === 'okx' ? 'OKX' : 'Bitget'} API`, currency: 'USDT',
    entryTime: localTime(new Date(openTime), timezone), exitTime: localTime(new Date(closeTime), timezone), timezone,
    entry, exit, quantity, multiplier: 1, fees, funding, strategy: '', notes: '', imageId: null,
    commission, transactionTax: null, netOverride: net, profitBasis: 'net',
  };
}

export type BitgetHistoryPosition = {
  positionId?: string; symbol: string; marginCoin: string; holdSide: string; openAvgPrice: string; closeAvgPrice: string;
  openTotalPos: string; closeTotalPos: string; netProfit: string; openFee?: string; closeFee?: string; totalFunding?: string;
  ctime: string; utime: string;
};

export function mapBitgetPosition(row: BitgetHistoryPosition, ownerId: string, timezone: string) {
  if (row.marginCoin !== 'USDT' || !row.symbol.endsWith('USDT')) return Promise.resolve(null);
  return mapPosition({
    provider: 'bitget', identity: JSON.stringify([row.positionId, row.ctime, row.utime, row.closeTotalPos, row.netProfit]), symbol: row.symbol, side: row.holdSide,
    openTime: row.ctime, closeTime: row.utime, entry: row.openAvgPrice, exit: row.closeAvgPrice, quantity: row.closeTotalPos, net: row.netProfit,
    commission: Math.abs(number(row.openFee || 0)) + Math.abs(number(row.closeFee || 0)), funding: row.totalFunding ?? 0,
  }, ownerId, timezone);
}

export type OkxHistoryPosition = {
  instId: string; instType: string; ccy: string; direction: string; type: string; posId: string; cTime: string; uTime: string;
  openAvgPx: string; closeAvgPx: string; closeTotalPos: string; realizedPnl: string; fee?: string; fundingFee?: string; liqPenalty?: string;
};

export function mapOkxPosition(row: OkxHistoryPosition, ownerId: string, timezone: string) {
  if (row.instType !== 'SWAP' || !row.instId.endsWith('-USDT-SWAP') || row.ccy !== 'USDT' || !['2', '3', '6'].includes(row.type)) return Promise.resolve(null);
  return mapPosition({
    provider: 'okx', identity: JSON.stringify([row.posId, row.cTime, row.uTime, row.type]), symbol: row.instId, side: row.direction,
    openTime: row.cTime, closeTime: row.uTime, entry: row.openAvgPx, exit: row.closeAvgPx, quantity: row.closeTotalPos, net: row.realizedPnl,
    commission: Math.abs(number(row.fee || 0)), fees: Math.abs(number(row.liqPenalty || 0)), funding: row.fundingFee ?? 0,
  }, ownerId, timezone);
}

export type KucoinUtaHistoryPosition = {
  symbol: string; closeId: string; side: string; entryPrice: string; avgClosePrice?: string; closePrice: string; maxSize: string;
  realizedPnL: string; fee?: string; tax?: string; fundingFee?: string; creationTime: number | string; closingTime: number | string;
};

export function mapKucoinUtaPosition(row: KucoinUtaHistoryPosition, ownerId: string, timezone: string) {
  if (!row.symbol.endsWith('USDTM')) return Promise.resolve(null);
  return mapPosition({
    provider: 'kucoin', identity: JSON.stringify([row.closeId, row.creationTime, row.closingTime]), symbol: row.symbol, side: row.side,
    openTime: row.creationTime, closeTime: row.closingTime, entry: row.entryPrice, exit: row.avgClosePrice || row.closePrice, quantity: row.maxSize, net: row.realizedPnL,
    commission: Math.abs(number(row.fee || 0)), fees: Math.abs(number(row.tax || 0)), funding: row.fundingFee ?? 0,
  }, ownerId, timezone);
}
