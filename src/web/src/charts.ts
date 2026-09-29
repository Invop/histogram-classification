// Chart.js helpers. Colours come from shadcn/ui theme tokens so light/dark themes stay in sync.
import { Chart, registerables, type Point } from 'chart.js';
import type { EpochMetrics } from './hub';
import { onThemeChange, themeColor } from './theme';

Chart.register(...registerables);

const MONO = "'Geist Mono Variable', ui-monospace, monospace";

const restylers = new Map<Chart, () => void>();

function applyDefaults(): void {
  Chart.defaults.color = themeColor('--faint', '#666');
  Chart.defaults.borderColor = themeColor('--hairline', '#ddd');
  Chart.defaults.font.family = MONO;
  Chart.defaults.font.size = 11;
}

applyDefaults();

onThemeChange(() => {
  applyDefaults();
  for (const [chart, restyle] of restylers) {
    restyle();
    chart.update('none');
  }
});

function track(chart: Chart, restyle: () => void): void {
  restyle();
  restylers.set(chart, restyle);
}

/** Destroy a chart created by this module and stop restyling it on theme changes. */
export function disposeChart(chart: Chart): void {
  restylers.delete(chart);
  chart.destroy();
}

function scaleColors(chart: Chart): void {
  const grid = themeColor('--hairline', '#ddd');
  const axis = themeColor('--chart-4', '#999');
  const faint = themeColor('--faint', '#666');
  for (const scale of Object.values(chart.options.scales ?? {})) {
    if (!scale) continue;
    if ('grid' in scale && scale.grid) scale.grid.color = grid;
    if ('border' in scale && scale.border) scale.border.color = axis;
    if ('ticks' in scale && scale.ticks) scale.ticks.color = faint;
  }
}

// ---------- bar charts ----------

export interface BarChartOptions {
  yMax?: number;
  /** Dense charts (256 bins): no gaps, x ticks at 0, 64, 128, 192, 255. */
  dense?: boolean;
}

export type BarChart = Chart<'bar', number[], string>;

/** One dataset of a bar chart; without `color` it uses the accent colour. */
export interface BarSeries {
  label: string;
  values: number[];
  color?: string;
}

const highlight = new WeakMap<BarChart, number>();

export function barChart(canvas: HTMLCanvasElement, opts: BarChartOptions = {}): BarChart {
  const chart: BarChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { intersect: false, mode: 'index' },
      },
      datasets: {
        // several series (R, G, B) are drawn on top of each other, not side by side
        bar: opts.dense ? { categoryPercentage: 1, barPercentage: 1, grouped: false } : { maxBarThickness: 64 },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: true },
          ticks: opts.dense
            ? { autoSkip: false, maxRotation: 0, callback: (_, i) => (i % 64 === 0 || i === 255 ? String(i) : null) }
            : { autoSkip: false },
        },
        y: {
          beginAtZero: true,
          min: 0,
          max: opts.yMax,
          border: { display: false },
          ticks: { maxTicksLimit: 4, padding: 8 },
        },
      },
    },
  });
  track(chart, () => {
    scaleColors(chart);
    colorBars(chart);
  });
  return chart;
}

const seriesColors = new WeakMap<BarChart, (string | undefined)[]>();

function colorBars(chart: BarChart): void {
  const accent = themeColor('--chart-1', '#3b5bdb');
  const ok = themeColor('--chart-2', '#c9812f');
  const idx = highlight.get(chart) ?? -1;
  const colors = seriesColors.get(chart) ?? [];
  chart.data.datasets.forEach((ds, i) => {
    const base = colors[i] ?? accent;
    ds.backgroundColor = idx < 0 ? base : ds.data.map((_, j) => (j === idx ? ok : base));
  });
}

/** Replace bar data; optionally highlight one bar (e.g. the predicted class). */
export function setBars(chart: BarChart, labels: string[], series: BarSeries[], highlightIndex = -1): void {
  chart.data.labels = labels;
  chart.data.datasets = series.map((s) => ({ label: s.label, data: s.values, borderWidth: 0 }));
  seriesColors.set(chart, series.map((s) => s.color));
  highlight.set(chart, highlightIndex);
  colorBars(chart);
  chart.update();
}

// ---------- training metrics chart ----------

export type MetricsChart = Chart<'line', Point[], number>;

/** Series of the metrics chart in dataset order; the page draws the legend from this. */
export const METRIC_SERIES = [
  { label: 'MSE', token: '--chart-1', dashed: false },
  { label: 'Точність train', token: '--chart-2', dashed: false },
  { label: 'Точність test', token: '--chart-2', dashed: true },
] as const;

export function metricsChart(canvas: HTMLCanvasElement): MetricsChart {
  const line = { data: [], borderWidth: 1.5, pointRadius: 0, tension: 0.2 };
  const chart: MetricsChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: METRIC_SERIES.map((s, i) => ({
        ...line,
        data: [],
        label: s.label,
        yAxisID: i === 0 ? 'y' : 'y1',
        borderDash: s.dashed ? [4, 3] : undefined,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'linear',
          min: 1,
          grid: { display: false },
          ticks: { precision: 0, maxRotation: 0 },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          border: { display: false },
          ticks: { maxTicksLimit: 5, padding: 8 },
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 1,
          border: { display: false },
          grid: { drawOnChartArea: false },
          ticks: { maxTicksLimit: 5, padding: 8, callback: (v) => `${Math.round(Number(v) * 100)}%` },
        },
      },
    },
  });
  track(chart, () => {
    scaleColors(chart);
    chart.data.datasets.forEach((ds, i) => {
      const color = themeColor(METRIC_SERIES[i].token, '#888');
      ds.borderColor = color;
      ds.backgroundColor = color;
    });
  });
  return chart;
}

export function resetMetrics(chart: MetricsChart, totalEpochs?: number): void {
  chart.data.datasets.forEach((ds) => (ds.data = []));
  const x = chart.options.scales?.x;
  if (x) x.max = totalEpochs;
  chart.update('none');
}

function appendPoint(chart: MetricsChart, m: EpochMetrics): void {
  const [loss, train, test] = chart.data.datasets;
  loss.data.push({ x: m.epoch, y: m.loss });
  train.data.push({ x: m.epoch, y: m.trainAccuracy });
  if (m.testAccuracy !== null && m.testAccuracy !== undefined) test.data.push({ x: m.epoch, y: m.testAccuracy });
}

/** Append one (throttled) epoch sample. */
export function pushEpoch(chart: MetricsChart, m: EpochMetrics): void {
  const x = chart.options.scales?.x;
  if (x && x.max === undefined) x.max = m.totalEpochs;
  const last = chart.data.datasets[0].data.at(-1);
  if (last && (last.x ?? 0) >= m.epoch) return; // duplicate / out-of-order sample
  appendPoint(chart, m);
  chart.update('none');
}

/** Replace the chart contents with the full training history. */
export function setHistory(chart: MetricsChart, history: readonly EpochMetrics[]): void {
  chart.data.datasets.forEach((ds) => (ds.data = []));
  const sorted = [...history].sort((a, b) => a.epoch - b.epoch);
  for (const m of sorted) appendPoint(chart, m);
  const x = chart.options.scales?.x;
  if (x) x.max = sorted.at(-1)?.totalEpochs ?? sorted.at(-1)?.epoch;
  chart.update('none');
}
