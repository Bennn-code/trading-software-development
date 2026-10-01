import { z } from 'zod';
import { ApiError, failure, identity, json, readJson } from '@/lib/server';
import { enforceRateLimit } from '@/lib/security';
import { confirmStoredProduct, saveExcursionPatch, storedExcursionTrades } from '@/lib/mae-mfe-persistence';
import type { Trade } from '@/lib/trades';

const inputSchema = z.object({
  profileId: z.string().uuid().optional(),
  confirmations: z.record(z.string().uuid(), z.enum(['spot', 'perpetual'])),
}).strict().refine(input => Object.keys(input.confirmations).length >= 1 && Object.keys(input.confirmations).length <= 200);

export async function POST(request: Request) {
  try {
    const owner = await identity(request, true);
    await enforceRateLimit(request, { scope: 'trade-excursion-confirm', limit: 120, ipLimit: 240, windowSeconds: 3600, subject: owner });
    const parsed = inputSchema.safeParse(await readJson(request, 16_000));
    if (!parsed.success) throw new ApiError('請確認所選交易的現貨或永續商品類型。');
    const { profile, records } = await storedExcursionTrades(owner, Object.keys(parsed.data.confirmations), parsed.data.profileId);
    const persistedTrades: Trade[] = [], conflicts: string[] = [];
    for (const record of records) {
      const confirmed = confirmStoredProduct(record.trade, parsed.data.confirmations[record.trade.id]);
      if (confirmed === record.trade) { persistedTrades.push(record.trade); continue; }
      const saved = await saveExcursionPatch(owner, profile, record, confirmed);
      if (saved) persistedTrades.push(saved); else conflicts.push(record.trade.id);
    }
    return json({ persistedTrades, conflicts });
  } catch (error) { return failure(error); }
}
