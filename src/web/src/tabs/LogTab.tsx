// «Лог»: server log entries, newest first, capped at 1000 items.
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { api, type LogEntry } from '../api';
import { Panel } from '../components/common';
import { useHub } from '../hooks';
import { errorMessage, formatTime } from '../util';

const MAX_ITEMS = 1000;

interface Row {
  id: number;
  entry?: LogEntry;
  /** Local error line without timestamp/level. */
  error?: string;
}

function levelClass(level: string): string {
  const l = level.toLowerCase();
  if (l === 'warning' || l === 'warn') return 'text-warning';
  if (l === 'error' || l === 'fatal' || l === 'critical') return 'text-destructive';
  if (l === 'debug' || l === 'verbose' || l === 'trace') return 'opacity-70';
  return '';
}

function key(e: LogEntry): string {
  return `${e.timestamp}|${e.level}|${e.message}`;
}

export function LogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const nextId = useRef(0);
  const loaded = useRef(false);
  const pending = useRef<LogEntry[]>([]);

  /** Prepend entries (oldest first in `entries`) so the newest ends up on top. */
  const prepend = (items: Array<Omit<Row, 'id'>>) =>
    setRows((prev) => {
      const added = items.map((r) => ({ ...r, id: nextId.current++ })).reverse();
      return [...added, ...prev].slice(0, MAX_ITEMS);
    });

  useHub({
    log: (e) => {
      if (!loaded.current) pending.current.push(e);
      else prepend([{ entry: e }]);
    },
  });

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const items: Array<Omit<Row, 'id'>> = [];
      try {
        const entries = await api.getLogs();
        const sorted = [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        const seen = new Set(sorted.map(key));
        for (const e of sorted.slice(-MAX_ITEMS)) items.push({ entry: e });
        for (const e of pending.current) if (!seen.has(key(e))) items.push({ entry: e });
      } catch (e) {
        items.push({ error: `Не вдалося завантажити лог: ${errorMessage(e)}` });
        for (const p of pending.current) items.push({ entry: p });
      } finally {
        pending.current = [];
        loaded.current = true;
        prepend(items);
      }
    })();
  }, []);

  return (
    <Panel
      title="Журнал операцій"
      action={<span className="text-xs text-muted-foreground tabular-nums">{rows.length} записів</span>}
      bodyClassName="gap-3"
    >
      <p className="text-xs text-muted-foreground">
        Також записується у <code className="font-mono">logs/app-YYYYMMDD.log</code>
      </p>
        <ol className="max-h-[calc(100vh-17rem)] min-h-52 overflow-auto rounded-md border border-hairline bg-inset font-mono text-xs leading-relaxed">
          {rows.map((r) =>
            r.entry ? (
              <li key={r.id} className={cn('flex flex-wrap gap-x-3 border-b border-hairline px-3 py-1 last:border-b-0', levelClass(r.entry.level))}>
                <time dateTime={r.entry.timestamp} className="text-faint tabular-nums">
                  {formatTime(r.entry.timestamp)}
                </time>
                <span className={levelClass(r.entry.level).startsWith('text-') ? 'font-bold' : 'text-muted-foreground'}>
                  [{r.entry.level}]
                </span>
                <span className="min-w-0 flex-[1_1_20ch] break-words whitespace-pre-wrap">{r.entry.message}</span>
              </li>
            ) : (
              <li key={r.id} className="border-b border-hairline px-3 py-1 text-destructive last:border-b-0">
                {r.error}
              </li>
            ),
          )}
        </ol>
    </Panel>
  );
}
