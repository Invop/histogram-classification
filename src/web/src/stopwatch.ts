/** Stopwatch store ticking every 100 ms while running; read it with useSyncExternalStore. */
export class Stopwatch {
  private startedAt = 0;
  private handle: number | undefined;
  private ms: number | null = null;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Elapsed milliseconds, or null when reset. */
  readonly getSnapshot = (): number | null => this.ms;

  get running(): boolean {
    return this.handle !== undefined;
  }

  start(): void {
    this.stopTicking();
    this.startedAt = performance.now();
    this.set(0);
    this.handle = window.setInterval(() => this.set(performance.now() - this.startedAt), 100);
  }

  /** Stop the timer; if the server reported the real elapsed time, show that instead. */
  stop(finalMs?: number): void {
    const elapsed = this.running ? performance.now() - this.startedAt : 0;
    this.stopTicking();
    this.set(finalMs ?? elapsed);
  }

  reset(): void {
    this.stopTicking();
    this.set(null);
  }

  private stopTicking(): void {
    if (this.handle !== undefined) {
      window.clearInterval(this.handle);
      this.handle = undefined;
    }
  }

  private set(ms: number | null): void {
    this.ms = ms;
    this.listeners.forEach((l) => l());
  }
}
