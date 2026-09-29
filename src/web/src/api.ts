// Typed DTOs and fetch wrappers for the backend HTTP API (JSON is camelCase).

export interface AssetClass {
  name: string;
  count: number;
}

export interface AssetGroup {
  name: string;
  classes: AssetClass[];
}

export interface AssetsInfo {
  root: string;
  groups: AssetGroup[];
}

export interface UploadResult {
  saved: number;
  rejected: string[];
}

export interface GenerateRequest {
  source: string;
  target: string;
  size: number;
  parallel: boolean;
}

export interface TrainingRequest {
  groups: string[];
  perClassLimit: number;
  epochs: number;
  learningRate: number;
  testFraction: number;
  seed: number;
  parallel: boolean;
}

export interface JobStarted {
  jobId: string;
}

export interface NeuronOutput {
  className: string;
  value: number;
}

export interface RecognitionResult {
  predicted: string;
  outputs: NeuronOutput[];
  histogram: number[];
  partial: number[];
  elapsedMs: number;
}

export interface ModelMetadata {
  groups: string[];
  trainCount: number;
  testCount: number;
  epochs: number;
  learningRate: number;
  seed: number;
  trainAccuracy: number;
  testAccuracy: number | null;
  trainedAt: string;
}

export interface ModelInfo {
  classes: string[];
  metadata: ModelMetadata;
}

export interface ModelWeights {
  classes: string[];
  weights: number[][];
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

/** HTTP error with status code; message is ProblemDetails detail/title or status text. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text) as { detail?: unknown; title?: unknown };
        if (typeof body.detail === 'string' && body.detail) message = body.detail;
        else if (typeof body.title === 'string' && body.title) message = body.title;
      } catch {
        // not JSON — ignore body
      }
    }
  } catch {
    // body unreadable
  }
  if (!message) message = res.statusText || `HTTP ${res.status}`;
  return new ApiError(res.status, message);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await request(url, init);
  return (await res.json()) as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return json<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const enc = encodeURIComponent;

export const api = {
  getAssets(): Promise<AssetsInfo> {
    return json<AssetsInfo>('/api/assets');
  },

  uploadFiles(group: string, className: string, files: readonly File[]): Promise<UploadResult> {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return json<UploadResult>(`/api/assets/${enc(group)}/${enc(className)}`, {
      method: 'POST',
      body: form,
    });
  },

  generate(req: GenerateRequest): Promise<JobStarted> {
    return postJson<JobStarted>('/api/assets/generate', req);
  },

  train(req: TrainingRequest): Promise<JobStarted> {
    return postJson<JobStarted>('/api/training', req);
  },

  async cancelJob(jobId: string): Promise<void> {
    await request(`/api/jobs/${enc(jobId)}`, { method: 'DELETE' });
  },

  recognize(file: File): Promise<RecognitionResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return json<RecognitionResult>('/api/recognize', { method: 'POST', body: form });
  },

  async exportModel(): Promise<Blob> {
    const res = await request('/api/model');
    return res.blob();
  },

  importModel(rawJson: string): Promise<ModelInfo> {
    return json<ModelInfo>('/api/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawJson,
    });
  },

  getModelInfo(): Promise<ModelInfo> {
    return json<ModelInfo>('/api/model/info');
  },

  getWeights(): Promise<ModelWeights> {
    return json<ModelWeights>('/api/model/weights');
  },

  getLogs(): Promise<LogEntry[]> {
    return json<LogEntry[]>('/api/logs');
  },
};
