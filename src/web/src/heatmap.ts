// Weight heatmaps: each class's 1024 weights drawn as a 32×32 image.
export const HEATMAP_SIDE = 32;

export type Rgb = readonly [number, number, number];

/** Diverging palette: `base` at w = 0, `positive` / `negative` at ±maxAbs. */
export interface HeatmapPalette {
  base: Rgb;
  positive: Rgb;
  negative: Rgb;
}

function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** Colour of weight `w` (already divided by maxAbs, so in -1..1). */
export function weightColor(w: number, p: HeatmapPalette): Rgb {
  return mix(p.base, w >= 0 ? p.positive : p.negative, Math.min(1, Math.abs(w)));
}

/** max |w| over all classes (1 when every weight is zero). */
export function maxAbsWeight(weights: readonly number[][]): number {
  let maxAbs = 0;
  for (const row of weights) for (const w of row) maxAbs = Math.max(maxAbs, Math.abs(w));
  return maxAbs === 0 ? 1 : maxAbs;
}

/** Paint one class's weights; intensity = |w| / maxAbs. */
export function drawWeights(canvas: HTMLCanvasElement, row: readonly number[], maxAbs: number, palette: HeatmapPalette): void {
  canvas.width = HEATMAP_SIDE;
  canvas.height = HEATMAP_SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(HEATMAP_SIDE, HEATMAP_SIDE);
  const n = Math.min(row.length, HEATMAP_SIDE * HEATMAP_SIDE);
  for (let i = 0; i < HEATMAP_SIDE * HEATMAP_SIDE; i++) {
    const [r, g, b] = weightColor(i < n ? row[i] / maxAbs : 0, palette);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
