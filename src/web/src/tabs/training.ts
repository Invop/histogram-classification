// «Навчання»: group selection, parameters, live progress, metrics chart, weight heatmaps.
import { api, ApiError, type AssetsInfo } from '../api';
import { metricsChart, pushEpoch, resetMetrics, setHistory } from '../charts';
import { renderWeights } from '../heatmap';
import { onHub, type EpochMetrics, type TrainingResult } from '../hub';
import { notifyModelChanged, onAssets, onModelChanged } from '../state';
import { LiveTimer } from '../timer';
import { $, el, errorMessage, fileList, formatMs, percent } from '../util';

export function initTraining(): void {
  initGroups();
  initJob();
  initWeights();
}

// ---------- group checkboxes ----------

const selectedGroups = new Set<string>();
let knownGroups: string[] = [];
let firstLoad = true;

function selectedList(): string[] {
  return knownGroups.filter((g) => selectedGroups.has(g));
}

function initGroups(): void {
  const all = $<HTMLInputElement>('train-all');
  const list = $('train-groups');

  const syncAll = () => {
    const n = selectedList().length;
    all.checked = knownGroups.length > 0 && n === knownGroups.length;
    all.indeterminate = n > 0 && n < knownGroups.length;
    all.disabled = knownGroups.length === 0;
  };

  all.addEventListener('change', () => {
    selectedGroups.clear();
    if (all.checked) knownGroups.forEach((g) => selectedGroups.add(g));
    list.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb) => (cb.checked = all.checked));
    syncAll();
  });

  onAssets((assets: AssetsInfo | null) => {
    if (!assets) return;
    const wasAll = knownGroups.length > 0 && selectedList().length === knownGroups.length;
    const names = assets.groups.map((g) => g.name);
    for (const name of names) {
      // default: everything selected; groups that appear later follow the "all" state
      if (firstLoad || (wasAll && !knownGroups.includes(name))) selectedGroups.add(name);
    }
    for (const s of [...selectedGroups]) if (!names.includes(s)) selectedGroups.delete(s);
    knownGroups = names;
    firstLoad = false;

    if (assets.groups.length === 0) {
      list.replaceChildren(el('p', 'muted small', 'Немає груп. Додайте зображення на вкладці «Дані».'));
    } else {
      list.replaceChildren(
        ...assets.groups.map((g) => {
          const total = g.classes.reduce((s, c) => s + c.count, 0);
          const label = el('label', 'check');
          const cb = el('input');
          cb.type = 'checkbox';
          cb.value = g.name;
          cb.checked = selectedGroups.has(g.name);
          cb.addEventListener('change', () => {
            if (cb.checked) selectedGroups.add(g.name);
            else selectedGroups.delete(g.name);
            syncAll();
          });
          label.append(cb, el('span', undefined, `${g.name} (${total} зобр.)`));
          return label;
        }),
      );
    }
    syncAll();
  });
}

// ---------- training job ----------

function readNumber(id: string): number {
  return Number($<HTMLInputElement>(id).value);
}

function initJob(): void {
  const start = $<HTMLButtonElement>('train-start');
  const cancel = $<HTMLButtonElement>('train-cancel');
  const errorText = $('train-error');
  const featuresText = $('features-text');
  const featuresBar = $<HTMLProgressElement>('features-progress');
  const epochsText = $('epochs-text');
  const epochsBar = $<HTMLProgressElement>('epochs-progress');
  const metricsText = $('epoch-metrics');
  const timings = $('train-timings');
  const timer = new LiveTimer($('train-timer'));
  const chart = metricsChart($<HTMLCanvasElement>('metrics-chart'));

  let jobId: string | null = null;
  let running = false;
  const finished = new Set<string>();

  // progress state (per job)
  let featuresMax = 0;
  let totalEpochs = 0;
  let completedEpochs = 0; // epochs known to be finished
  let inEpochMax = 0; // max samples done within the current epoch
  let inEpochTotal = 0;
  let shownEpochValue = 0; // monotonic value of the epoch bar (in epochs)

  const setRunning = (value: boolean) => {
    running = value;
    start.disabled = value;
    cancel.disabled = !value || !jobId;
  };

  const renderEpochBar = () => {
    if (totalEpochs <= 0) return;
    const frac = inEpochTotal > 0 ? Math.min(1, inEpochMax / inEpochTotal) : 0;
    const value = Math.min(totalEpochs, completedEpochs + frac);
    shownEpochValue = Math.max(shownEpochValue, value);
    epochsBar.max = totalEpochs;
    epochsBar.value = shownEpochValue;
    const current = Math.min(totalEpochs, completedEpochs + (completedEpochs < totalEpochs && frac > 0 ? 1 : 0));
    const within = inEpochTotal > 0 && frac < 1 && completedEpochs < totalEpochs
      ? ` · ${inEpochMax} з ${inEpochTotal} прикладів`
      : '';
    epochsText.textContent =
      `Навчання: епоха ${Math.max(current, 1)} з ${totalEpochs}${within} (${percent(shownEpochValue / totalEpochs)})`;
  };

  const renderMetrics = (m: EpochMetrics) => {
    const test = m.testAccuracy === null || m.testAccuracy === undefined ? '—' : percent(m.testAccuracy);
    metricsText.textContent =
      `Епоха ${m.epoch}: MSE ${m.loss.toFixed(4)} · точність train ${percent(m.trainAccuracy)} · test ${test}`;
  };

  const begin = (id: string) => {
    if ((running && jobId === id) || finished.has(id)) return;
    jobId = id;
    featuresMax = 0;
    totalEpochs = Math.max(0, Math.floor(readNumber('train-epochs'))) || 0;
    completedEpochs = 0;
    inEpochMax = 0;
    inEpochTotal = 0;
    shownEpochValue = 0;
    featuresBar.max = 1;
    featuresBar.value = 0;
    epochsBar.max = 1;
    epochsBar.value = 0;
    featuresText.textContent = 'Ознаки: підготовка…';
    epochsText.textContent = 'Навчання: очікування…';
    metricsText.textContent = '';
    timings.replaceChildren();
    errorText.textContent = '';
    resetMetrics(chart, totalEpochs || undefined);
    timer.start();
    setRunning(true);
  };

  start.addEventListener('click', async () => {
    errorText.textContent = '';
    const groups = selectedList();
    const req = {
      groups,
      perClassLimit: Math.floor(readNumber('train-limit')),
      epochs: Math.floor(readNumber('train-epochs')),
      learningRate: readNumber('train-lr'),
      testFraction: readNumber('train-test'),
      seed: Math.floor(readNumber('train-seed')),
      parallel: $<HTMLInputElement>('train-parallel').checked,
    };
    if (groups.length === 0) return void (errorText.textContent = 'Оберіть хоча б одну групу.');
    if (!(req.epochs >= 1)) return void (errorText.textContent = 'Кількість епох має бути ≥ 1.');
    if (!(req.learningRate > 0)) return void (errorText.textContent = 'Швидкість навчання має бути > 0.');
    if (!(req.testFraction >= 0 && req.testFraction < 1))
      return void (errorText.textContent = 'Частка тесту має бути в межах [0; 1).');
    if (!(req.perClassLimit >= 0)) return void (errorText.textContent = 'Ліміт на клас має бути ≥ 0.');
    if (!Number.isFinite(req.seed)) return void (errorText.textContent = 'Некоректний seed.');

    start.disabled = true;
    try {
      const r = await api.train(req);
      begin(r.jobId);
      cancel.disabled = !running;
    } catch (e) {
      errorText.textContent = errorMessage(e);
      if (!running) start.disabled = false;
    }
  });

  cancel.addEventListener('click', async () => {
    if (!jobId) return;
    cancel.disabled = true;
    try {
      await api.cancelJob(jobId);
      metricsText.textContent = 'Скасування…';
    } catch (e) {
      errorText.textContent = errorMessage(e);
      cancel.disabled = !running;
    }
  });

  onHub({
    started: (e) => {
      if (e.name === 'training') begin(e.jobId);
    },
    progress: (p) => {
      if (p.stage === 'features') {
        featuresMax = Math.max(featuresMax, p.done);
        const total = Math.max(p.total, 1);
        featuresBar.max = total;
        featuresBar.value = Math.min(featuresMax, total);
        featuresText.textContent = `Ознаки: ${featuresMax} з ${p.total} зображень (${percent(featuresMax / total)})`;
      } else if (p.stage === 'epoch') {
        if (featuresBar.value < featuresBar.max) {
          // feature extraction is over once epochs start
          featuresBar.value = featuresBar.max;
        }
        // a drop in "done" means a new epoch has started (events are throttled)
        if (p.done < inEpochMax) {
          completedEpochs = Math.min(totalEpochs || Infinity, completedEpochs + 1);
        }
        inEpochMax = p.done;
        inEpochTotal = p.total;
        renderEpochBar();
      }
    },
    epoch: (m) => {
      if (m.totalEpochs > 0) totalEpochs = m.totalEpochs;
      if (m.epoch > completedEpochs) {
        completedEpochs = m.epoch;
        inEpochMax = 0; // next epoch starts from scratch
      }
      renderEpochBar();
      renderMetrics(m);
      pushEpoch(chart, m);
    },
    completed: (e) => {
      if (e.name !== 'training') return;
      finished.add(e.jobId);
      const r = e.result as TrainingResult;
      timer.stop(e.elapsedMs);
      featuresBar.value = featuresBar.max;
      const history = r.history ?? [];
      const last = history.at(-1);
      if (last) {
        totalEpochs = last.totalEpochs || totalEpochs;
        completedEpochs = totalEpochs;
        renderEpochBar();
        renderMetrics(last);
      } else {
        epochsBar.value = epochsBar.max;
      }
      setHistory(chart, history);

      const t = (stage: string) => r.timings?.find((x) => x.stage === stage)?.elapsedMs;
      const feat = t('features');
      const train = t('training');
      const summary =
        `Готово за ${formatMs(e.elapsedMs)} — ознаки: ${feat === undefined ? '—' : formatMs(feat)}, ` +
        `навчання: ${train === undefined ? '—' : formatMs(train)}; train ${r.trainCount}, test ${r.testCount}` +
        `; пропущено файлів: ${r.skippedFiles?.length ?? 0}`;
      timings.className = 'status status--ok';
      timings.replaceChildren(el('span', undefined, summary), fileList('Пропущені файли', r.skippedFiles ?? []));

      jobId = null;
      setRunning(false);
      notifyModelChanged();
    },
    failed: (e) => {
      if (e.name !== 'training') return;
      finished.add(e.jobId);
      timer.stop(e.elapsedMs);
      timings.className = 'status status--error';
      timings.textContent = e.error === 'Скасовано' ? 'Навчання скасовано.' : `Помилка: ${e.error}`;
      jobId = null;
      setRunning(false);
    },
  });
}

// ---------- weight heatmaps ----------

function initWeights(): void {
  const container = $('weights-maps');
  let seq = 0;

  const load = async () => {
    const my = ++seq;
    try {
      const w = await api.getWeights();
      if (my !== seq) return;
      renderWeights(container, w.classes, w.weights);
    } catch (e) {
      if (my !== seq) return;
      const msg = e instanceof ApiError && e.status === 404 ? 'Модель ще не навчена.' : `Не вдалося завантажити ваги: ${errorMessage(e)}`;
      container.replaceChildren(el('p', 'muted', msg));
    }
  };

  onModelChanged(() => void load());
  void load();
}
