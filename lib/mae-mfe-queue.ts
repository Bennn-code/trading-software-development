import type { CryptoCursor } from './market-candles';

export type MaeMfeSkip = { id: string; reason: string; retryable?: boolean };
export type MaeMfeQueueState<Row extends { id: string }> = { rows: Row[]; skipped: MaeMfeSkip[]; attempted: string[]; resume: Record<string, CryptoCursor> };
export type MaeMfeBatch<Row extends { id: string }> = { rows: Row[]; skipped: MaeMfeSkip[]; completed: string[]; deferred: { id: string; resume?: CryptoCursor }[]; stopped: boolean };

export function retryableMaeMfe<Row extends { id: string }>(current: MaeMfeQueueState<Row>): MaeMfeQueueState<Row> {
  const retry = new Set(current.skipped.filter(row => row.retryable).map(row => row.id));
  return { ...current, skipped: current.skipped.filter(row => !retry.has(row.id)), attempted: current.attempted.filter(id => !retry.has(id)) };
}

// Completion is reported by the server, never inferred from the submitted IDs.
export function mergeMaeMfeBatch<Row extends { id: string }>(current: MaeMfeQueueState<Row>, batchIds: string[], result: MaeMfeBatch<Row>): MaeMfeQueueState<Row> {
  const allowed = new Set(batchIds), rows = new Map(current.rows.map(row => [row.id, row])), skipped = new Map(current.skipped.map(row => [row.id, row])), resume = { ...current.resume };
  const completed = result.completed.filter(id => allowed.has(id));
  for (const id of completed) { skipped.delete(id); delete resume[id]; }
  for (const row of result.rows) if (allowed.has(row.id)) { rows.set(row.id, row); skipped.delete(row.id); }
  for (const row of result.skipped) if (allowed.has(row.id)) skipped.set(row.id, row);
  for (const item of result.deferred) if (allowed.has(item.id) && !completed.includes(item.id) && item.resume) resume[item.id] = item.resume;
  return { rows: [...rows.values()], skipped: [...skipped.values()], attempted: [...new Set([...current.attempted, ...completed])], resume };
}
