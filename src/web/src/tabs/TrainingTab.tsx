// «Навчання»: group selection, parameters, live progress, metrics chart, weight heatmaps.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, ApiError, type AssetsInfo, type ModelWeights } from '../api';
import { METRIC_SERIES, metricsChart, pushEpoch, resetMetrics, setHistory } from '../charts';
import {
  ChartBox,
  FIELD_LABEL,
  FileList,
  Fixed,
  FormGrid,
  HeatmapLegend,
  LabeledProgress,
  PAGE_GRID,
  Panel,
  StatusText,
  Timer,
  WeightHeatmaps,
  type Status,
} from '../components/common';
import { useAssets, useChart, useHub, useJob, useModelVersion } from '../hooks';
import type { EpochMetrics, TrainingResult } from '../hub';
import { notifyModelChanged } from '../state';
import { errorMessage, formatMs, percent, progressValue } from '../util';

export function TrainingTab() {
  return (
    <div className={PAGE_GRID}>
      <TrainingJob />
      <Weights />
    </div>
  );
}

// ---------- group selection ----------

/** Group checkboxes: everything selected at first; groups that appear later follow the "all" state. */
function useGroupSelection(assets: AssetsInfo | null) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const known = useRef<string[]>([]);
  const lastAssets = useRef<AssetsInfo | null>(null);

  useEffect(() => {
    if (!assets || assets === lastAssets.current) return;
    lastAssets.current = assets;
    const names = assets.groups.map((g) => g.name);
    const prevKnown = known.current;
    known.current = names;
    setSelected((prev) => {
      // no groups known yet (first load or empty catalogue) counts as "all selected"
      const wasAll = prevKnown.every((g) => prev.has(g));
      const next = new Set([...prev].filter((s) => names.includes(s)));
      for (const name of names) if (wasAll && !prevKnown.includes(name)) next.add(name);
      return next;
    });
  }, [assets]);

  const names = assets?.groups.map((g) => g.name) ?? [];
  const list = names.filter((g) => selected.has(g));
  const all: boolean | 'indeterminate' =
    names.length > 0 && list.length === names.length ? true : list.length > 0 ? 'indeterminate' : false;

  const toggle = (name: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  const setAll = (on: boolean) => setSelected(new Set(on ? names : []));

  return { selected, list, all, toggle, setAll };
}

// ---------- training job ----------

interface Form {
  limit: string;
  epochs: string;
  lr: string;
  test: string;
  seed: string;
  parallel: boolean;
}

interface Bars {
  featuresText: ReactNode;
  featuresValue: number;
  epochsText: ReactNode;
  epochsValue: number;
}

const IDLE_BARS: Bars = { featuresText: '—', featuresValue: 0, epochsText: '—', epochsValue: 0 };

interface Summary extends Status {
  skipped: string[];
}

function metricsLine(m: EpochMetrics): ReactNode {
  const test = m.testAccuracy === null || m.testAccuracy === undefined ? '—' : percent(m.testAccuracy);
  return (
    <>
      Епоха <Fixed value={m.epoch} max={Math.max(m.totalEpochs, m.epoch)} />: MSE {m.loss.toFixed(4)} · точність train{' '}
      <Fixed value={percent(m.trainAccuracy)} max="100.0%" /> · test <Fixed value={test} max="100.0%" />
    </>
  );
}

function TrainingJob() {
  const { assets } = useAssets();
  const groups = useGroupSelection(assets);
  const [form, setForm] = useState<Form>({
    limit: '0',
    epochs: '200',
    lr: '0.1',
    test: '0.2',
    seed: '42',
    parallel: true,
  });
  const [error, setError] = useState('');
  const [bars, setBars] = useState<Bars>(IDLE_BARS);
  const [metrics, setMetrics] = useState<ReactNode>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canvasRef, chartRef] = useChart(metricsChart);

  // progress state (per job)
  const p = useRef({
    featuresDone: 0,
    featuresTotal: 1,
    totalEpochs: 0,
    completedEpochs: 0, // epochs known to be finished
    inEpochMax: 0, // max samples done within the current epoch
    inEpochTotal: 0,
    shownEpochValue: 0, // monotonic value of the epoch bar (in epochs)
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const renderEpochBar = () => {
    const s = p.current;
    if (s.totalEpochs <= 0) return;
    const frac = s.inEpochTotal > 0 ? Math.min(1, s.inEpochMax / s.inEpochTotal) : 0;
    const value = Math.min(s.totalEpochs, s.completedEpochs + frac);
    s.shownEpochValue = Math.max(s.shownEpochValue, value);
    const current = Math.min(s.totalEpochs, s.completedEpochs + (s.completedEpochs < s.totalEpochs && frac > 0 ? 1 : 0));
    // every part keeps its width (padded to its maximum) so the line does not jump while numbers change
    const epochsText = (
      <>
        епоха <Fixed value={Math.max(current, 1)} max={s.totalEpochs} /> / {s.totalEpochs}
        {' · '}
        <Fixed value={percent(s.shownEpochValue / s.totalEpochs, 0)} max="100%" />
      </>
    );
    setBars((b) => ({ ...b, epochsText, epochsValue: progressValue(s.shownEpochValue, s.totalEpochs) }));
  };

  const job = useJob('training', {
    onBegin: () => {
      const totalEpochs = Math.max(0, Math.floor(Number(form.epochs))) || 0;
      p.current = {
        featuresDone: 0,
        featuresTotal: 1,
        totalEpochs,
        completedEpochs: 0,
        inEpochMax: 0,
        inEpochTotal: 0,
        shownEpochValue: 0,
      };
      setBars({ featuresText: 'підготовка…', featuresValue: 0, epochsText: 'очікування…', epochsValue: 0 });
      setMetrics(null);
      setSummary(null);
      setError('');
      if (chartRef.current) resetMetrics(chartRef.current, totalEpochs || undefined);
    },
    onCompleted: (e) => {
      const r = e.result as TrainingResult;
      const s = p.current;
      setBars((b) => ({ ...b, featuresValue: 100 }));
      const history = r.history ?? [];
      const last = history.at(-1);
      if (last) {
        s.totalEpochs = last.totalEpochs || s.totalEpochs;
        s.completedEpochs = s.totalEpochs;
        renderEpochBar();
        setMetrics(metricsLine(last));
      } else {
        setBars((b) => ({ ...b, epochsValue: 100 }));
      }
      if (chartRef.current) setHistory(chartRef.current, history);

      const t = (stage: string) => r.timings?.find((x) => x.stage === stage)?.elapsedMs;
      const feat = t('features');
      const train = t('training');
      setSummary({
        text:
          `Готово за ${formatMs(e.elapsedMs)} — ознаки: ${feat === undefined ? '—' : formatMs(feat)}, ` +
          `навчання: ${train === undefined ? '—' : formatMs(train)}; train ${r.trainCount}, test ${r.testCount}` +
          `; пропущено файлів: ${r.skippedFiles?.length ?? 0}`,
        tone: 'success',
        skipped: r.skippedFiles ?? [],
      });
      notifyModelChanged();
    },
    onFailed: (e) => {
      setSummary({
        text: e.error === 'Скасовано' ? 'Навчання скасовано.' : `Помилка: ${e.error}`,
        tone: 'error',
        skipped: [],
      });
    },
  });

  useHub({
    progress: (ev) => {
      const s = p.current;
      if (ev.stage === 'features') {
        s.featuresDone = Math.max(s.featuresDone, ev.done);
        const total = Math.max(ev.total, 1);
        s.featuresTotal = total;
        setBars((b) => ({
          ...b,
          featuresValue: progressValue(Math.min(s.featuresDone, total), total),
          featuresText: (
            <>
              <Fixed value={s.featuresDone} max={ev.total} /> / {ev.total} ·{' '}
              <Fixed value={percent(s.featuresDone / total, 0)} max="100%" />
            </>
          ),
        }));
      } else if (ev.stage === 'epoch') {
        // feature extraction is over once epochs start
        setBars((b) => (b.featuresValue < 100 ? { ...b, featuresValue: 100 } : b));
        // a drop in "done" means a new epoch has started (events are throttled)
        if (ev.done < s.inEpochMax) {
          s.completedEpochs = Math.min(s.totalEpochs || Infinity, s.completedEpochs + 1);
        }
        s.inEpochMax = ev.done;
        s.inEpochTotal = ev.total;
        renderEpochBar();
      }
    },
    epoch: (m) => {
      const s = p.current;
      if (m.totalEpochs > 0) s.totalEpochs = m.totalEpochs;
      if (m.epoch > s.completedEpochs) {
        s.completedEpochs = m.epoch;
        s.inEpochMax = 0; // next epoch starts from scratch
      }
      renderEpochBar();
      setMetrics(metricsLine(m));
      if (chartRef.current) pushEpoch(chartRef.current, m);
    },
  });

  const start = async () => {
    setError('');
    const req = {
      groups: groups.list,
      perClassLimit: Math.floor(Number(form.limit)),
      epochs: Math.floor(Number(form.epochs)),
      learningRate: Number(form.lr),
      testFraction: Number(form.test),
      seed: Math.floor(Number(form.seed)),
      parallel: form.parallel,
    };
    if (req.groups.length === 0) return setError('Оберіть хоча б одну групу.');
    if (!(req.epochs >= 1)) return setError('Кількість епох має бути ≥ 1.');
    if (!(req.learningRate > 0)) return setError('Швидкість навчання має бути > 0.');
    if (!(req.testFraction >= 0 && req.testFraction < 1)) return setError('Частка тесту має бути в межах [0; 1).');
    if (!(req.perClassLimit >= 0)) return setError('Ліміт на клас має бути ≥ 0.');
    if (!Number.isFinite(req.seed)) return setError('Некоректний seed.');
    const err = await job.start(() => api.train(req));
    if (err) setError(err);
  };

  const cancel = async () => {
    const err = await job.cancel();
    if (err) setError(err);
    else setMetrics('Скасування…');
  };

  const numberField = (key: Exclude<keyof Form, 'parallel'>, label: string, attrs: { min?: number; max?: number; step: number }) => (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={`train-${key}`} className={FIELD_LABEL}>
        {label}
      </FieldLabel>
      <Input
        id={`train-${key}`}
        type="number"
        className="font-mono"
        {...attrs}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  const featuresDone = bars.featuresValue >= 100;

  return (
    <>
      <Panel title="Параметри навчання" className="lg:col-span-4" bodyClassName="gap-5">
        <FieldSet className="gap-2">
          <FieldLegend variant="label" className={FIELD_LABEL + ' mb-1'}>
            Групи зображень
          </FieldLegend>
          <div className="flex flex-col gap-2.5 rounded-md border border-hairline bg-inset p-3">
            <Field orientation="horizontal" className="gap-2.5">
              <Checkbox
                id="train-all"
                checked={groups.all}
                disabled={!assets || assets.groups.length === 0}
                onCheckedChange={(v) => groups.setAll(v === true)}
              />
              <FieldLabel htmlFor="train-all" className="flex-1">
                Уся папка Assets
              </FieldLabel>
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                {assets ? assetsTotal(assets).toLocaleString('uk-UA') : ''}
              </span>
            </Field>
            <div className="h-px bg-hairline" />
            {!assets ? (
              <p className="text-sm text-muted-foreground">Завантаження…</p>
            ) : assets.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Немає груп. Додайте зображення на вкладці «Дані».</p>
            ) : (
              assets.groups.map((g) => (
                <Field key={g.name} orientation="horizontal" className="gap-2.5">
                  <Checkbox
                    id={`train-group-${g.name}`}
                    checked={groups.selected.has(g.name)}
                    onCheckedChange={(v) => groups.toggle(g.name, v === true)}
                  />
                  <FieldLabel htmlFor={`train-group-${g.name}`} className="min-w-0 flex-1 font-mono font-normal break-all">
                    {g.name}
                  </FieldLabel>
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">
                    {g.classes.reduce((sum, c) => sum + c.count, 0).toLocaleString('uk-UA')}
                  </span>
                </Field>
              ))
            )}
          </div>
        </FieldSet>
        <FormGrid>
          {numberField('limit', 'Ліміт на клас (0 = всі)', { min: 0, step: 1 })}
          {numberField('epochs', 'Епохи', { min: 1, step: 1 })}
          {numberField('lr', 'Швидкість навчання η', { min: 0, step: 0.01 })}
          {numberField('test', 'Частка тесту', { min: 0, max: 0.9, step: 0.05 })}
          {numberField('seed', 'Seed', { step: 1 })}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Витяг ознак</span>
            <Field orientation="horizontal" className="h-9 gap-2.5">
              <Checkbox id="train-parallel" checked={form.parallel} onCheckedChange={(v) => set('parallel', v === true)} />
              <FieldLabel htmlFor="train-parallel" className="font-normal">
                Паралельно
              </FieldLabel>
            </Field>
          </div>
        </FormGrid>
        <StatusText status={error ? { text: error, tone: 'error' } : null} />
        <div className="mt-auto flex flex-wrap gap-2">
          <Button disabled={!job.canStart} onClick={() => void start()}>
            Навчити
          </Button>
          <Button variant="outline" disabled={!job.canCancel} onClick={() => void cancel()}>
            Скасувати
          </Button>
        </div>
      </Panel>

      <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
        <Panel title="Прогрес" action={<Timer watch={job.watch} />}>
          <LabeledProgress
            id="features-progress"
            label="Ознаки"
            detail={bars.featuresText}
            value={bars.featuresValue}
            muted={featuresDone}
          />
          <LabeledProgress id="epochs-progress" label="Навчання" detail={bars.epochsText} value={bars.epochsValue} />
          {metrics && <p className="font-mono text-xs text-muted-foreground tabular-nums">{metrics}</p>}
          {summary && (
            <div className="flex flex-col gap-1.5">
              <StatusText status={summary} />
              <FileList summary="Пропущені файли" files={summary.skipped} />
            </div>
          )}
        </Panel>

        <Panel title="MSE і точність по епохах" action={<MetricsLegend />} className="flex-1">
          <ChartBox className="h-auto min-h-56 flex-1">
            <canvas ref={canvasRef} aria-label="Графік MSE і точності" />
          </ChartBox>
        </Panel>
      </div>
    </>
  );
}

function assetsTotal(assets: AssetsInfo): number {
  return assets.groups.reduce((sum, g) => sum + g.classes.reduce((s, c) => s + c.count, 0), 0);
}

function MetricsLegend() {
  return (
    <div className="hidden items-center gap-5 text-xs text-muted-foreground sm:flex">
      {METRIC_SERIES.map((s) => (
        <span key={s.label} className="flex items-center gap-2">
          <span
            className="w-4 border-t-2"
            style={{ borderColor: `var(${s.token})`, borderTopStyle: s.dashed ? 'dashed' : 'solid' }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ---------- weight heatmaps ----------

function Weights() {
  const version = useModelVersion();
  const [weights, setWeights] = useState<ModelWeights | null>(null);
  const [message, setMessage] = useState('Модель ще не навчена.');

  useEffect(() => {
    let current = true;
    api.getWeights().then(
      (w) => {
        if (!current) return;
        setWeights(w);
      },
      (e: unknown) => {
        if (!current) return;
        setWeights(null);
        setMessage(
          e instanceof ApiError && e.status === 404
            ? 'Модель ще не навчена.'
            : `Не вдалося завантажити ваги: ${errorMessage(e)}`,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [version]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 lg:col-span-12">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Ваги нейронів</h2>
          <p className="text-xs text-muted-foreground">
            1024 ваги кожного нейрона як зображення 32×32
          </p>
        </div>
        {weights && <HeatmapLegend />}
      </div>
      {weights ? (
        <WeightHeatmaps classes={weights.classes} weights={weights.weights} />
      ) : (
        <p className="text-sm text-muted-foreground lg:col-span-12">{message}</p>
      )}
    </>
  );
}
