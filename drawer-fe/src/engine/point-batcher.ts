import { MAX_POINTS_PER_BATCH } from './types';

/** Collects pointer positions as integer board points and hands them out in batches. */
export class PointBatcher {
  private readonly maxPerBatch: number;
  private pending: number[] = [];
  private lastX: number | null = null;
  private lastY: number | null = null;

  constructor(maxPerBatch = MAX_POINTS_PER_BATCH) {
    this.maxPerBatch = maxPerBatch;
  }

  add(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix === this.lastX && iy === this.lastY) return;
    this.lastX = ix;
    this.lastY = iy;
    this.pending.push(ix, iy);
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Removes and returns at most maxPerBatch points as a flat [x, y, ...] array. */
  take(): number[] {
    return this.pending.splice(0, this.maxPerBatch * 2);
  }

  reset(): void {
    this.pending = [];
    this.lastX = null;
    this.lastY = null;
  }
}
