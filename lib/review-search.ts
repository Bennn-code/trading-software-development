export type DailyReviewRow = { start_date: string; payload: string };
export type DailyReviewMatch = { id: string; date: string; kind: 'strategy' | 'reflection'; text: string };

function excerpt(text: string, query: string) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, start + 150);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function dailyReviewMatches(rows: DailyReviewRow[], query: string): DailyReviewMatch[] {
  const term = query.trim();
  if (term.length < 2) return [];
  return rows.flatMap(row => {
    let record: { strategy?: unknown; reflection?: unknown };
    try {
      record = JSON.parse(row.payload) as { strategy?: unknown; reflection?: unknown };
    } catch {
      return [];
    }
    return (['strategy', 'reflection'] as const).flatMap(kind => {
      const text = typeof record[kind] === 'string' ? record[kind] as string : '';
      return text.toLocaleLowerCase().includes(term.toLocaleLowerCase())
        ? [{ id: `${row.start_date}-${kind}`, date: row.start_date, kind, text: excerpt(text, term) }]
        : [];
    });
  }).slice(0, 50);
}
