'use client';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { cryptoProductForTrade, type Trade } from '@/lib/trades';
import { tradeSchema } from '@/lib/validation';
import { convertWallTime } from '@/lib/display-currency';
import { excursionInput, fillExcursions, type ExcursionResult } from '@/lib/trade-excursions';
import type { ImportCandidate } from '@/lib/screenshot-import';
import type { MaeMfeBatch } from '@/lib/mae-mfe-queue';
import type { CryptoCursor, CryptoQuoteSource } from '@/lib/market-candles';

export default function useScreenshotExcursions(enabled: boolean, rows: ImportCandidate[], setRows: Dispatch<SetStateAction<ImportCandidate[]>>, cryptoSource: CryptoQuoteSource) {
  const [progress, setProgress] = useState({ busy: false, filled: 0, reason: '', diagnostic: '' });
  const [retry, setRetry] = useState(0);
  const attempted = useRef(new Set<string>()), resumes = useRef(new Map<string, CryptoCursor>()), touched = useRef(new Set<string>()), blocked = useRef(false);
  const eligible = useMemo(() => rows.flatMap(row => {
    if (!row.selected || row.trade.market !== 'crypto' || !cryptoProductForTrade(row.trade) || row.trade.currency !== 'USDT' || (row.trade.mae != null && row.trade.mfe != null)) return [];
    const parsed = tradeSchema.safeParse(row.trade);
    if (!parsed.success || parsed.data.entry <= 0 || parsed.data.exit <= 0 || parsed.data.quantity <= 0 || parsed.data.exitTime <= parsed.data.entryTime) return [];
    try {
      if (Date.parse(`${convertWallTime(parsed.data.exitTime, parsed.data.timezone ?? 'Asia/Taipei', 'UTC')}:00Z`) > Date.now()) return [];
    } catch { return []; }
    return [{ ...parsed.data, cryptoProductType: cryptoProductForTrade(parsed.data) } as Trade];
  }), [rows]);
  const selection = JSON.stringify([cryptoSource, eligible.map(trade => [trade.id, excursionInput(trade)])]), latest = useRef(eligible);
  const session = rows[0]?.trade.imageId ?? '';
  useEffect(() => {
    attempted.current.clear(); resumes.current.clear(); touched.current.clear(); blocked.current = false;
    const timer = setTimeout(() => setProgress({ busy: false, filled: 0, reason: '', diagnostic: '' }), 0);
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => { attempted.current.clear(); resumes.current.clear(); blocked.current = false; }, [cryptoSource]);
  useEffect(() => { latest.current = eligible; }, [eligible]);
  useEffect(() => {
    if (!enabled || blocked.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const pending = latest.current.filter(trade => !attempted.current.has(trade.id + excursionInput(trade)));
      if (!pending.length) { setProgress(previous => ({ ...previous, busy: false })); return; }
      setProgress(previous => ({ ...previous, busy: true, reason: '', diagnostic: '' }));
      try {
        while (pending.length && !controller.signal.aborted) {
          const batch = pending.slice(0, 3), oldResume = JSON.stringify(batch.map(trade => resumes.current.get(trade.id + excursionInput(trade))));
          const resume = Object.fromEntries(batch.flatMap(trade => { const cursor = resumes.current.get(trade.id + excursionInput(trade)); return cursor ? [[trade.id, cursor]] : []; }));
          const response = await fetch('/api/trade-status/mae-mfe', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ cryptoSource, resume, trades: batch.map(trade => ({ ...trade, account: 'quote', notes: '', strategy: '', imageId: null, excursionEstimate: undefined })) }) });
          const result = await response.json() as MaeMfeBatch<ExcursionResult> & { error?: string };
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error(result.error || 'MAE／MFE 分析失敗');
          if (!Array.isArray(result.rows) || !Array.isArray(result.skipped) || !Array.isArray(result.completed) || !Array.isArray(result.deferred)) throw new Error('MAE／MFE 分析回應不完整，已保留進度，請稍後續查。');
          const submitted = new Map(batch.map(trade => [trade.id, trade]));
          setRows(current => current.map(row => {
            const queried = submitted.get(row.trade.id), value = result.rows.find(item => item.id === row.trade.id);
            return queried && value ? { ...row, trade: fillExcursions(row.trade, queried, value, touched.current) } : row;
          }));
          for (const id of result.completed) { const trade = submitted.get(id); if (trade) { attempted.current.add(id + excursionInput(trade)); resumes.current.delete(id + excursionInput(trade)); } }
          for (const item of result.deferred) { const trade = submitted.get(item.id); if (trade && item.resume) resumes.current.set(item.id + excursionInput(trade), item.resume); }
          const obtained = result.rows.filter(row => submitted.has(row.id) && row.candleCount > 0 && ((row.mae != null && Number.isFinite(row.mae) && row.mae <= 0) || (row.mfe != null && Number.isFinite(row.mfe) && row.mfe >= 0)));
          setProgress(previous => ({ ...previous, filled: previous.filled + obtained.length, reason: result.skipped[0]?.reason ?? previous.reason }));
          if (result.stopped) {
            blocked.current = true;
            const problem = result.skipped.find(item => item.retryable);
            setProgress(previous => ({ ...previous, reason: problem?.reason ?? '行情分析已暫停；請查看未完成原因，確認授權或稍後續查。', diagnostic: problem?.diagnostic ? `${problem.diagnostic.provider} · HTTP ${problem.diagnostic.status}` : '' }));
            break;
          }
          const nextResume = JSON.stringify(batch.map(trade => resumes.current.get(trade.id + excursionInput(trade))));
          if (!result.completed.length && oldResume === nextResume) throw new Error('MAE／MFE 分析回應不完整，已保留進度，請稍後續查。');
          for (let index = pending.length - 1; index >= 0; index--) if (attempted.current.has(pending[index].id + excursionInput(pending[index]))) pending.splice(index, 1);
        }
      } catch (error) {
        if (!controller.signal.aborted) { blocked.current = true; setProgress(previous => ({ ...previous, reason: error instanceof Error ? error.message : 'MAE／MFE 分析失敗' })); }
      } finally { if (!controller.signal.aborted) setProgress(previous => ({ ...previous, busy: false })); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, selection, cryptoSource, retry, setRows]);
  return { ...progress, busy: enabled && progress.busy, markEdited: (id: string, field: 'mae' | 'mfe') => touched.current.add(`${id}:${field}`), retry: () => { blocked.current = false; setRetry(value => value + 1); } };
}
