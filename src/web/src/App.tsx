import { useEffect, useState, useSyncExternalStore } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useHub } from './hooks';
import { getHubStatus, onHubStatus, type HubStatus, type JobName } from './hub';
import { DataTab } from './tabs/DataTab';
import { LogTab } from './tabs/LogTab';
import { RecognitionTab } from './tabs/RecognitionTab';
import { TrainingTab } from './tabs/TrainingTab';

const TABS = [
  { id: 'data', label: 'Дані', Content: DataTab },
  { id: 'training', label: 'Навчання', Content: TrainingTab },
  { id: 'recognition', label: 'Розпізнавання', Content: RecognitionTab },
  { id: 'log', label: 'Лог', Content: LogTab },
] as const;

type Tab = (typeof TABS)[number]['id'];

function tabFromHash(): Tab | null {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : null;
}

const STATUS_TEXT: Record<HubStatus, string> = {
  connecting: 'Підключення…',
  connected: 'Підключено',
  reconnecting: 'Перепідключення…',
  disconnected: 'Немає з’єднання',
};

const STATUS_DOT: Record<HubStatus, string> = {
  connecting: 'bg-faint',
  connected: 'bg-success',
  reconnecting: 'bg-warning',
  disconnected: 'bg-destructive',
};

const JOB_TEXT: Record<JobName, string> = {
  training: 'навчання',
  generate: 'генерація',
};

function ConnectionStatus() {
  const status = useSyncExternalStore(onHubStatus, getHubStatus);
  return (
    <span
      className={cn('flex items-center gap-2 text-muted-foreground', status === 'disconnected' && 'text-destructive')}
      title="Стан підключення до сервера"
    >
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_TEXT[status]}
    </span>
  );
}

function CurrentOperation() {
  const [op, setOp] = useState<JobName | null>(null);
  useHub({
    started: (e) => setOp(e.name),
    // page opened mid-job: infer the operation from the stage
    progress: (p) => setOp((cur) => cur ?? (p.stage === 'generate' ? 'generate' : 'training')),
    completed: () => setOp(null),
    failed: () => setOp(null),
  });
  if (!op) return null;
  return (
    <span className="flex items-center gap-2 font-medium text-chart-1">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      Виконується: {JOB_TEXT[op] ?? op}
    </span>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash() ?? 'data');

  useEffect(() => {
    const sync = () => {
      const t = tabFromHash();
      if (t) setTab(t);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  }, [tab]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-svh gap-0">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-8">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2">
            <h1 className="text-[15px] font-semibold tracking-tight">Розпізнавання зображень за неповною гістограмою</h1>
            <div className="flex flex-wrap items-center gap-5 text-xs">
              <CurrentOperation />
              <ConnectionStatus />
            </div>
          </div>
          <TabsPrimitive.List aria-label="Розділи" className="-mb-px flex h-12 gap-7 overflow-x-auto">
            {TABS.map((t) => (
              <TabsPrimitive.Trigger
                key={t.id}
                value={t.id}
                className="flex shrink-0 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=active]:border-chart-1 data-[state=active]:text-foreground"
              >
                {t.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-8 sm:px-8">
        {TABS.map(({ id, Content }) => (
          // keep every tab mounted: charts and job progress must survive switching tabs
          <TabsContent key={id} value={id} forceMount className="data-[state=inactive]:hidden">
            <Content />
          </TabsContent>
        ))}
      </main>
    </Tabs>
  );
}
