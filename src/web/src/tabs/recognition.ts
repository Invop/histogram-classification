// «Розпізнавання»: model info, export/import, single-image recognition with charts.
import { api, ApiError, type ModelInfo } from '../api';
import { barChart, setBars } from '../charts';
import { notifyModelChanged, onModelChanged } from '../state';
import { $, errorMessage, formatMs, percent } from '../util';

const NO_MODEL = 'Модель ще не навчена — перейдіть на вкладку «Навчання».';
const BINS = Array.from({ length: 256 }, (_, i) => String(i));

export function initRecognition(): void {
  initModel();
  initRecognize();
}

function describeModel(info: ModelInfo): string {
  const m = info.metadata;
  const acc =
    m.testAccuracy === null || m.testAccuracy === undefined
      ? `точність train ${percent(m.trainAccuracy)}`
      : `точність test ${percent(m.testAccuracy)}`;
  return (
    `Модель: класи [${info.classes.join(', ')}], групи [${(m.groups ?? []).join(', ')}], ` +
    `train ${m.trainCount}, test ${m.testCount}, епох ${m.epochs}, η=${m.learningRate}, ${acc}`
  );
}

function initModel(): void {
  const info = $('model-info');
  const status = $('model-status');
  const exportBtn = $<HTMLButtonElement>('model-export');
  const importInput = $<HTMLInputElement>('model-import');
  const importLabel = $('model-import-label');
  let seq = 0;

  const setStatus = (text: string, kind: '' | 'ok' | 'error' = '') => {
    status.className = kind ? `status status--${kind}` : 'status';
    status.textContent = text;
  };

  const load = async () => {
    const my = ++seq;
    try {
      const m = await api.getModelInfo();
      if (my !== seq) return;
      info.textContent = describeModel(m);
      info.title = m.metadata.trainedAt ? `Навчено: ${new Date(m.metadata.trainedAt).toLocaleString('uk-UA')}` : '';
      exportBtn.disabled = false;
    } catch (e) {
      if (my !== seq) return;
      exportBtn.disabled = true;
      info.title = '';
      info.textContent = e instanceof ApiError && e.status === 404 ? NO_MODEL : `Не вдалося отримати модель: ${errorMessage(e)}`;
    }
  };

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
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
      setStatus('Модель збережено у model.json.', 'ok');
    } catch (e) {
      setStatus(e instanceof ApiError && e.status === 404 ? NO_MODEL : errorMessage(e), 'error');
    } finally {
      exportBtn.disabled = false;
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    importLabel.classList.add('is-busy');
    setStatus(`Імпорт ${file.name}…`);
    try {
      const text = await file.text();
      const m = await api.importModel(text);
      setStatus(`Модель імпортовано: класи [${m.classes.join(', ')}].`, 'ok');
      notifyModelChanged();
    } catch (e) {
      setStatus(`Імпорт не вдався: ${errorMessage(e)}`, 'error');
    } finally {
      importInput.value = '';
      importLabel.classList.remove('is-busy');
    }
  });

  onModelChanged(() => void load());
  void load();
}

function initRecognize(): void {
  const input = $<HTMLInputElement>('recognize-file');
  const preview = $<HTMLImageElement>('recognize-preview');
  const result = $('recognize-result');
  const outputs = barChart($<HTMLCanvasElement>('outputs-chart'), { yMax: 1, yLabel: 'Вихід' });
  const histogram = barChart($<HTMLCanvasElement>('histogram-chart'), { dense: true, yLabel: 'Пікселів' });
  const partial = barChart($<HTMLCanvasElement>('partial-chart'), { dense: true, yMax: 15, yLabel: 'Рівень' });
  let previewUrl: string | null = null;
  let seq = 0;

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const my = ++seq;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.alt = file.name;
    preview.hidden = false;

    result.className = 'result';
    result.textContent = 'Розпізнавання…';
    try {
      const r = await api.recognize(file);
      if (my !== seq) return;
      const idx = r.outputs.findIndex((o) => o.className === r.predicted);
      const confidence = idx >= 0 ? percent(r.outputs[idx].value) : '—';
      result.className = 'result result--ok';
      result.textContent = `Клас: ${r.predicted} (${confidence}) · ${formatMs(r.elapsedMs)}`;
      setBars(
        outputs,
        r.outputs.map((o) => o.className),
        r.outputs.map((o) => o.value),
        idx,
      );
      setBars(histogram, BINS, r.histogram);
      setBars(partial, BINS, r.partial);
    } catch (e) {
      if (my !== seq) return;
      result.className = 'result result--error';
      result.textContent = e instanceof ApiError && e.status === 404 ? NO_MODEL : errorMessage(e);
    }
  });
}
