// Small shared stores: Assets catalogue and "model changed" notifications.
import { api, type AssetsInfo } from './api';
import { errorMessage } from './util';

type AssetsListener = (assets: AssetsInfo | null, error: string | null) => void;

const assetsListeners = new Set<AssetsListener>();
let lastAssets: AssetsInfo | null = null;
let inflight: Promise<AssetsInfo | null> | null = null;

/** Subscribe to assets updates; the listener is called immediately if data is already loaded. */
export function onAssets(listener: AssetsListener): () => void {
  assetsListeners.add(listener);
  if (lastAssets) listener(lastAssets, null);
  return () => assetsListeners.delete(listener);
}

export function currentAssets(): AssetsInfo | null {
  return lastAssets;
}

/** Fetch GET /api/assets and notify all listeners. Concurrent calls share one request. */
export function reloadAssets(): Promise<AssetsInfo | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      lastAssets = await api.getAssets();
      assetsListeners.forEach((l) => l(lastAssets, null));
      return lastAssets;
    } catch (e) {
      const msg = errorMessage(e);
      assetsListeners.forEach((l) => l(lastAssets, msg));
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const modelListeners = new Set<() => void>();

export function onModelChanged(listener: () => void): () => void {
  modelListeners.add(listener);
  return () => modelListeners.delete(listener);
}

/** Tell interested modules that the model on the server has changed (trained or imported). */
export function notifyModelChanged(): void {
  modelListeners.forEach((l) => l());
}
