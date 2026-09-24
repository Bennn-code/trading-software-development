import { stableImportId } from './screenshot-import';
import { localTime, type Trade } from './trades';

export type BybitClosedOption = {
  symbol: string;
  side: 'Buy' | 'Sell';
  totalOpenFee: string;
  deliveryFee: string;
  totalCloseFee: string;
  qty: string;
  closeTime: number;
  avgExitPrice: string;
  openTime: number;
  avgEntryPrice: string;
  totalPnl: string;
};

export type BybitClosedPnl = {
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: string;
  closedSize: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  closedPnl: string;
  openFee?: string;
  closeFee?: string;
  createdTime: string;
  updatedTime: string;
  orderId: string;
  execType?: string;
};

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

export async function bybitHmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

export async function mapBybitClosedOption(row: BybitClosedOption, ownerId: string, timezone: string): Promise<Trade | null> {
  if (!row.symbol.endsWith('-USDT') || !['Buy', 'Sell'].includes(row.side) || !Number.isFinite(row.openTime) || !Number.isFinite(row.closeTime) || row.closeTime < row.openTime) return null;
  const entry = Number(row.avgEntryPrice), exit = Number(row.avgExitPrice), quantity = Number(row.qty), net = Number(row.totalPnl);
  const commission = Number(row.totalOpenFee || 0) + Number(row.totalCloseFee || 0), fees = Number(row.deliveryFee || 0);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(net) || !Number.isFinite(commission) || !Number.isFinite(fees)) return null;
  const identity = JSON.stringify([row.symbol, row.side, row.openTime, row.closeTime, row.qty, row.avgEntryPrice, row.avgExitPrice, row.totalPnl]);
  return {
    id: await stableImportId(ownerId, `bybit-option:${identity}`, 0), market: 'crypto', symbol: row.symbol, side: row.side === 'Buy' ? 'long' : 'short',
    account: 'Bybit API', currency: 'USDT', entryTime: localTime(new Date(row.openTime), timezone), exitTime: localTime(new Date(row.closeTime), timezone), timezone,
    entry, exit, quantity, multiplier: 1, fees, funding: null, strategy: '', notes: '', imageId: null,
    commission, transactionTax: null, netOverride: net, profitBasis: 'net',
  };
}

export async function mapBybitClosedPnl(row: BybitClosedPnl, ownerId: string, timezone: string): Promise<Trade | null> {
  if (typeof row?.symbol !== 'string' || typeof row.orderId !== 'string' || !row.orderId) return null;
  const currency = row.symbol.endsWith('USDT') ? 'USDT' : null;
  const entry = Number(row.avgEntryPrice), exit = Number(row.avgExitPrice), quantity = Number(row.closedSize || row.qty), net = Number(row.closedPnl);
  const closeTime = Number(row.updatedTime || row.createdTime);
  const commission = Math.abs(Number(row.openFee || 0)) + Math.abs(Number(row.closeFee || 0));
  if (!currency || !/^[A-Z0-9]{2,24}USDT$/.test(row.symbol) || !['Buy', 'Sell'].includes(row.side) || (row.execType && row.execType !== 'Trade') || !Number.isFinite(closeTime) || closeTime <= 0 || !Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(net) || !Number.isFinite(commission)) return null;
  const identity = JSON.stringify([row.symbol, row.orderId, row.createdTime, row.updatedTime, row.closedPnl, row.closedSize || row.qty]);
  const timestamp = localTime(new Date(closeTime), timezone);
  return {
    id: await stableImportId(ownerId, `bybit-linear:${identity}`, 0), market: 'crypto', symbol: row.symbol, side: row.side === 'Sell' ? 'long' : 'short',
    account: 'Bybit API', currency, entryTime: timestamp, exitTime: timestamp, timezone,
    entry, exit, quantity, multiplier: 1, fees: null, funding: null, strategy: '', notes: '', imageId: null,
    commission, transactionTax: null, netOverride: net, profitBasis: 'net',
  };
}
