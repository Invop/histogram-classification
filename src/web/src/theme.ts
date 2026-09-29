// Follows the OS colour scheme by toggling the `.dark` class that shadcn/ui tokens key off.
const media = window.matchMedia('(prefers-color-scheme: dark)');

function apply(): void {
  document.documentElement.classList.toggle('dark', media.matches);
}

apply();
media.addEventListener('change', apply);

/** Called after the `.dark` class has been updated; returns an unsubscribe function. */
export function onThemeChange(listener: () => void): () => void {
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

/**
 * Resolve a CSS custom property (e.g. an oklch() token) to an rgba() string.
 * Chart.js cannot parse oklch, so the colour is rasterised and read back.
 */
export function themeColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v || !probe) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = fallback;
  probe.fillStyle = v; // an unparsable value leaves the fallback in place
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/** Like `themeColor`, as [r, g, b] (alpha dropped). */
export function themeRgb(name: string, fallback: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = (themeColor(name, fallback).match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b];
}
