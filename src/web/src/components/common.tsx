// Small app-level building blocks on top of shadcn/ui.
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { barChart, setBars, type BarChartOptions, type BarSeries } from '../charts';
import { drawWeights, maxAbsWeight, weightColor, type HeatmapPalette } from '../heatmap';
import { useChart, useThemeVersion } from '../hooks';
import type { Stopwatch } from '../stopwatch';
import { themeRgb } from '../theme';
import { formatMs } from '../util';

/** Page layout: one column on narrow screens, a 12-column grid from `lg`. Children set `lg:col-span-*`. */
export const PAGE_GRID = 'grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12';

/** Caption above an input (the input's own <label>). */
export const FIELD_LABEL = 'mb-0 text-xs font-normal text-muted-foreground';

export type Tone = 'muted' | 'success' | 'error';

export interface Status {
  text: string;
  tone?: Tone;
}

const TONE: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  success: 'text-success',
  error: 'text-destructive',
};

/** Live status line; renders nothing visible while empty. */
export function StatusText({ status, className }: { status: Status | null; className?: string }) {
  return (
    <p aria-live="polite" className={cn('text-sm tabular-nums empty:hidden', TONE[status?.tone ?? 'muted'], className)}>
      {status?.text}
    </p>
  );
}

/** Bordered panel with a fixed-height title bar; the body is a flex column. */
export function Panel({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground', className)}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline pr-2 pl-4">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {action && <div className="flex shrink-0 items-center gap-2 pr-2">{action}</div>}
      </header>
      <div className={cn('flex flex-1 flex-col gap-4 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Collapsible list of file names (e.g. skipped or rejected files). */
export function FileList({ summary, files }: { summary: string; files: readonly string[] }) {
  if (files.length === 0) return null;
  const shown = files.slice(0, 500);
  return (
    <Collapsible className="text-sm text-muted-foreground">
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
        {summary}: {files.length}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 max-h-40 list-disc overflow-auto rounded-md border bg-inset py-1 pr-2 pl-7 font-mono text-xs break-all">
          {shown.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
          {files.length > shown.length && <li>… і ще {files.length - shown.length}</li>}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Timer({ watch }: { watch: Stopwatch }) {
  const ms = useSyncExternalStore(watch.subscribe, watch.getSnapshot);
  return (
    <span className="font-mono text-sm text-muted-foreground tabular-nums" title="Тривалість операції">
      {ms === null ? '—' : formatMs(ms)}
    </span>
  );
}

/** A number right-aligned in the width of `max` (monospace digits), so a changing value does not shift the text around it. */
export function Fixed({ value, max }: { value: ReactNode; max: string | number }) {
  return (
    <span className="inline-block text-right" style={{ minWidth: `${String(max).length}ch` }}>
      {value}
    </span>
  );
}

/** Label on the left, numbers on the right, bar below. `value` is 0..100. */
export function LabeledProgress({
  id,
  label,
  detail,
  value,
  muted,
}: {
  id: string;
  label: string;
  detail: ReactNode;
  value: number;
  /** Finished / secondary stage: neutral bar colour. */
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label id={`${id}-label`} className="text-sm">
          {label}
        </label>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">{detail}</span>
      </div>
      <Progress
        id={id}
        aria-labelledby={`${id}-label`}
        value={value}
        className={cn('h-1.5', muted && '*:data-[slot=progress-indicator]:bg-chart-4')}
      />
    </div>
  );
}

/** Fixed-height box for a responsive Chart.js canvas; `empty` overlays a placeholder message. */
export function ChartBox({ children, empty, className }: { children: ReactNode; empty?: string; className?: string }) {
  return (
    <div className={cn('relative h-56 w-full min-w-0', className)}>
      {children}
      {empty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-faint">
          <span className="bg-card px-2">{empty}</span>
        </p>
      )}
    </div>
  );
}

export interface BarChartViewProps extends BarChartOptions {
  label: string;
  labels: string[];
  series: BarSeries[];
  highlight?: number;
  empty?: string;
  className?: string;
}

export function BarChartView({ label, labels, series, highlight = -1, empty, className, ...options }: BarChartViewProps) {
  const [canvasRef, chartRef] = useChart((canvas) => barChart(canvas, options));
  useEffect(() => {
    if (chartRef.current) setBars(chartRef.current, labels, series, highlight);
  }, [chartRef, labels, series, highlight]);
  return (
    <ChartBox empty={series.length === 0 ? empty : undefined} className={className}>
      <canvas ref={canvasRef} aria-label={label} />
    </ChartBox>
  );
}

// ---------- weight heatmaps ----------

function usePalette(): HeatmapPalette {
  const theme = useThemeVersion();
  return useMemo(
    () => ({
      base: themeRgb('--muted', '#eeeeee'),
      positive: themeRgb('--chart-1', '#2f6fe0'),
      negative: themeRgb('--chart-3', '#d0453a'),
    }),
    // theme tokens are read inside, so recompute when the theme changes
    [theme],
  );
}

/** −1…+1 colour scale for the heatmaps. */
export function HeatmapLegend() {
  const palette = usePalette();
  const steps = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2 font-mono text-xs text-faint" aria-label="Шкала ваг: від −max до +max">
      <span>−max</span>
      <div className="flex h-2 overflow-hidden rounded-sm">
        {steps.map((s) => (
          <span key={s} className="w-3.5" style={{ background: `rgb(${weightColor(s, palette).join(',')})` }} />
        ))}
      </div>
      <span>+max</span>
    </div>
  );
}

function HeatmapCanvas({ label, row, maxAbs, palette }: { label: string; row: readonly number[]; maxAbs: number; palette: HeatmapPalette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawWeights(ref.current, row, maxAbs, palette);
  }, [row, maxAbs, palette]);
  return (
    <canvas ref={ref} role="img" aria-label={label} className="aspect-square w-full rounded-sm [image-rendering:pixelated]" />
  );
}

function Heatmap({ name, row, maxAbs, palette }: { name: string; row: readonly number[]; maxAbs: number; palette: HeatmapPalette }) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const w of row) {
    lo = Math.min(lo, w);
    hi = Math.max(hi, w);
  }
  const range = row.length ? `min ${lo.toFixed(2).replace('-', '−')} · max ${hi.toFixed(2).replace('-', '−')}` : '';
  return (
    <Panel
      title={<span className="font-mono">{name}</span>}
      action={<span className="font-mono text-xs text-faint tabular-nums">{range}</span>}
      className="lg:col-span-4"
      bodyClassName="items-center justify-center"
    >
      <div className="w-full max-w-64">
        <HeatmapCanvas label={`Ваги класу ${name}`} row={row} maxAbs={maxAbs} palette={palette} />
      </div>
    </Panel>
  );
}

/** One panel per class (32×32), for a PAGE_GRID parent; intensity = |w| / max|w| over all classes. */
export function WeightHeatmaps({ classes, weights }: { classes: readonly string[]; weights: readonly number[][] }) {
  const palette = usePalette();
  if (classes.length === 0 || weights.length === 0) {
    return <p className="text-sm text-muted-foreground lg:col-span-12">Немає ваг для відображення.</p>;
  }
  const maxAbs = maxAbsWeight(weights);
  return weights.map((row, k) => (
    <Heatmap key={k} name={classes[k] ?? `#${k}`} row={row} maxAbs={maxAbs} palette={palette} />
  ));
}

/** Two equal columns of fields (one on narrow screens). */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">{children}</div>;
}
