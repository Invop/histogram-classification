// Chart.js helpers. Colours come from CSS custom properties so light/dark themes stay in sync.
import { Chart, registerables, type Point } from 'chart.js';
import type { EpochMetrics } from './hub';
import { cssVar } from './util';

Chart.register(...registerables);

const restylers = new Map<Chart, () => void>();

function applyDefaults(): void {
  Chart.defaults.color = cssVar('--muted', '#666');
  Chart.defaults.borderColor = cssVar('--grid', cssVar('--border', '#ddd'));
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
}

applyDefaults();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
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

function scaleColors(chart: Chart): void {
  const grid = cssVar('--grid', cssVar('--border', '#ddd'));
  const muted = cssVar('--muted', '#666');
  for (const scale of Object.values(chart.options.scales ?? {})) {
    if (!scale) continue;
    if ('grid' in scale && scale.grid) scale.grid.color = grid;
    if ('ticks' in scale && scale.ticks) scale.ticks.color = muted;
    if ('title' in scale && scale.title) scale.title.color = muted;
  }
  const legend = chart.options.plugins?.legend;
  if (legend?.labels) legend.labels.color = cssVar('--text', '#222');
}

// ---------- bar charts ----------

export interface BarChartOptions {
  yMax?: number;
  yLabel?: string;
  /** Dense charts (e.g. 256 bins): no gaps, sparse x ticks. */
  dense?: boolean;
}

export type BarChart = Chart<'bar', number[], string>;

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
        bar: opts.dense ? { categoryPercentage: 1, barPercentage: 1 } : { maxBarThickness: 64 },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: opts.dense ? { maxTicksLimit: 17, autoSkip: true, maxRotation: 0 } : { autoSkip: false },
        },
        y: {
          beginAtZero: true,
          min: 0,
          max: opts.yMax,
          title: { display: !!opts.yLabel, text: opts.yLabel ?? '' },
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

function colorBars(chart: BarChart): void {
  const accent = cssVar('--accent', '#3b5bdb');
  const ok = cssVar('--ok', '#2b8a3e');
  const idx = highlight.get(chart) ?? -1;
  const ds = chart.data.datasets[0];
  ds.backgroundColor = idx < 0 ? accent : ds.data.map((_, i) => (i === idx ? ok : accent));
}

/** Replace bar data; optionally highlight one bar (e.g. the predicted class). */
export function setBars(chart: BarChart, labels: string[], values: number[], highlightIndex = -1): void {
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  highlight.set(chart, highlightIndex);
  colorBars(chart);
  chart.update();
}

// ---------- training metrics chart ----------

export type MetricsChart = Chart<'line', Point[], number>;

export function metricsChart(canvas: HTMLCanvasElement): MetricsChart {
  const chart: MetricsChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        { label: 'MSE', data: [], yAxisID: 'y', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { label: 'Точність train', data: [], yAxisID: 'y1', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        {
          label: 'Точність test',
          data: [],
          yAxisID: 'y1',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
          borderDash: [6, 4],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2 } },
      },
      scales: {
        x: {
          type: 'linear',
          min: 1,
          title: { display: true, text: 'Епоха' },
          ticks: { precision: 0 },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'MSE' },
        },
        y1: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 1,
          title: { display: true, text: 'Точність' },
          grid: { drawOnChartArea: false },
          ticks: { callback: (v) => `${Math.round(Number(v) * 100)}%` },
        },
      },
    },
  });
  track(chart, () => {
    scaleColors(chart);
    const colors = [cssVar('--danger', '#c92a2a'), cssVar('--accent', '#3b5bdb'), cssVar('--ok', '#2b8a3e')];
    chart.data.datasets.forEach((ds, i) => {
      ds.borderColor = colors[i];
      ds.backgroundColor = colors[i];
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
