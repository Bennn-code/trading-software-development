import { tradeSchema, tradeIssueMessage } from './validation';
import type { ImportCandidate } from './screenshot-import';

export function rowProblems(row:ImportCandidate) {
 const parsed=tradeSchema.safeParse(row.trade);
 return parsed.success?[]:[...new Set(parsed.error.issues.map(tradeIssueMessage))];
}
export function importBlockers(rows:ImportCandidate[]) {
 if(!rows.some(r=>r.selected))return ['請至少選擇一筆要儲存的交易。'];
 return rows.flatMap((row,i)=>!row.selected?[]:[...rowProblems(row),...(!row.confirmed?['尚未勾選已核對。']:[])].map(message=>`第 ${i+1} 筆 ${row.trade.symbol}：${message}`));
}
