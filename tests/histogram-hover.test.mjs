import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const outputDirectory = path.resolve('work/histogram-hover-tests');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'histogram-hover.cjs'), ts.transpileModule(fs.readFileSync('lib/histogram-hover.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText);
const require = createRequire(path.join(outputDirectory, 'runner.cjs'));
const { histogramBarGeometry, histogramHover } = require('./histogram-hover.cjs');

const bins = [
  { key: 'loss-wide', min: -30, max: -10, sign: 'loss', count: 7 },
  { key: 'loss-narrow', min: -10, max: 0, sign: 'loss', count: 1 },
  { key: 'flat', min: 0, max: 0, sign: 'flat', count: 2 },
  { key: 'profit-narrow', min: 0, max: 10, sign: 'profit', count: 3 },
  { key: 'profit-wide', min: 10, max: 30, sign: 'profit', count: 4 },
];
const original = JSON.stringify(bins);
const domain = [-40, 40];
const area = { x: 20, y: 10, width: 800, height: 200 };
const hoverAmount = (amount, y = area.y + 1) => histogramHover(bins, domain, area, { x: area.x + (amount - domain[0]) / (domain[1] - domain[0]) * area.width, y });

// Hovering above a bar must not depend on its height or prior item-hover events.
assert.equal(hoverAmount(-5).bin.key, 'loss-narrow');
assert.equal(hoverAmount(-5).bin.count, 1);
assert.equal(hoverAmount(-5).index, 1);
assert.equal(hoverAmount(-5, area.y + area.height - 1).bin.key, 'loss-narrow');
assert.equal(hoverAmount(-5).center, histogramBarGeometry(bins[1], domain, area).center);

// A wide interval edge can be closer to the neighboring narrow midpoint: span wins.
assert.equal(hoverAmount(10.1).bin.key, 'profit-wide');
assert.equal(hoverAmount(-10.1).bin.key, 'loss-wide');
assert.equal(hoverAmount(29.9).bin.key, 'profit-wide');
const wideGeometry = histogramBarGeometry(bins[4], domain, area);
assert.equal(hoverAmount(10.1).center, wideGeometry.x + wideGeometry.width / 2);
assert.equal(hoverAmount(29.9).center, hoverAmount(10.1).center, 'vertical crosshair stays at the selected bar center while the mouse traverses its span');

const flatGeometry = histogramBarGeometry(bins[2], domain, area);
assert.equal(flatGeometry.width, 6);
assert.equal(hoverAmount(0).bin.key, 'flat');
assert.equal(histogramHover(bins, domain, area, { x: flatGeometry.x, y: 11 }).bin.key, 'flat');
assert.equal(histogramHover(bins, domain, area, { x: flatGeometry.x + 6, y: 11 }).bin.key, 'flat');
assert.equal(histogramHover(bins, domain, area, { x: flatGeometry.x - 0.01, y: 11 }).bin.key, 'loss-narrow');
assert.equal(histogramHover(bins, domain, area, { x: flatGeometry.x + 6.01, y: 11 }).bin.key, 'profit-narrow');

assert.equal(hoverAmount(35), null, 'plot padding past all amount intervals has no tooltip');
assert.equal(hoverAmount(-35), null);
assert.equal(hoverAmount(5, area.y - 1), null, 'leaving the actual plotting area hides the tooltip even within the chart');
assert.equal(hoverAmount(5, area.y + area.height + 1), null);
assert.equal(histogramHover(bins, domain, area, null), null, 'leaving the whole chart clears selection');
assert.equal(histogramHover(bins, domain, null, { x: 200, y: 20 }), null);
assert.equal(histogramHover(bins, [0, 0], area, { x: 200, y: 20 }), null);
assert.equal(histogramHover(bins, domain, area, { x: NaN, y: 20 }), null);
assert.equal(histogramHover([], domain, area, { x: 200, y: 20 }), null);

const narrowArea = { x: 5, y: 10, width: 280, height: 170 };
const narrowX = 5 + (10.1 + 40) / 80 * 280;
const narrowSelection = histogramHover(bins, domain, narrowArea, { x: narrowX, y: 11 });
assert.equal(narrowSelection.bin.key, 'profit-wide');
assert.equal(narrowSelection.center, histogramBarGeometry(bins[4], domain, narrowArea).center, 'resized charts use current plotting dimensions');

const endpointBins = [
  { key: 'loss-left', min: -120, max: -80, sign: 'loss', minInclusive: true, maxInclusive: false },
  { key: 'loss-right', min: -80, max: -40, sign: 'loss', minInclusive: true, maxInclusive: false },
  { key: 'profit-left', min: 40, max: 80, sign: 'profit', minInclusive: false, maxInclusive: true },
  { key: 'profit-right', min: 80, max: 120, sign: 'profit', minInclusive: false, maxInclusive: true },
];
const endpointDomain = [-140, 140];
for (const dimensions of [area, narrowArea, { x: 4.125, y: 3.75, width: 177.375, height: 140.125 }]) {
  const projected = amount => dimensions.x + (amount - endpointDomain[0]) / (endpointDomain[1] - endpointDomain[0]) * dimensions.width;
  const pick = (amount, pixelDelta = 0) => histogramHover(endpointBins, endpointDomain, dimensions, { x: projected(amount) + pixelDelta, y: dimensions.y + 1 });
  assert.equal(pick(-80).bin.key, 'loss-right', 'loss [-120,-80) excludes the shared edge included in [-80,-40)');
  assert.equal(pick(80).bin.key, 'profit-left', 'profit (40,80] includes the shared edge excluded by (80,120]');
  for (const direction of [-1, 1]) {
    assert.equal(pick(-80, direction * Number.EPSILON * Math.max(1, Math.abs(projected(-80)))).bin.key, 'loss-right', 'mobile fractional-pixel rounding preserves loss endpoint inclusion');
    assert.equal(pick(80, direction * Number.EPSILON * Math.max(1, Math.abs(projected(80)))).bin.key, 'profit-left', 'mobile fractional-pixel rounding preserves profit endpoint inclusion');
  }
  assert.equal(pick(-80, -0.01).bin.key, 'loss-left', 'real pointer movement immediately crosses into the adjacent interval');
  assert.equal(pick(-80, 0.01).bin.key, 'loss-right');
  assert.equal(pick(80, -0.01).bin.key, 'profit-left');
  assert.equal(pick(80, 0.01).bin.key, 'profit-right');
  assert.equal(pick(-120).bin.key, 'loss-left');
  assert.equal(pick(-40), null, 'an exclusive outer maximum does not invent an interval');
  assert.equal(pick(40), null, 'an exclusive outer minimum does not invent an interval');
  assert.equal(pick(120).bin.key, 'profit-right');
}
const explicitInclusive = [{ key: 'both', min: 10, max: 20, sign: 'profit', minInclusive: true, maxInclusive: true }];
assert.equal(histogramHover(explicitInclusive, domain, area, { x: 520, y: 11 }).bin.key, 'both', 'explicit endpoint flags override default sign conventions');

const emptyCountBins = [{ key: 'empty-range', min: 10, max: 20, sign: 'profit', count: 0 }];
assert.equal(histogramHover(emptyCountBins, domain, area, { x: 570, y: 11 }).bin.count, 0, 'an existing empty interval reports its real zero count');
assert.equal(JSON.stringify(bins), original, 'hovering never edits statistical bins or sample counts');
console.log('Passed histogram hover: above-bar interval projection, different widths, snapped rectangle centers, 6px breakeven priority, inclusive/exclusive shared edges and floating pixel precision, plot boundaries, empty bins and resize.');
