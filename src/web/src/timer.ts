import { formatMs } from './util';

/** Stopwatch shown in an element, updated every 100 ms while running. */
export class LiveTimer {
  private readonly target: HTMLElement;
  private readonly prefix: string;
  private startedAt = 0;
  private handle: number | undefined;

  constructor(target: HTMLElement, prefix = 'Час: ') {
    this.target = target;
    this.prefix = prefix;
  }

  get running(): boolean {
    return this.handle !== undefined;
  }

  start(): void {
    this.stopTicking();
    this.startedAt = performance.now();
    this.render(0);
    this.handle = window.setInterval(() => this.render(performance.now() - this.startedAt), 100);
  }

  /** Stop the timer; if the server reported the real elapsed time, show that instead. */
  stop(finalMs?: number): void {
    const elapsed = this.running ? performance.now() - this.startedAt : 0;
    this.stopTicking();
    this.render(finalMs ?? elapsed);
  }

  reset(): void {
    this.stopTicking();
    this.target.textContent = '';
  }

  private stopTicking(): void {
    if (this.handle !== undefined) {
      window.clearInterval(this.handle);
      this.handle = undefined;
    }
  }

  private render(ms: number): void {
    this.target.textContent = `${this.prefix}${formatMs(ms)}`;
  }
}
