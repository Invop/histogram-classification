// Weight heatmaps: each class's 1024 weights drawn as a 32×32 image.
import { el } from './util';

const SIDE = 32;
const POSITIVE: readonly [number, number, number] = [20, 40, 140]; // dark blue
const NEGATIVE: readonly [number, number, number] = [200, 30, 30]; // red

function mix(target: readonly [number, number, number], t: number): [number, number, number] {
  // white → target, t in 0..1
  return [
    Math.round(255 + (target[0] - 255) * t),
    Math.round(255 + (target[1] - 255) * t),
    Math.round(255 + (target[2] - 255) * t),
  ];
}

/** Render one canvas per class; intensity = |w| / max|w| over all classes. */
export function renderWeights(container: HTMLElement, classes: readonly string[], weights: readonly number[][]): void {
  container.replaceChildren();
  if (classes.length === 0 || weights.length === 0) {
    container.append(el('p', 'muted', 'Немає ваг для відображення.'));
    return;
  }

  let maxAbs = 0;
  for (const row of weights) for (const w of row) maxAbs = Math.max(maxAbs, Math.abs(w));
  if (maxAbs === 0) maxAbs = 1;

  weights.forEach((row, k) => {
    const canvas = el('canvas', 'heatmap-canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(SIDE, SIDE);
      const n = Math.min(row.length, SIDE * SIDE);
      for (let i = 0; i < SIDE * SIDE; i++) {
        const w = i < n ? row[i] : 0;
        const [r, g, b] = mix(w >= 0 ? POSITIVE : NEGATIVE, Math.min(1, Math.abs(w) / maxAbs));
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    const name = classes[k] ?? `#${k}`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Ваги класу ${name}`);

    const figure = el('figure', 'heatmap');
    figure.append(canvas, el('figcaption', undefined, name));
    container.append(figure);
  });
}
