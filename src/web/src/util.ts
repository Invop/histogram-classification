/** Typed getElementById that throws when the element is missing. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

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

/** Create an element with optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Read a CSS custom property from :root. */
export function cssVar(name: string, fallback = ''): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Replace the options of a <datalist>. */
export function fillDatalist(list: HTMLDataListElement, values: readonly string[]): void {
  list.replaceChildren(
    ...values.map((v) => {
      const o = document.createElement('option');
      o.value = v;
      return o;
    }),
  );
}

/** Collapsible list of file names (e.g. skipped or rejected files). Empty list → empty fragment. */
export function fileList(summary: string, files: readonly string[]): HTMLElement | DocumentFragment {
  if (files.length === 0) return document.createDocumentFragment();
  const details = el('details', 'file-list');
  details.append(el('summary', undefined, `${summary}: ${files.length}`));
  const ul = el('ul');
  const shown = files.slice(0, 500);
  for (const f of shown) ul.append(el('li', undefined, f));
  if (files.length > shown.length) ul.append(el('li', 'muted', `… і ще ${files.length - shown.length}`));
  details.append(ul);
  return details;
}
