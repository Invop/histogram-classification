// React bindings for the hub, shared stores and imperative Chart.js instances.
import type { Chart } from 'chart.js';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { api, type AssetsInfo, type JobStarted } from './api';
import { disposeChart } from './charts';
import { onHub, type CompletedEvent, type FailedEvent, type HubHandlers, type JobName } from './hub';
import { currentAssets, onAssets, onModelChanged } from './state';
import { Stopwatch } from './stopwatch';
import { onThemeChange } from './theme';
import { errorMessage } from './util';

/** Ref that always holds the latest value (for callbacks registered once). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Subscribe to hub events for the component's lifetime; handlers may change between renders. */
export function useHub(handlers: Partial<HubHandlers>): void {
  const ref = useLatest(handlers);
  useEffect(
    () =>
      onHub({
        started: (e) => ref.current.started?.(e),
        progress: (e) => ref.current.progress?.(e),
        epoch: (e) => ref.current.epoch?.(e),
        log: (e) => ref.current.log?.(e),
        completed: (e) => ref.current.completed?.(e),
        failed: (e) => ref.current.failed?.(e),
      }),
    [ref],
  );
}

export interface AssetsState {
  assets: AssetsInfo | null;
  error: string | null;
}

export function useAssets(): AssetsState {
  const [state, setState] = useState<AssetsState>(() => ({ assets: currentAssets(), error: null }));
  useEffect(() => onAssets((assets, error) => setState({ assets, error })), []);
  return state;
}

/** Counter bumped whenever the server-side model changes; use it as an effect dependency. */
export function useModelVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onModelChanged(() => setVersion((v) => v + 1)), []);
  return version;
}

/** Counter bumped when the colour scheme changes; use it to repaint theme-coloured canvases. */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onThemeChange(() => setVersion((v) => v + 1)), []);
  return version;
}

export function useStopwatch(): Stopwatch {
  const [watch] = useState(() => new Stopwatch());
  useEffect(() => () => watch.reset(), [watch]);
  return watch;
}

/** Create a Chart.js instance on a canvas for the component's lifetime. */
export function useChart<T extends Chart>(
  create: (canvas: HTMLCanvasElement) => T,
): [RefObject<HTMLCanvasElement | null>, RefObject<T | null>] {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<T>(null);
  const createRef = useLatest(create);
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = createRef.current(canvasRef.current);
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      disposeChart(chart);
    };
  }, [createRef]);
  return [canvasRef, chartRef];
}

export interface JobCallbacks {
  /** A new job has started (from this page or another one). */
  onBegin: () => void;
  onCompleted: (e: CompletedEvent) => void;
  onFailed: (e: FailedEvent) => void;
}

export interface JobControl {
  running: boolean;
  canStart: boolean;
  canCancel: boolean;
  watch: Stopwatch;
  /** POST the job request; resolves to an error message, or null on success. */
  start: (request: () => Promise<JobStarted>) => Promise<string | null>;
  /** DELETE the running job; resolves to an error message, or null on success. */
  cancel: () => Promise<string | null>;
}

/**
 * Tracks one kind of background job. "started" may arrive over the hub before
 * the POST response (and "completed" before either), so both paths go through begin().
 */
export function useJob(name: JobName, callbacks: JobCallbacks): JobControl {
  const cb = useLatest(callbacks);
  const watch = useStopwatch();
  const job = useRef({ id: null as string | null, running: false, finished: new Set<string>() });
  const [running, setRunning] = useState(false);
  const [hasId, setHasId] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const begin = useCallback(
    (id: string) => {
      const j = job.current;
      if ((j.running && j.id === id) || j.finished.has(id)) return;
      j.id = id;
      j.running = true;
      setHasId(true);
      setRunning(true);
      setCancelling(false);
      watch.start();
      cb.current.onBegin();
    },
    [cb, watch],
  );

  const end = (id: string, elapsedMs: number) => {
    const j = job.current;
    j.finished.add(id);
    j.id = null;
    j.running = false;
    setHasId(false);
    setRunning(false);
    setCancelling(false);
    watch.stop(elapsedMs);
  };

  useHub({
    started: (e) => {
      if (e.name === name) begin(e.jobId);
    },
    completed: (e) => {
      if (e.name !== name) return;
      end(e.jobId, e.elapsedMs);
      cb.current.onCompleted(e);
    },
    failed: (e) => {
      if (e.name !== name) return;
      end(e.jobId, e.elapsedMs);
      cb.current.onFailed(e);
    },
  });

  const start = useCallback(
    async (request: () => Promise<JobStarted>) => {
      setStarting(true);
      try {
        const r = await request();
        begin(r.jobId);
        return null;
      } catch (e) {
        return errorMessage(e);
      } finally {
        setStarting(false);
      }
    },
    [begin],
  );

  const cancel = useCallback(async () => {
    const id = job.current.id;
    if (!id) return null;
    setCancelling(true);
    try {
      await api.cancelJob(id);
      return null;
    } catch (e) {
      setCancelling(false);
      return errorMessage(e);
    }
  }, []);

  return {
    running,
    canStart: !running && !starting,
    canCancel: running && hasId && !cancelling,
    watch,
    start,
    cancel,
  };
}
