// «Дані»: Assets tree, file upload in batches, icon-group generation job.
import { ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, type AssetGroup } from '../api';
import { FIELD_LABEL, FileList, FormGrid, PAGE_GRID, Panel, StatusText, Timer, type Status } from '../components/common';
import { useAssets, useHub, useJob } from '../hooks';
import type { GenerateResult } from '../hub';
import { reloadAssets } from '../state';
import { errorMessage, formatMs, percent, progressValue } from '../util';

const UPLOAD_BATCH = 10;

export function DataTab() {
  return (
    <div className={PAGE_GRID}>
      <AssetsCard />
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-6">
        <UploadCard />
        <GenerateCard />
      </div>
    </div>
  );
}

function groupTotal(g: AssetGroup): number {
  return g.classes.reduce((s, c) => s + c.count, 0);
}

const count = (n: number) => n.toLocaleString('uk-UA');

/** Name · classes · images: shared by the header, rows and footer of the catalogue table. */
const TABLE_ROW = 'grid grid-cols-[minmax(0,1fr)_5rem_7rem] items-center gap-x-4 px-4';

// ---------- Assets tree ----------

function AssetsCard() {
  const { assets, error } = useAssets();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reloadAssets();
    } finally {
      setRefreshing(false);
    }
  };

  const groups = assets?.groups ?? [];
  const classCount = new Set(groups.flatMap((g) => g.classes.map((c) => c.name))).size;

  return (
    <Panel
      title="Каталог Assets"
      action={
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          Оновити
        </Button>
      }
      className="lg:col-span-6"
      bodyClassName="gap-0 p-0"
    >
      <div className="flex min-h-10 items-center gap-3 border-b border-hairline px-4 py-2">
        <span className="text-xs text-faint">Корінь</span>
        <code className="min-w-0 font-mono text-xs break-all text-muted-foreground">{assets?.root || '—'}</code>
      </div>
      <div className={TABLE_ROW + ' h-9 border-b border-hairline text-xs text-faint'}>
        <span>Група / клас</span>
        <span className="text-right">Класів</span>
        <span className="text-right">Зображень</span>
      </div>
      <div className="flex flex-1 flex-col">
        {error && <p className="px-4 py-3 text-sm text-destructive">Не вдалося завантажити каталог: {error}</p>}
        {!assets ? (
          !error && <p className="px-4 py-3 text-muted-foreground">Завантаження…</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-3 text-muted-foreground">Каталог порожній. Завантажте зображення у форму «Завантаження».</p>
        ) : (
          groups.map((g) => <GroupNode key={g.name} group={g} />)
        )}
      </div>
      {groups.length > 0 && (
        <div className={TABLE_ROW + ' h-11 border-t'}>
          <span className="font-semibold">Разом</span>
          <span className="text-right font-mono text-muted-foreground tabular-nums">{classCount}</span>
          <span className="text-right font-mono font-medium tabular-nums">
            {count(groups.reduce((s, g) => s + groupTotal(g), 0))}
          </span>
        </div>
      )}
    </Panel>
  );
}

function GroupNode({ group }: { group: AssetGroup }) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger
        className={
          TABLE_ROW +
          ' group h-10 w-full border-b border-hairline bg-muted/40 text-left font-mono font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset'
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight className="size-3.5 shrink-0 text-faint transition-transform group-data-[state=open]:rotate-90" />
          <span className="truncate">{group.name}</span>
        </span>
        <span className="text-right text-muted-foreground tabular-nums">{group.classes.length}</span>
        <span className="text-right tabular-nums">{count(groupTotal(group))}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul>
          {group.classes.length === 0 && (
            <li className={TABLE_ROW + ' h-10 border-b border-hairline pl-10 text-muted-foreground'}>немає класів</li>
          )}
          {group.classes.map((c) => (
            <li key={c.name} className={TABLE_ROW + ' h-10 border-b border-hairline font-mono text-muted-foreground'}>
              <span className="truncate pl-5.5">{c.name}</span>
              <span />
              <span className="text-right tabular-nums">{count(c.count)}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------- Upload ----------

function UploadCard() {
  const { assets } = useAssets();
  const [group, setGroup] = useState('hq-4k');
  const [cls, setCls] = useState('');
  const filesRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState<Status | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [picked, setPicked] = useState(0);

  const groupNames = assets?.groups.map((g) => g.name) ?? [];
  const selectedGroup = assets?.groups.find((x) => x.name === group.trim());
  const classNames = selectedGroup
    ? selectedGroup.classes.map((c) => c.name)
    : [...new Set(assets?.groups.flatMap((x) => x.classes.map((c) => c.name)) ?? [])].sort();

  const upload = async () => {
    const g = group.trim();
    const c = cls.trim();
    const selected = Array.from(filesRef.current?.files ?? []);
    setRejected([]);
    if (!g || !c) return setStatus({ text: 'Вкажіть групу і клас.', tone: 'error' });
    if (selected.length === 0) return setStatus({ text: 'Оберіть файли для завантаження.', tone: 'error' });

    setBusy(true);
    const total = selected.length;
    setProgress({ done: 0, total });
    setStatus({ text: `Завантажено 0 з ${total}…` });
    const t0 = performance.now();
    let sent = 0;
    let saved = 0;
    const rejectedFiles: string[] = [];
    try {
      for (let i = 0; i < total; i += UPLOAD_BATCH) {
        const batch = selected.slice(i, i + UPLOAD_BATCH);
        const r = await api.uploadFiles(g, c, batch);
        saved += r.saved;
        rejectedFiles.push(...r.rejected);
        sent += batch.length;
        setProgress({ done: sent, total });
        setStatus({ text: `Завантажено ${sent} з ${total}…` });
      }
      setStatus({ text: `Збережено ${saved} файлів за ${formatMs(performance.now() - t0)}`, tone: 'success' });
      if (filesRef.current) filesRef.current.value = '';
      setPicked(0);
    } catch (e) {
      setStatus({ text: `Помилка після ${sent} з ${total}: ${errorMessage(e)}`, tone: 'error' });
    } finally {
      setRejected(rejectedFiles);
      setBusy(false);
      void reloadAssets();
    }
  };

  return (
    <Panel title="Завантаження">
      <FormGrid>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="upload-group" className={FIELD_LABEL}>
            Група
          </FieldLabel>
          <Input
            id="upload-group"
            list="upload-groups-list"
            autoComplete="off"
            className="font-mono"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          />
          <datalist id="upload-groups-list">
            {groupNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="upload-class" className={FIELD_LABEL}>
            Клас
          </FieldLabel>
          <Input
            id="upload-class"
            list="upload-classes-list"
            autoComplete="off"
            placeholder="напр. ocean"
            className="font-mono"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          />
          <datalist id="upload-classes-list">
            {classNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field className="gap-1.5 sm:col-span-2">
          <FieldLabel htmlFor="upload-files" className={FIELD_LABEL}>
            Файли зображень
          </FieldLabel>
          <div className="flex h-9 items-center gap-3 rounded-md border border-input bg-inset px-0.5">
            <Button variant="outline" size="sm" className="h-7" onClick={() => filesRef.current?.click()}>
              Обрати файли
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {picked === 0 ? 'Файли не вибрано' : `Вибрано файлів: ${picked}`}
            </span>
          </div>
          <input
            id="upload-files"
            ref={filesRef}
            type="file"
            multiple
            accept="image/*"
            className="sr-only"
            onChange={(e) => setPicked(e.currentTarget.files?.length ?? 0)}
          />
        </Field>
      </FormGrid>
      {progress.total > 0 && <Progress value={progressValue(progress.done, progress.total)} className="h-1.5" />}
      <StatusText status={status} />
      <FileList summary="Відхилено" files={rejected} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Button disabled={busy} onClick={() => void upload()}>
          Завантажити
        </Button>
        <span className="text-xs text-faint">Надсилається пакетами по {UPLOAD_BATCH} файлів</span>
      </div>
    </Panel>
  );
}

// ---------- Generate ----------

function GenerateCard() {
  const { assets } = useAssets();
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('icons-32');
  const [size, setSize] = useState('32');
  const [parallel, setParallel] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [status, setStatus] = useState<Status | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const maxDone = useRef(0);

  useEffect(() => {
    if (!assets) return;
    const names = assets.groups.map((g) => g.name);
    setSource((prev) => (names.includes(prev) ? prev : names.includes('hq-4k') ? 'hq-4k' : (names[0] ?? '')));
  }, [assets]);

  const job = useJob('generate', {
    onBegin: () => {
      maxDone.current = 0;
      setProgress({ done: 0, total: 1 });
      setSkipped([]);
      setStatus({ text: 'Підготовка…' });
    },
    onCompleted: (e) => {
      const r = e.result as GenerateResult;
      setProgress((p) => ({ done: p.total, total: p.total }));
      setStatus({ text: `Згенеровано ${r.generated} зображень за ${formatMs(e.elapsedMs)}`, tone: 'success' });
      setSkipped(r.skippedFiles ?? []);
      void reloadAssets();
    },
    onFailed: (e) => {
      setStatus({ text: e.error === 'Скасовано' ? 'Скасовано.' : `Помилка: ${e.error}`, tone: 'error' });
      void reloadAssets();
    },
  });

  useHub({
    progress: (p) => {
      if (p.stage !== 'generate') return;
      maxDone.current = Math.max(maxDone.current, p.done);
      const total = Math.max(p.total, 1);
      setProgress({ done: Math.min(maxDone.current, total), total });
      setStatus({ text: `Оброблено ${maxDone.current} з ${p.total} (${percent(maxDone.current / total)})` });
    },
  });

  const start = async () => {
    const req = { source, target: target.trim(), size: Number(size), parallel };
    const fail = (text: string) => setStatus({ text, tone: 'error' });
    if (!req.source) return fail('Немає вихідної групи.');
    if (!req.target) return fail('Вкажіть цільову групу.');
    if (!Number.isInteger(req.size) || req.size < 1) return fail('Розмір має бути цілим числом ≥ 1.');
    if (req.source === req.target) return fail('Цільова група має відрізнятися від вихідної.');
    const error = await job.start(() => api.generate(req));
    if (error) fail(error);
  };

  const cancel = async () => {
    const error = await job.cancel();
    setStatus(error ? { text: error, tone: 'error' } : { text: 'Скасування…' });
  };

  return (
    <Panel title="Генерація групи" action={<Timer watch={job.watch} />} className="flex-1">
      <p className="text-xs text-muted-foreground">
        Зменшені копії всіх зображень вихідної групи зі збереженням структури класів.
      </p>
      <FormGrid>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="gen-source" className={FIELD_LABEL}>
            Вихідна група
          </FieldLabel>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="gen-source" className="w-full font-mono">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {assets?.groups.map((g) => (
                <SelectItem key={g.name} value={g.name} className="font-mono">
                  {g.name} ({count(groupTotal(g))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="gen-target" className={FIELD_LABEL}>
            Цільова група
          </FieldLabel>
          <Input
            id="gen-target"
            autoComplete="off"
            className="font-mono"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="gen-size" className={FIELD_LABEL}>
            Розмір, пікс.
          </FieldLabel>
          <Input
            id="gen-size"
            type="number"
            min={1}
            max={4096}
            step={1}
            className="font-mono"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Обробка</span>
          <Field orientation="horizontal" className="h-9 gap-2.5">
            <Checkbox id="gen-parallel" checked={parallel} onCheckedChange={(v) => setParallel(v === true)} />
            <FieldLabel htmlFor="gen-parallel" className="font-normal">
              Паралельно
            </FieldLabel>
          </Field>
        </div>
      </FormGrid>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!job.canStart} onClick={() => void start()}>
          Згенерувати
        </Button>
        <Button variant="outline" disabled={!job.canCancel} onClick={() => void cancel()}>
          Скасувати
        </Button>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Progress value={progressValue(progress.done, progress.total)} className="h-1.5" />
        <StatusText status={status ?? { text: 'Не запущено' }} className="text-xs" />
        <FileList summary="Пропущено файлів" files={skipped} />
      </div>
    </Panel>
  );
}
