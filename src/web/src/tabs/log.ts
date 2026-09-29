// «Лог»: server log entries, newest first, capped at 1000 items.
import { api, type LogEntry } from '../api';
import { onHub } from '../hub';
import { $, el, errorMessage, formatTime } from '../util';

const MAX_ITEMS = 1000;

function levelClass(level: string): string {
  const l = level.toLowerCase();
  if (l === 'warning' || l === 'warn') return 'log__item log__item--warn';
  if (l === 'error' || l === 'fatal' || l === 'critical') return 'log__item log__item--error';
  if (l === 'debug' || l === 'verbose' || l === 'trace') return 'log__item log__item--debug';
  return 'log__item';
}

function key(e: LogEntry): string {
  return `${e.timestamp}|${e.level}|${e.message}`;
}

export function initLog(): void {
  const list = $<HTMLOListElement>('log-list');
  const count = $('log-count');
  let loaded = false;
  const pending: LogEntry[] = [];

  const updateCount = () => {
    count.textContent = `${list.childElementCount} записів`;
  };

  const render = (e: LogEntry): HTMLLIElement => {
    const li = el('li', levelClass(e.level));
    li.append(
      el('time', 'log__time', formatTime(e.timestamp)),
      el('span', 'log__level', `[${e.level}]`),
      el('span', 'log__msg', e.message),
    );
    li.querySelector('time')?.setAttribute('datetime', e.timestamp);
    return li;
  };

  const add = (e: LogEntry) => {
    list.prepend(render(e));
    while (list.childElementCount > MAX_ITEMS) list.lastElementChild?.remove();
  };

  onHub({
    log: (e) => {
      if (!loaded) {
        pending.push(e);
        return;
      }
      add(e);
      updateCount();
    },
  });

  void (async () => {
    try {
      const entries = await api.getLogs();
      const sorted = [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      const seen = new Set(sorted.map(key));
      for (const e of sorted.slice(-MAX_ITEMS)) add(e);
      for (const e of pending) if (!seen.has(key(e))) add(e);
    } catch (e) {
      list.prepend(el('li', 'log__item log__item--error', `Не вдалося завантажити лог: ${errorMessage(e)}`));
      for (const p of pending) add(p);
    } finally {
      pending.length = 0;
      loaded = true;
      updateCount();
    }
  })();
}
