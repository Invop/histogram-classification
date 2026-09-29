// «Розпізнавання»: model summary, export/import, single-image recognition with charts.
import { Download, ImageIcon, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { api, ApiError, type ModelInfo, type RecognitionResult } from '../api';
import { type BarSeries } from '../charts';
import { BarChartView, Panel, PAGE_GRID, StatusText, type Status } from '../components/common';
import { useModelVersion } from '../hooks';
import { notifyModelChanged } from '../state';
import { errorMessage, formatMs, percent } from '../util';

const NO_MODEL = 'Модель ще не навчена — перейдіть на вкладку «Навчання».';
const NO_DATA = 'Немає даних — оберіть зображення';
const BINS = Array.from({ length: 256 }, (_, i) => String(i));
const NONE: never[] = [];

interface Recognized {
  result: RecognitionResult;
  /** Index of the predicted class in `result.outputs`, -1 if absent. */
  predicted: number;
}

interface ModelState {
  info: ModelInfo | null;
  /** Shown instead of the summary when there is no model. */
  message: string;
}

function useModelInfo(): ModelState {
  const version = useModelVersion();
  const [state, setState] = useState<ModelState>({ info: null, message: 'Завантаження…' });
  useEffect(() => {
    let current = true;
    api.getModelInfo().then(
      (info) => current && setState({ info, message: '' }),
      (e: unknown) =>
        current &&
        setState({
          info: null,
          message: e instanceof ApiError && e.status === 404 ? NO_MODEL : `Не вдалося отримати модель: ${errorMessage(e)}`,
        }),
    );
    return () => {
      current = false;
    };
  }, [version]);
  return state;
}

function toSeries(values: number[] | undefined): BarSeries[] {
  return values ? [{ label: 'Y′', values }] : NONE;
}

export function RecognitionTab() {
  const model = useModelInfo();
  const [recognized, setRecognized] = useState<Recognized | null>(null);
  const result = recognized?.result;
  const histograms = useMemo(() => toSeries(result?.histogram), [result]);
  const partial = useMemo(() => toSeries(result?.partial), [result]);
  const x = 'X — яскравість 0…255';

  return (
    <div className={PAGE_GRID}>
      <ModelStrip model={model} />
      <ImagePanel onResult={setRecognized} />
      <ResultPanel classes={model.info?.classes ?? NONE} recognized={recognized} />
      <Panel
        title="Гістограма яскравості"
        action={<ChartMeta text={`${x} · Y — пікселів`} />}
        className="lg:col-span-6"
      >
        <BarChartView label="Гістограма" dense labels={result ? BINS : NONE} series={histograms} empty={NO_DATA} />
      </Panel>
      <Panel
        title="Неповна гістограма"
        action={<ChartMeta text={`${x} · Y — рівень 0…15`} />}
        className="lg:col-span-6"
      >
        <BarChartView label="Неповна гістограма" dense yMax={15} labels={result ? BINS : NONE} series={partial} empty={NO_DATA} />
      </Panel>
    </div>
  );
}

function ChartMeta({ text }: { text: string }) {
  return <span className="hidden text-xs text-faint sm:inline">{text}</span>;
}

// ---------- model ----------

function modelFacts(info: ModelInfo): Array<[string, string]> {
  const m = info.metadata;
  const n = (v: number) => v.toLocaleString('uk-UA');
  return [
    ['Класи', info.classes.join(' · ')],
    ['Групи', (m.groups ?? []).join(' · ') || '—'],
    ['Train / test', `${n(m.trainCount)} / ${n(m.testCount)}`],
    ['Епох', String(m.epochs)],
    ['η', String(m.learningRate)],
    m.testAccuracy === null || m.testAccuracy === undefined
      ? ['Точність train', percent(m.trainAccuracy)]
      : ['Точність test', percent(m.testAccuracy)],
  ];
}

function trainedAt(info: ModelInfo | null): string {
  const at = info?.metadata.trainedAt;
  return at ? new Date(at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function ModelStrip({ model }: { model: ModelState }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const exportModel = async () => {
    setExporting(true);
    try {
      const blob = await api.exportModel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'model.json';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ text: 'Збережено у model.json.', tone: 'success' });
    } catch (e) {
      setStatus({ text: e instanceof ApiError && e.status === 404 ? NO_MODEL : errorMessage(e), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const importModel = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus({ text: `Імпорт ${file.name}…` });
    try {
      const m = await api.importModel(await file.text());
      setStatus({ text: `Імпортовано: класи [${m.classes.join(', ')}].`, tone: 'success' });
      notifyModelChanged();
    } catch (e) {
      setStatus({ text: `Імпорт не вдався: ${errorMessage(e)}`, tone: 'error' });
    } finally {
      input.value = '';
      setImporting(false);
    }
  };

  return (
    <section
      aria-label="Модель"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card py-3 pr-3.5 pl-4 lg:col-span-12 lg:min-h-16"
    >
      <div className="mr-auto flex w-28 shrink-0 flex-col gap-1 xl:mr-0">
        <h2 className="text-sm leading-none font-semibold">Модель</h2>
        {trainedAt(model.info) && (
          <span className="font-mono text-[11px] leading-none text-faint tabular-nums" title="Коли навчено">
            {trainedAt(model.info)}
          </span>
        )}
      </div>
      {model.info ? (
        <dl className="order-last flex min-w-0 flex-1 basis-full flex-wrap gap-y-3 xl:order-none xl:basis-0">
          {modelFacts(model.info).map(([k, v]) => (
            <div key={k} className="flex shrink-0 flex-col gap-1 border-l px-5">
              <dt className="text-[11px] leading-none text-faint">{k}</dt>
              <dd className="font-mono text-sm leading-none tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="order-last min-w-0 flex-1 basis-full border-l px-5 text-sm text-muted-foreground xl:order-none xl:basis-0">{model.message}</p>
      )}
      <StatusText status={status} className="text-xs" />
      <div className="flex gap-2">
        <Button variant="outline" disabled={!model.info || exporting} onClick={() => void exportModel()}>
          <Download />
          Експорт
        </Button>
        <Button variant="outline" disabled={importing} onClick={() => importRef.current?.click()}>
          <Upload />
          Імпорт
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void importModel(e.currentTarget)}
        />
      </div>
    </section>
  );
}

// ---------- image ----------

function ImagePanel({ onResult }: { onResult: (r: Recognized) => void }) {
  const [preview, setPreview] = useState<{ url: string; name: string; size?: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview.url)), [preview]);

  const recognize = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus({ text: `${file.name}: це не зображення.`, tone: 'error' });
      return;
    }
    const my = ++seq.current;
    setPreview({ url: URL.createObjectURL(file), name: file.name });
    setStatus({ text: 'Розпізнавання…' });
    try {
      const r = await api.recognize(file);
      if (my !== seq.current) return;
      setStatus(null);
      onResult({ result: r, predicted: r.outputs.findIndex((o) => o.className === r.predicted) });
    } catch (e) {
      if (my !== seq.current) return;
      setStatus({ text: e instanceof ApiError && e.status === 404 ? NO_MODEL : errorMessage(e), tone: 'error' });
    }
  };

  const pick = () => fileRef.current?.click();

  const drop = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void recognize(e.dataTransfer.files[0]);
    },
  };

  return (
    <Panel
      title="Зображення"
      action={
        preview && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={pick}>
            <Upload />
            Інший файл
          </Button>
        )
      }
      className="lg:col-span-5"
      bodyClassName="gap-3"
    >
      <input
        ref={fileRef}
        id="recognize-file"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void recognize(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      {preview ? (
        <div
          {...drop}
          className={cn(
            'flex min-h-56 flex-1 items-center justify-center rounded-md border border-hairline bg-inset p-2',
            dragging && 'border-ring',
          )}
        >
          <img
            src={preview.url}
            alt={preview.name}
            className="block max-h-64 max-w-full rounded-sm object-contain"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              setPreview((p) => (p && p.url === preview.url ? { ...p, size: `${w}×${h}` } : p));
            }}
          />
        </div>
      ) : (
        <div
          {...drop}
          className={cn(
            'flex min-h-56 flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-input bg-inset p-4 text-center',
            dragging && 'border-ring bg-muted',
          )}
        >
          <ImageIcon className="size-6 text-faint" strokeWidth={1.5} aria-hidden />
          <span className="text-sm text-muted-foreground">Перетягніть зображення сюди або</span>
          <Button variant="outline" onClick={pick}>
            Обрати файл
          </Button>
        </div>
      )}
      <div className="flex min-h-5 items-baseline justify-between gap-4 font-mono text-xs text-muted-foreground">
        <span className="truncate">{preview?.name ?? 'Файл не вибрано'}</span>
        <span className="shrink-0 tabular-nums">{preview?.size ?? ''}</span>
      </div>
      <StatusText status={status} />
    </Panel>
  );
}

// ---------- result ----------

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 p-4', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-3xl leading-10 font-semibold tracking-tight">{children}</span>
    </div>
  );
}

const DASH = <span className="text-chart-4">—</span>;

function ResultPanel({ classes, recognized }: { classes: readonly string[]; recognized: Recognized | null }) {
  const r = recognized?.result;
  const top = r && recognized.predicted >= 0 ? r.outputs[recognized.predicted] : undefined;
  const [time, unit] = r ? formatMs(r.elapsedMs).split(' ') : [];
  const rows = r
    ? r.outputs.map((o, i) => ({ name: o.className, value: o.value, hit: i === recognized.predicted }))
    : classes.map((name) => ({ name, value: null, hit: false }));

  return (
    <Panel title="Результат" className="lg:col-span-7" bodyClassName="gap-0 p-0">
      <div className="grid grid-cols-3 border-b border-hairline">
        <Stat label="Клас">{r ? <span className="text-chart-1">{r.predicted}</span> : DASH}</Stat>
        <Stat label="Вихід нейрона" className="border-l border-hairline">
          {top ? <span className="font-mono font-normal tabular-nums">{top.value.toFixed(2)}</span> : DASH}
        </Stat>
        <Stat label="Час" className="border-l border-hairline">
          {r ? (
            <span className="font-mono font-normal tabular-nums">
              {time}
              <span className="text-base text-muted-foreground"> {unit}</span>
            </span>
          ) : (
            DASH
          )}
        </Stat>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <span className="text-xs text-muted-foreground">Виходи нейронів</span>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Класи зʼявляться після навчання моделі.</p>
        ) : (
          <>
            {rows.map((o) => (
              <div key={o.name} className="grid h-5 grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-x-4">
                <span className={cn('truncate text-sm', o.hit ? 'text-foreground' : 'text-muted-foreground')}>{o.name}</span>
                <div className="h-2 overflow-hidden rounded-xs bg-muted">
                  {o.value !== null && (
                    <div
                      className={cn('h-full', o.hit ? 'bg-chart-1' : 'bg-chart-4')}
                      style={{ width: `${Math.max(0, Math.min(1, o.value)) * 100}%` }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'text-right font-mono text-sm tabular-nums',
                    o.hit ? 'text-foreground' : o.value === null ? 'text-faint' : 'text-muted-foreground',
                  )}
                >
                  {o.value === null ? '—' : o.value.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_3rem] gap-x-4" aria-hidden>
              <span />
              <div className="flex justify-between font-mono text-[11px] text-faint">
                <span>0</span>
                <span>0.25</span>
                <span>0.5</span>
                <span>0.75</span>
                <span>1</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
