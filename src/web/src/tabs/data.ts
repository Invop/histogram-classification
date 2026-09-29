// «Дані»: Assets tree, file upload in batches, icon-group generation job.
import { api, type AssetsInfo } from '../api';
import { onHub, type GenerateResult } from '../hub';
import { currentAssets, onAssets, reloadAssets } from '../state';
import { LiveTimer } from '../timer';
import { $, el, errorMessage, fileList, fillDatalist, formatMs, percent } from '../util';

const UPLOAD_BATCH = 10;

export function initData(): void {
  initAssetsTree();
  initUpload();
  initGenerate();
}

// ---------- Assets tree ----------

function groupTotal(classes: readonly { count: number }[]): number {
  return classes.reduce((s, c) => s + c.count, 0);
}

function initAssetsTree(): void {
  const tree = $('assets-tree');
  const root = $('assets-root');
  const refresh = $<HTMLButtonElement>('assets-refresh');
  const open = new Set<string>();

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try {
      await reloadAssets();
    } finally {
      refresh.disabled = false;
    }
  });

  onAssets((assets, error) => {
    if (error) {
      tree.replaceChildren(el('p', 'status status--error', `Не вдалося завантажити каталог: ${error}`));
      if (!assets) return;
    }
    if (!assets) return;
    root.textContent = assets.root || '—';
    renderTree(tree, assets, open, !!error);
  });
}

function renderTree(tree: HTMLElement, assets: AssetsInfo, open: Set<string>, keepError: boolean): void {
  const nodes: Node[] = [];
  if (keepError && tree.firstElementChild?.classList.contains('status--error')) nodes.push(tree.firstElementChild);
  if (assets.groups.length === 0) {
    nodes.push(el('p', 'muted', 'Каталог порожній. Завантажте зображення у форму «Завантаження».'));
  }
  for (const g of assets.groups) {
    const details = el('details', 'tree__group');
    details.open = open.has(g.name);
    details.addEventListener('toggle', () => (details.open ? open.add(g.name) : open.delete(g.name)));
    const summary = el('summary');
    summary.append(el('span', 'tree__name', g.name), el('span', 'count', String(groupTotal(g.classes))));
    details.append(summary);
    const ul = el('ul', 'tree__classes');
    if (g.classes.length === 0) ul.append(el('li', 'muted', 'немає класів'));
    for (const c of g.classes) {
      const li = el('li');
      li.append(el('span', 'tree__name', c.name), el('span', 'count', String(c.count)));
      ul.append(li);
    }
    details.append(ul);
    nodes.push(details);
  }
  tree.replaceChildren(...nodes);
}

// ---------- Upload ----------

function initUpload(): void {
  const group = $<HTMLInputElement>('upload-group');
  const cls = $<HTMLInputElement>('upload-class');
  const files = $<HTMLInputElement>('upload-files');
  const start = $<HTMLButtonElement>('upload-start');
  const progress = $<HTMLProgressElement>('upload-progress');
  const status = $('upload-status');
  const result = $('upload-result');
  const groupsList = $<HTMLDataListElement>('upload-groups-list');
  const classesList = $<HTMLDataListElement>('upload-classes-list');

  const updateClassList = () => {
    const assets = currentAssets();
    if (!assets) return;
    const g = assets.groups.find((x) => x.name === group.value.trim());
    const names = g
      ? g.classes.map((c) => c.name)
      : [...new Set(assets.groups.flatMap((x) => x.classes.map((c) => c.name)))].sort();
    fillDatalist(classesList, names);
  };

  onAssets((assets) => {
    if (!assets) return;
    fillDatalist(
      groupsList,
      assets.groups.map((g) => g.name),
    );
    updateClassList();
  });
  group.addEventListener('input', updateClassList);

  start.addEventListener('click', async () => {
    const g = group.value.trim();
    const c = cls.value.trim();
    const selected = Array.from(files.files ?? []);
    result.replaceChildren();
    status.className = 'status';
    if (!g || !c) {
      status.className = 'status status--error';
      status.textContent = 'Вкажіть групу і клас.';
      return;
    }
    if (selected.length === 0) {
      status.className = 'status status--error';
      status.textContent = 'Оберіть файли для завантаження.';
      return;
    }

    start.disabled = true;
    const total = selected.length;
    progress.max = total;
    progress.value = 0;
    status.textContent = `Завантажено 0 з ${total}…`;
    const t0 = performance.now();
    let sent = 0;
    let saved = 0;
    const rejected: string[] = [];
    try {
      for (let i = 0; i < total; i += UPLOAD_BATCH) {
        const batch = selected.slice(i, i + UPLOAD_BATCH);
        const r = await api.uploadFiles(g, c, batch);
        saved += r.saved;
        rejected.push(...r.rejected);
        sent += batch.length;
        progress.value = sent;
        status.textContent = `Завантажено ${sent} з ${total}…`;
      }
      status.className = 'status status--ok';
      status.textContent = `Збережено ${saved} файлів за ${formatMs(performance.now() - t0)}`;
      files.value = '';
    } catch (e) {
      status.className = 'status status--error';
      status.textContent = `Помилка після ${sent} з ${total}: ${errorMessage(e)}`;
    } finally {
      result.replaceChildren(fileList('Відхилено', rejected));
      start.disabled = false;
      void reloadAssets();
    }
  });
}

// ---------- Generate ----------

function initGenerate(): void {
  const source = $<HTMLSelectElement>('gen-source');
  const target = $<HTMLInputElement>('gen-target');
  const size = $<HTMLInputElement>('gen-size');
  const parallel = $<HTMLInputElement>('gen-parallel');
  const start = $<HTMLButtonElement>('gen-start');
  const cancel = $<HTMLButtonElement>('gen-cancel');
  const progress = $<HTMLProgressElement>('gen-progress');
  const status = $('gen-status');
  const result = $('gen-result');
  const timer = new LiveTimer($('gen-timer'));

  let jobId: string | null = null;
  let running = false;
  let maxDone = 0;
  const finished = new Set<string>(); // jobs whose completed/failed already arrived

  const setRunning = (value: boolean) => {
    running = value;
    start.disabled = value;
    cancel.disabled = !value || !jobId;
  };

  const setStatus = (text: string, kind: '' | 'ok' | 'error' = '') => {
    status.className = kind ? `status status--${kind}` : 'status';
    status.textContent = text;
  };

  const begin = (id: string) => {
    if ((running && jobId === id) || finished.has(id)) return;
    jobId = id;
    maxDone = 0;
    progress.max = 1;
    progress.value = 0;
    result.replaceChildren();
    setStatus('Підготовка…');
    timer.start();
    setRunning(true);
  };

  onAssets((assets) => {
    if (!assets) return;
    const prev = source.value;
    source.replaceChildren(
      ...assets.groups.map((g) => {
        const o = el('option', undefined, `${g.name} (${groupTotal(g.classes)} зобр.)`);
        o.value = g.name;
        return o;
      }),
    );
    const names = assets.groups.map((g) => g.name);
    if (names.includes(prev)) source.value = prev;
    else if (names.includes('hq-4k')) source.value = 'hq-4k';
  });

  start.addEventListener('click', async () => {
    const req = {
      source: source.value,
      target: target.value.trim(),
      size: Number(size.value),
      parallel: parallel.checked,
    };
    if (!req.source) return setStatus('Немає вихідної групи.', 'error');
    if (!req.target) return setStatus('Вкажіть цільову групу.', 'error');
    if (!Number.isInteger(req.size) || req.size < 1) return setStatus('Розмір має бути цілим числом ≥ 1.', 'error');
    if (req.source === req.target) return setStatus('Цільова група має відрізнятися від вихідної.', 'error');

    start.disabled = true;
    try {
      const r = await api.generate(req);
      begin(r.jobId);
      cancel.disabled = !running;
    } catch (e) {
      setStatus(errorMessage(e), 'error');
      if (!running) start.disabled = false;
    }
  });

  cancel.addEventListener('click', async () => {
    if (!jobId) return;
    cancel.disabled = true;
    try {
      await api.cancelJob(jobId);
      setStatus('Скасування…');
    } catch (e) {
      setStatus(errorMessage(e), 'error');
      cancel.disabled = !running;
    }
  });

  onHub({
    started: (e) => {
      if (e.name === 'generate') begin(e.jobId);
    },
    progress: (p) => {
      if (p.stage !== 'generate') return;
      maxDone = Math.max(maxDone, p.done);
      const total = Math.max(p.total, 1);
      progress.max = total;
      progress.value = Math.min(maxDone, total);
      setStatus(`Оброблено ${maxDone} з ${p.total} (${percent(maxDone / total)})`);
    },
    completed: (e) => {
      if (e.name !== 'generate') return;
      finished.add(e.jobId);
      const r = e.result as GenerateResult;
      timer.stop(e.elapsedMs);
      progress.value = progress.max;
      setStatus(`Згенеровано ${r.generated} зображень за ${formatMs(e.elapsedMs)}`, 'ok');
      result.replaceChildren(fileList('Пропущено файлів', r.skippedFiles ?? []));
      jobId = null;
      setRunning(false);
      void reloadAssets();
    },
    failed: (e) => {
      if (e.name !== 'generate') return;
      finished.add(e.jobId);
      timer.stop(e.elapsedMs);
      setStatus(e.error === 'Скасовано' ? 'Скасовано.' : `Помилка: ${e.error}`, 'error');
      jobId = null;
      setRunning(false);
      void reloadAssets();
    },
  });
}
