/** ms < 1000 → "N мс", otherwise "N.NN с". */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} мс`;
  return `${(ms / 1000).toFixed(2)} с`;
}

/** Fraction 0..1 → "X.X%". */
export function percent(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** "HH:MM:SS" in local time for an ISO timestamp. */
export function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** done/total → 0..100 for <Progress>. */
export function progressValue(done: number, total: number): number {
  return total > 0 ? Math.min(100, (done / total) * 100) : 0;
}
