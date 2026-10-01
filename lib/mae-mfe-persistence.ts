import { ApiError, db } from './server';
import { writableProfile } from './profiles';
import { tradeSchema } from './validation';
import { cryptoProductForTrade, type Trade } from './trades';
import { editExcursions } from './trade-excursions';

export type StoredExcursionTrade = { trade: Trade; payload: string; original: Record<string, unknown> };

/** Only the current owner's selected profile is visible; client trade values are never trusted. */
export async function storedExcursionTrades(owner: string, ids: string[], requestedProfile?: string) {
  if (new Set(ids).size !== ids.length) throw new ApiError('請勿重複提交同一筆交易。');
  const profile = await writableProfile(owner, requestedProfile);
  const rows: { id: string; payload: string }[] = [];
  // Keep all queries below D1's bounded-parameter limits even for bulk confirmation.
  for (let start = 0; start < ids.length; start += 80) {
    const part = ids.slice(start, start + 80);
    const result = await db().prepare(`SELECT id,payload FROM trades WHERE user_id=? AND profile_id=? AND id IN (${part.map(() => '?').join(',')})`).bind(owner, profile, ...part).all<{ id: string; payload: string }>();
    rows.push(...result.results);
  }
  const found = new Map(rows.map(row => [row.id, row]));
  const records = ids.map(id => {
    const record = found.get(id);
    if (!record) throw new ApiError('找不到所選交易或無法存取這個交易帳號。', 404);
    let original: Record<string, unknown>;
    try { original = JSON.parse(record.payload); } catch { throw new ApiError('已儲存交易資料不完整，請先檢查交易欄位。', 409); }
    const parsed = tradeSchema.safeParse(original);
    if (!parsed.success || parsed.data.id !== id) throw new ApiError('已儲存交易資料不完整，請先檢查交易欄位。', 409);
    return { trade: parsed.data, original, payload: record.payload } satisfies StoredExcursionTrade;
  });
  return { profile, records };
}

export function confirmStoredProduct(trade: Trade, product?: 'spot' | 'perpetual'): Trade {
  // Existing explicit product classifications are edited through the normal trade editor.
  if (!product || trade.market !== 'crypto' || cryptoProductForTrade(trade)) return trade;
  return editExcursions(trade, { ...trade, cryptoProductType: product });
}

/** A concurrent edit/delete causes a conflict instead of restoring an outdated trade snapshot. */
export async function saveExcursionPatch(owner: string, profile: string, record: StoredExcursionTrade, analyzed: Trade) {
  const patch: Record<string, unknown> = {};
  for (const field of ['cryptoProductType', 'mae', 'mfe', 'excursionEstimate', 'excursionScan'] as const) {
    if (analyzed[field] !== undefined) patch[field] = analyzed[field];
  }
  const updated = { ...record.original, ...patch };
  const serialized = JSON.stringify(updated);
  if (serialized === record.payload) return analyzed;
  const saved = await db().prepare('UPDATE trades SET payload=?,updated_at=? WHERE id=? AND user_id=? AND profile_id=? AND payload=? RETURNING payload').bind(serialized, new Date().toISOString(), analyzed.id, owner, profile, record.payload).first<{ payload: string }>();
  return saved ? updated as unknown as Trade : null;
}
