import { cryptoProductForTrade, type Trade } from './trades';

/** Excludes notes, account and optional excursions so edits to those cannot invalidate prices. */
export function excursionInput(trade: Trade) {
  const quantity = trade.market === 'crypto' && trade.positionValue != null && trade.entry > 0 ? trade.positionValue / trade.entry : trade.quantity;
  return JSON.stringify([trade.market, trade.symbol, trade.priceSymbol ?? null, trade.currency, trade.side, trade.entryTime, trade.exitTime, trade.timezone ?? 'Asia/Taipei', trade.entry, trade.exit, quantity, trade.market === 'crypto' ? 1 : trade.multiplier, trade.positionValue ?? null, cryptoProductForTrade(trade)]);
}
export function savedExcursions(trade: Trade) {
  const estimate = trade.excursionEstimate, valid = estimate?.input === excursionInput(trade);
  const value = (field: 'mae' | 'mfe') => {
    const raw = trade[field] ?? null, fromEstimate = raw !== null && estimate?.[field] === raw;
    return { amount: fromEstimate && !valid ? null : raw, automatic: fromEstimate && valid };
  };
  return { mae: value('mae'), mfe: value('mfe'), estimate: valid ? estimate : null };
}
export type ExcursionResult = { id: string; mae: number | null; mfe: number | null; provider: string; timeframe?: string; referenceSymbol?: string; productType?: string; candleCount: number };
export function fillExcursions(current: Trade, queried: Trade, result: ExcursionResult, touched: Set<string>) {
  if (current.id !== result.id || excursionInput(current) !== excursionInput(queried)) return current;
  if (!result.timeframe || !result.referenceSymbol || !result.productType || !result.candleCount) return current;
  const mae = current.mae == null && !touched.has(`${current.id}:mae`) && result.mae != null && Number.isFinite(result.mae) && result.mae <= 0 ? result.mae : null;
  const mfe = current.mfe == null && !touched.has(`${current.id}:mfe`) && result.mfe != null && Number.isFinite(result.mfe) && result.mfe >= 0 ? result.mfe : null;
  if (mae === null && mfe === null) return current;
  const old = savedExcursions(current).estimate;
  return { ...current, mae: mae ?? current.mae, mfe: mfe ?? current.mfe, excursionEstimate: { input: excursionInput(current), provider: result.provider, timeframe: result.timeframe, referenceSymbol: result.referenceSymbol, productType: result.productType, candleCount: result.candleCount, mae: mae ?? old?.mae ?? null, mfe: mfe ?? old?.mfe ?? null } };
}
export function editExcursions(previous: Trade, next: Trade) {
  if (!previous.excursionEstimate) return next;
  const changed = excursionInput(previous) !== excursionInput(next), estimate = { ...previous.excursionEstimate };
  let result = next;
  for (const field of ['mae', 'mfe'] as const) {
    if (next[field] !== previous[field]) estimate[field] = null; // Explicit manual input takes priority, including blank.
    else if (changed && estimate[field] !== null && next[field] === estimate[field]) result = { ...result, [field]: null };
  }
  return { ...result, excursionEstimate: changed ? null : estimate };
}
