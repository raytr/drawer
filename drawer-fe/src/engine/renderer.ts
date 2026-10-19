import type { BoardStore } from './board-store';
import type { Fit } from './geometry';
import { safeStyle, splitLayers } from './render-rules';
import { BACKGROUND, BOARD_HEIGHT, BOARD_WIDTH, type Stroke } from './types';

/** Draws one stroke in board pixels: round caps and joins, smoothed through midpoints. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { color, width } = safeStyle(stroke);
  const p = stroke.pts;
  const n = p.length - (p.length % 2);
  if (n < 2) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (n === 2) {
    ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < n - 2; i += 2) {
    ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  }
  ctx.lineTo(p[n - 2], p[n - 1]);
  ctx.stroke();
}

/** Two stacked canvases: base (finished strokes, drawn once) and live (redrawn each frame). */
export class Renderer {
  private readonly base: HTMLCanvasElement;
  private readonly live: HTMLCanvasElement;
  private readonly store: BoardStore;
  private readonly baseCtx: CanvasRenderingContext2D | null;
  private readonly liveCtx: CanvasRenderingContext2D | null;
  private drawnBase: string[] = [];
  private drawnStructure = -1;

  constructor(base: HTMLCanvasElement, live: HTMLCanvasElement, store: BoardStore) {
    this.base = base;
    this.live = live;
    this.store = store;
    this.baseCtx = base.getContext('2d');
    this.liveCtx = live.getContext('2d');
  }

  resize(fit: Fit, dpr: number): void {
    for (const canvas of [this.base, this.live]) {
      canvas.style.left = `${fit.offsetX}px`;
      canvas.style.top = `${fit.offsetY}px`;
      canvas.style.width = `${BOARD_WIDTH * fit.scale}px`;
      canvas.style.height = `${BOARD_HEIGHT * fit.scale}px`;
      canvas.width = Math.max(1, Math.round(BOARD_WIDTH * fit.scale * dpr));
      canvas.height = Math.max(1, Math.round(BOARD_HEIGHT * fit.scale * dpr));
    }
    const k = fit.scale * dpr;
    this.baseCtx?.setTransform(k, 0, 0, k, 0, 0);
    this.liveCtx?.setTransform(k, 0, 0, k, 0, 0);
    this.drawnStructure = -1; // a resize clears the canvases, so force a full redraw
    this.frame();
  }

  frame(): void {
    if (!this.baseCtx || !this.liveCtx) return;
    const { base, live } = splitLayers(this.store.ordered());
    const ids = base.map((s) => s.id);
    if (this.store.structureVersion !== this.drawnStructure || !startsWith(ids, this.drawnBase)) {
      this.baseCtx.fillStyle = BACKGROUND;
      this.baseCtx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      for (const stroke of base) drawStroke(this.baseCtx, stroke);
      this.drawnStructure = this.store.structureVersion;
    } else {
      for (const stroke of base.slice(this.drawnBase.length)) drawStroke(this.baseCtx, stroke);
    }
    this.drawnBase = ids;
    this.liveCtx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    for (const stroke of live) drawStroke(this.liveCtx, stroke);
  }
}

function startsWith(list: string[], prefix: string[]): boolean {
  if (prefix.length > list.length) return false;
  for (let i = 0; i < prefix.length; i++) if (list[i] !== prefix[i]) return false;
  return true;
}
