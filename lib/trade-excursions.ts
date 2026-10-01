import { cryptoExcursionPosition, cryptoProductForTrade, type ExcursionSizeBasis, type ExcursionTime, type Trade } from './trades';

/** Excludes notes, account and optional excursions so edits to those cannot invalidate prices. */
export function excursionInput(trade: Trade) {
  const position = trade.market === 'crypto' ? cryptoExcursionPosition(trade) : null;
  return JSON.stringify([2,trade.market, trade.symbol, trade.priceSymbol ?? null, trade.currency, trade.side, trade.entryTime, trade.exitTime, trade.timezone ?? 'Asia/Taipei', trade.entry, trade.exit, position?.quantity??trade.quantity, trade.market === 'crypto' ? 1 : trade.multiplier, trade.market==='crypto'?position?.notional??null:trade.positionValue??null, cryptoProductForTrade(trade),trade.positionSizing??null,trade.marginAmount??null,trade.leverage??null,trade.marginMode??null]);
}
export function savedExcursions(trade: Trade) {
  const estimate = trade.excursionEstimate, valid = estimate?.calculationVersion===2&&estimate?.input === excursionInput(trade);
  const value = (field: 'mae' | 'mfe') => {
    const raw = trade[field] ?? null, fromEstimate = raw !== null && estimate?.[field] === raw;
    return { amount: fromEstimate && !valid ? null : raw, automatic: fromEstimate && valid };
  };
  return { mae: value('mae'), mfe: value('mfe'), estimate: valid ? estimate : null };
}
export type ExcursionResult = { id: string; mae: number | null; mfe: number | null; provider: string; timeframe?: string; referenceSymbol?: string; productType?: string; candleCount: number; calculationVersion?: number; sizeBasis?:ExcursionSizeBasis; maeTime?:ExcursionTime|null; mfeTime?:ExcursionTime|null };
export function fillExcursions(current: Trade, queried: Trade, result: ExcursionResult, touched: Set<string>) {
  if (current.id !== result.id || excursionInput(current) !== excursionInput(queried)) return current;
  if (!result.timeframe || !result.referenceSymbol || !result.productType || !result.candleCount ||result.calculationVersion!==2) return current;
  // A stale automatic result is replaceable; a number independently entered by the user is not.
  const saved=savedExcursions(current);
  if(saved.mae.amount!==current.mae||saved.mfe.amount!==current.mfe)current={...current,mae:saved.mae.amount,mfe:saved.mfe.amount};
  const mae = current.mae == null && !touched.has(`${current.id}:mae`) && result.mae != null && Number.isFinite(result.mae) && result.mae <= 0 ? result.mae : null;
  const mfe = current.mfe == null && !touched.has(`${current.id}:mfe`) && result.mfe != null && Number.isFinite(result.mfe) && result.mfe >= 0 ? result.mfe : null;
  if (mae === null && mfe === null) return current;
  const old = savedExcursions(current).estimate;
  return { ...current, mae: mae ?? current.mae, mfe: mfe ?? current.mfe, excursionEstimate: { input: excursionInput(current), provider: result.provider, timeframe: result.timeframe, referenceSymbol: result.referenceSymbol, productType: result.productType, candleCount: result.candleCount, calculationVersion:2,sizeBasis:result.sizeBasis,mae: mae ?? old?.mae ?? null, mfe: mfe ?? old?.mfe ?? null,maeTime:mae!==null?result.maeTime??null:old?.maeTime??null,mfeTime:mfe!==null?result.mfeTime??null:old?.mfeTime??null } };
}
export function editExcursions(previous: Trade, next: Trade) {
  if (!previous.excursionEstimate) return next;
  const changed = excursionInput(previous) !== excursionInput(next), estimate = { ...previous.excursionEstimate };
  let result = next;
  for (const field of ['mae', 'mfe'] as const) {
    if (next[field] !== previous[field]) {estimate[field] = null;estimate[field==='mae'?'maeTime':'mfeTime']=null;} // Explicit manual input takes priority, including blank.
    else if (changed && estimate[field] !== null && next[field] === estimate[field]) result = { ...result, [field]: null };
  }
  return { ...result, excursionEstimate: changed ? null : estimate,...(changed?{excursionScan:null}:{}) };
}
