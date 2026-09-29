// SignalR connection to /hubs/progress (server → client events only).
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { LogEntry } from './api';

export type JobName = 'training' | 'generate';

export interface StartedEvent {
  jobId: string;
  name: JobName;
}

export type ProgressStage = 'features' | 'epoch' | 'generate';

export interface ProgressEvent {
  stage: ProgressStage;
  done: number;
  total: number;
  percent: number;
}

export interface EpochMetrics {
  epoch: number;
  totalEpochs: number;
  loss: number;
  trainAccuracy: number;
  testAccuracy: number | null;
}

export interface StageTiming {
  stage: 'features' | 'training';
  elapsedMs: number;
}

export interface TrainingResult {
  classNames: string[];
  trainCount: number;
  testCount: number;
  skippedFiles: string[];
  timings: StageTiming[];
  history: EpochMetrics[];
}

export interface GenerateResult {
  generated: number;
  skippedFiles: string[];
}

export interface CompletedEvent {
  jobId: string;
  name: JobName;
  elapsedMs: number;
  result: unknown;
}

export interface FailedEvent {
  jobId: string;
  name: JobName;
  elapsedMs: number;
  error: string;
}

export interface HubHandlers {
  started: (e: StartedEvent) => void;
  progress: (e: ProgressEvent) => void;
  epoch: (e: EpochMetrics) => void;
  log: (e: LogEntry) => void;
  completed: (e: CompletedEvent) => void;
  failed: (e: FailedEvent) => void;
}

export type HubStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type EventName = keyof HubHandlers;
const EVENTS: readonly EventName[] = ['started', 'progress', 'epoch', 'log', 'completed', 'failed'];

const listeners: { [K in EventName]: Set<HubHandlers[K]> } = {
  started: new Set(),
  progress: new Set(),
  epoch: new Set(),
  log: new Set(),
  completed: new Set(),
  failed: new Set(),
};

/** Subscribe to any subset of hub events. Returns an unsubscribe function. */
export function onHub(handlers: Partial<HubHandlers>): () => void {
  const added: Array<() => void> = [];
  for (const name of EVENTS) {
    const h = handlers[name];
    if (!h) continue;
    const set = listeners[name] as Set<typeof h>;
    set.add(h);
    added.push(() => set.delete(h));
  }
  return () => added.forEach((f) => f());
}

function dispatch<K extends EventName>(name: K, payload: Parameters<HubHandlers[K]>[0]): void {
  for (const h of listeners[name]) {
    try {
      (h as (p: typeof payload) => void)(payload);
    } catch (err) {
      console.error(`hub handler "${name}" failed`, err);
    }
  }
}

let connection: HubConnection | null = null;

/** Build and start the hub connection; keeps retrying after the automatic reconnect gives up. */
export function connectHub(onStatus: (s: HubStatus) => void): HubConnection {
  if (connection) return connection;

  const conn = new HubConnectionBuilder()
    .withUrl('/hubs/progress')
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000])
    .configureLogging(LogLevel.Warning)
    .build();
  connection = conn;

  for (const name of EVENTS) {
    conn.on(name, (payload: never) => dispatch(name, payload));
  }

  conn.onreconnecting(() => onStatus('reconnecting'));
  conn.onreconnected(() => onStatus('connected'));
  conn.onclose(() => {
    onStatus('disconnected');
    scheduleStart();
  });

  let retryTimer: number | undefined;
  const scheduleStart = () => {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(start, 5000);
  };

  async function start(): Promise<void> {
    onStatus('connecting');
    try {
      await conn.start();
      onStatus('connected');
    } catch {
      onStatus('disconnected');
      scheduleStart();
    }
  }

  void start();
  return conn;
}
