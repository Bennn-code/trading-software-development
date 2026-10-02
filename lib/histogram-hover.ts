import type { NetPnlBin } from './trade-performance';

export type HistogramArea = { x: number; y: number; width: number; height: number };
export type HistogramCursor = { x: number; y: number };
type HistogramBin = Pick<NetPnlBin, 'key' | 'min' | 'max' | 'sign'> & Partial<Pick<NetPnlBin, 'minInclusive' | 'maxInclusive'>>;

/** Match the custom numeric histogram's displayed rectangles, including the 6px zero bucket. */
export function histogramBarGeometry(bin: HistogramBin, domain: [number, number], area: HistogramArea) {
  const project = (value: number) => area.x + (value - domain[0]) / (domain[1] - domain[0]) * area.width;
  const left = project(bin.min);
  const right = project(bin.max);
  const width = bin.sign === 'flat' ? 6 : Math.max(1, right - left - 2);
  const x = bin.sign === 'flat' ? left - 3 : left + 1;
  return { x, width, center: x + width / 2, minX: left, maxX: right };
}

/** Pick by interval span, rather than categorical or nearest-midpoint hitboxes. */
export function histogramHover<T extends HistogramBin>(bins: T[], domain: [number, number], area: HistogramArea | null | undefined, cursor: HistogramCursor | null) {
  if (!area || !cursor || !(area.width > 0) || !(area.height > 0) || !(domain[1] > domain[0]) ||
    ![cursor.x, cursor.y, area.x, area.y, area.width, area.height, ...domain].every(Number.isFinite) ||
    cursor.x < area.x || cursor.x > area.x + area.width || cursor.y < area.y || cursor.y > area.y + area.height) return null;
  const candidates = bins.map((bin, index) => ({ bin, index, ...histogramBarGeometry(bin, domain, area) }));
  // The independently counted breakeven bar overlaps its neighboring ranges visually.
  const flat = candidates.find(row => row.bin.sign === 'flat' && cursor.x >= row.x && cursor.x <= row.x + row.width);
  if (flat) return flat;
  const matching = candidates.filter(row => {
    if (row.bin.sign === 'flat') return false;
    // Decimal dimensions can differ by a few floating-point ulps at the same projected edge.
    // Treat only that numerical noise as equality, then use the actual bin's endpoint rules.
    const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(cursor.x), Math.abs(row.minX), Math.abs(row.maxX), Math.abs(area.x + area.width));
    const atMin = Math.abs(cursor.x - row.minX) <= tolerance;
    const atMax = Math.abs(cursor.x - row.maxX) <= tolerance;
    const minInclusive = row.bin.minInclusive ?? row.bin.sign === 'loss';
    const maxInclusive = row.bin.maxInclusive ?? row.bin.sign === 'profit';
    return (atMin ? minInclusive : cursor.x > row.minX) && (atMax ? maxInclusive : cursor.x < row.maxX);
  });
  matching.sort((a, b) => Math.abs(cursor.x - a.center) - Math.abs(cursor.x - b.center) || a.index - b.index);
  return matching[0] ?? null;
}
