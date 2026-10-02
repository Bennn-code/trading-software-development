'use client';

import { usePlotArea } from 'recharts';

export type PlotCursor = { x: number; y: number } | null;

/** Shared movable crosshair; keep the cursor inside the chart's actual plotting area. */
export function PlotCrosshair({ cursor }: { cursor: PlotCursor }) {
  const area = usePlotArea();
  if (!area || !cursor || cursor.x < area.x || cursor.x > area.x + area.width || cursor.y < area.y || cursor.y > area.y + area.height) return null;
  return <g className="analytics-crosshair" pointerEvents="none" aria-hidden="true">
    <line x1={cursor.x} x2={cursor.x} y1={area.y} y2={area.y + area.height} />
    <line x1={area.x} x2={area.x + area.width} y1={cursor.y} y2={cursor.y} />
  </g>;
}
