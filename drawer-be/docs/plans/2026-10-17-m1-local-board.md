# M1 Local Drawing Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A drawing board that runs locally in `../drawer-fe`: brush, eraser, 8 colors, width 1-64, undo, redo, clear, keyboard shortcuts, on a fixed 1920 x 1080 board, with no server.

**Architecture:** A plain TypeScript engine (`src/engine/`) owns all stroke data: `BoardStore` (strokes), `History` (undo/redo), `PointBatcher` and `geometry` (input math), render rules plus a two-canvas `Renderer`, and a `BoardController` facade. React components only show controls and read a small snapshot through `useSyncExternalStore`; strokes never enter React state. The engine shapes match the M2 protocol (section 6 of the spec), so M2 adds a `Connection` without rewriting the store.

**Tech Stack:** React 19.3 + Vite 8.3 + TypeScript (template of create-vite 9.2), Vitest 5.0 + jsdom 30 + Testing Library.

**Spec:** `docs/design/2026-10-17-drawer-design.md` (sections 4, 6.5, 9.1-9.5, 10, 13, 14).

## Global Constraints

- Work directory for every command: `/Users/ray/personal/play_ground/drawer/drawer-fe`.
- Version floors (npm, 2026-10-17): `react` and `react-dom` 19.3.1, `vite` 8.3.4, `@vitejs/plugin-react` 6.1.2, `vitest` 5.0.5, `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 7.0.1, `@testing-library/user-event` 14.6.8. Keep the TypeScript and ESLint versions the template pins.
- Runtime dependencies: `react` and `react-dom` only. No state, canvas, router, or UI library in M1 (owner: plain React, few libraries).
- Board constants (spec 6.5, 9.4): 1920 x 1080 board px; background `#ffffff`; width integer 1-64; points are integers with `0 <= x < 1920`, `0 <= y < 1080`; at most 64 points per batch; at most 5,000 points per stroke; tool `b` (brush) or `e` (eraser); eraser strokes are drawn in the background color.
- Strokes never live in React state. React reads engine state only through `useSyncExternalStore` (spec 9.1).
- UI copy in English, as written in spec section 10.
- Writing rules (from `drawer-be/backbone.yml`): no emoji; no em or en dashes in code comments or copy; ASCII punctuation.
- Version control: `drawer-fe` is not a git repository. Before Task 1, ask the owner whether to run `git init` there. If yes, run the commit steps with conventional messages and no AI attribution trailers. If no, skip every commit step.

## Review Focus

1. Pointer lost mid-stroke (`pointercancel`, `lostpointercapture`, the window losing focus): the stroke must end, not stay unfinished forever. Test in Task 7.
2. Undo, redo, or clear pressed while a stroke is being drawn: ignored until pointer up, so the undo stack never points at a half stroke. Test in Task 5.
3. A stroke longer than 5,000 points: extra points are dropped, nothing crashes, the stroke still ends. Test in Task 2.
4. Shortcuts while typing or composing text (a Vietnamese input method such as Telex sends key events with `isComposing`): no tool change, no undo. Test in Task 6.
5. A second finger or pen touching the board while one stroke is active: ignored; only the first pointer draws. Test in Task 7.

---

### Task 1: Scaffold drawer-fe with tests

**Files:**
- Create: the create-vite `react-ts` template files in `drawer-fe/` (`package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `src/main.tsx`, `src/App.tsx`)
- Delete from the template: `src/App.css`, `src/assets/`, `public/vite.svg` (`backbone.yml` rule: list these exact paths to the owner and wait for approval before deleting)
- Create: `src/test/setup.ts`, `src/App.test.tsx`

**Interfaces:**
- Produces: `npm test` (Vitest, jsdom environment, setup file `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`), `npm run build`, `npm run lint`, `npm run dev`.

- [ ] **Step 1: Scaffold the template in the empty directory**

Run: `npm create vite@9.2.1 . -- --template react-ts` (answer no if it offers to install and start), then `npm install`
Expected: `package.json` lists `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`; `npm run build` succeeds.

- [ ] **Step 2: Add the test tools**

Run: `npm install -D vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.8`
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. In `vite.config.ts` add `test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }`. Bump `react`, `react-dom`, and `vite` to the floors above if the template pins lower.

- [ ] **Step 3: Write the failing smoke test `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('shows the app name', () => {
  render(<App />);
  expect(screen.getByText('drawer')).toBeInTheDocument();
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npm test`
Expected: FAIL (the template App does not render the text `drawer`).

- [ ] **Step 5: Replace `src/App.tsx` with a component that renders `<h1>drawer</h1>`; remove the template assets listed above**

- [ ] **Step 6: Run tests, build, and lint**

Run: `npm test && npm run build && npm run lint`
Expected: 1 test passes; build and lint exit 0.

- [ ] **Step 7: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "chore: scaffold drawer-fe with Vite, React, and Vitest"
```

### Task 2: Engine types and BoardStore

**Files:**
- Create: `src/engine/types.ts`, `src/engine/board-store.ts`
- Test: `src/engine/board-store.test.ts`

**Interfaces:**
- Produces in `types.ts`:
  - `type Tool = 'b' | 'e'`
  - `interface Stroke { id: string; seq: number | null; localOrder: number; tool: Tool; color: string; width: number; pts: number[]; done: boolean; deleted: boolean; mine: boolean }` (`seq` stays `null` in M1; M2 fills it)
  - constants `BOARD_WIDTH = 1920`, `BOARD_HEIGHT = 1080`, `BACKGROUND = '#ffffff'`, `MAX_POINTS_PER_BATCH = 64`, `MAX_POINTS_PER_STROKE = 5000`, `MIN_WIDTH = 1`, `MAX_WIDTH = 64`
- Produces in `board-store.ts`, class `BoardStore`:
  - `subscribe(listener: () => void): () => void`
  - `readonly version: number` (bumps on every change), `readonly structureVersion: number` (bumps only when a stroke's `deleted` flag changes)
  - `startStroke(init: { id: string; tool: Tool; color: string; width: number }): Stroke` (pending, `mine: true`, next `localOrder`)
  - `appendPoints(id: string, pts: number[]): void`
  - `endStroke(id: string): void`
  - `setDeleted(ids: readonly string[], deleted: boolean): void`
  - `visibleIds(): string[]` (not deleted, in order)
  - `ordered(): readonly Stroke[]` (by `localOrder` in M1)
  - `get(id: string): Stroke | undefined`

- [ ] **Step 1: Write the failing tests**

```ts
test('startStroke creates a pending stroke of this tab', () => {
  const s = new BoardStore();
  const a = s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  expect(a).toMatchObject({ seq: null, done: false, deleted: false, mine: true, pts: [] });
  s.startStroke({ id: 'b', tool: 'e', color: '#111111', width: 8 });
  expect(s.ordered().map((x) => x.id)).toEqual(['a', 'b']);
});

test('appendPoints ignores unknown and finished strokes', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  s.appendPoints('nope', [1, 2]);
  s.appendPoints('a', [1, 2, 3, 4]);
  s.endStroke('a');
  s.appendPoints('a', [5, 6]);
  expect(s.get('a')!.pts).toEqual([1, 2, 3, 4]);
  expect(s.get('a')!.done).toBe(true);
});

test('a stroke keeps at most 5000 points', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  for (let i = 0; i < 80; i++) s.appendPoints('a', new Array(128).fill(1)); // 80 x 64 points
  expect(s.get('a')!.pts.length).toBe(10000);
  s.endStroke('a');
  expect(s.get('a')!.done).toBe(true);
});

test('setDeleted and visibleIds; structureVersion moves only on deleted changes', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  s.startStroke({ id: 'b', tool: 'b', color: '#111111', width: 8 });
  const v = s.structureVersion;
  s.appendPoints('a', [1, 2]);
  expect(s.structureVersion).toBe(v);
  s.setDeleted(['a'], true);
  expect(s.structureVersion).toBe(v + 1);
  expect(s.visibleIds()).toEqual(['b']);
});

test('subscribers are called on change and can unsubscribe', () => {
  const s = new BoardStore();
  const fn = vi.fn();
  const off = s.subscribe(fn);
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  off();
  s.endStroke('a');
  expect(fn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/engine/board-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `types.ts` and `BoardStore` with the signatures above**

A `Map<string, Stroke>` plus an id array in creation order. `appendPoints` copies at most `MAX_POINTS_PER_STROKE * 2 - pts.length` numbers. `setDeleted` bumps `structureVersion` once per call when at least one flag changed.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/engine/board-store.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(engine): add stroke types and BoardStore"
```

### Task 3: History (undo, redo, clear)

**Files:**
- Create: `src/engine/history.ts`
- Test: `src/engine/history.test.ts`

**Interfaces:**
- Consumes: `BoardStore` (Task 2).
- Produces, class `History`:
  - `constructor(store: BoardStore)`
  - `subscribe(listener: () => void): () => void`, `readonly version: number`
  - `recordStroke(id: string): void` (push; empty the redo stack)
  - `clear(): void` (hides `store.visibleIds()` and records `{ kind: 'clear', ids }`; records nothing when no stroke is visible)
  - `undo(): boolean`, `redo(): boolean` (false when the stack is empty)
  - `readonly canUndo: boolean`, `readonly canRedo: boolean`
- Entry type: `type HistoryEntry = { kind: 'stroke'; id: string } | { kind: 'clear'; ids: string[] }`. Undo of a stroke hides it; undo of a clear shows exactly its `ids` again (the M2 `board.restore`); redo does the opposite.

- [ ] **Step 1: Write the failing tests**

```ts
function draw(store: BoardStore, h: History, id: string) {
  store.startStroke({ id, tool: 'b', color: '#111111', width: 8 });
  store.appendPoints(id, [1, 1, 2, 2]);
  store.endStroke(id);
  h.recordStroke(id);
}

test('draw, clear, undo brings every stroke back', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a'); draw(store, h, 'b');
  h.clear();
  expect(store.visibleIds()).toEqual([]);
  expect(h.undo()).toBe(true);
  expect(store.visibleIds()).toEqual(['a', 'b']);
});

test('redo of a clear hides the same strokes again', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a');
  h.clear(); h.undo(); h.redo();
  expect(store.visibleIds()).toEqual([]);
});

test('undo and redo of a single stroke', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a');
  h.undo();
  expect(store.get('a')!.deleted).toBe(true);
  h.redo();
  expect(store.get('a')!.deleted).toBe(false);
});

test('a new stroke empties the redo stack', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a'); h.undo();
  draw(store, h, 'b');
  expect(h.canRedo).toBe(false);
  expect(h.redo()).toBe(false);
});

test('clear on an empty board records nothing', () => {
  const store = new BoardStore(); const h = new History(store);
  h.clear();
  expect(h.canUndo).toBe(false);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/engine/history.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `History` with the interface above (two arrays used as stacks)**

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/engine/history.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(engine): add undo, redo, and clear history"
```

### Task 4: Input math and render rules

**Files:**
- Create: `src/engine/point-batcher.ts`, `src/engine/geometry.ts`, `src/engine/render-rules.ts`
- Test: `src/engine/point-batcher.test.ts`, `src/engine/geometry.test.ts`, `src/engine/render-rules.test.ts`

**Interfaces:**
- Consumes: `Stroke`, constants (Task 2).
- Produces:
  - class `PointBatcher`: `add(x: number, y: number): void` (rounds to integers; skips a point equal to the last added one), `hasPending(): boolean`, `take(): number[]` (removes and returns at most `MAX_POINTS_PER_BATCH` points as a flat array), `reset(): void`
  - `interface Fit { scale: number; offsetX: number; offsetY: number }`
  - `fitBoard(viewWidth: number, viewHeight: number): Fit` (largest scale that fits the whole board, centered; letterbox)
  - `toBoardPoint(clientX: number, clientY: number, rect: { left: number; top: number }, fit: Fit): [number, number]` (integers, clamped to `0..1919` and `0..1079`)
  - `splitLayers(strokes: readonly Stroke[]): { base: Stroke[]; live: Stroke[] }` (skip deleted strokes; `base` = finished strokes before the first unfinished one; `live` = every stroke from the first unfinished one on)
  - `safeStyle(stroke: Stroke): { color: string; width: number }` (eraser gives `BACKGROUND`; a color not matching `^#[0-9a-f]{6}$` gives `#000000`; width clamped to 1..64)

- [ ] **Step 1: Write the failing tests**

```ts
// point-batcher.test.ts
test('rounds, skips repeats, and caps a batch at 64 points', () => {
  const b = new PointBatcher();
  b.add(1.4, 2.6); b.add(1.2, 3.4); // same integer point twice
  expect(b.take()).toEqual([1, 3]);
  for (let i = 0; i < 70; i++) b.add(i, 0);
  expect(b.take().length).toBe(128);
  expect(b.take().length).toBe(12);
  expect(b.hasPending()).toBe(false);
});

// geometry.test.ts
test('fitBoard letterboxes a tall view', () => {
  expect(fitBoard(960, 1080)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 270 });
});
test('toBoardPoint maps, rounds, and clamps', () => {
  const fit = { scale: 0.5, offsetX: 0, offsetY: 270 };
  const rect = { left: 10, top: 20 };
  expect(toBoardPoint(10 + 100.2, 20 + 270 + 50, rect, fit)).toEqual([200, 100]);
  expect(toBoardPoint(-50, -50, rect, fit)).toEqual([0, 0]);
  expect(toBoardPoint(5000, 5000, rect, fit)).toEqual([1919, 1079]);
});

// render-rules.test.ts
const st = (id: string, done: boolean, deleted = false): Stroke =>
  ({ id, seq: null, localOrder: 0, tool: 'b', color: '#111111', width: 8, pts: [], done, deleted, mine: true });
test('base stops at the first unfinished stroke', () => {
  const r = splitLayers([st('a', true), st('b', false), st('c', true)]);
  expect(r.base.map((s) => s.id)).toEqual(['a']);
  expect(r.live.map((s) => s.id)).toEqual(['b', 'c']);
});
test('deleted strokes are skipped; all finished means empty live', () => {
  const r = splitLayers([st('a', true), st('x', false, true), st('c', true)]);
  expect(r.base.map((s) => s.id)).toEqual(['a', 'c']);
  expect(r.live).toEqual([]);
});
test('safeStyle', () => {
  expect(safeStyle({ ...st('e', true), tool: 'e', color: '#e03131' }).color).toBe('#ffffff');
  expect(safeStyle({ ...st('a', true), color: 'red' }).color).toBe('#000000');
  expect(safeStyle({ ...st('a', true), width: 0 }).width).toBe(1);
  expect(safeStyle({ ...st('a', true), width: 100 }).width).toBe(64);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/engine/point-batcher.test.ts src/engine/geometry.test.ts src/engine/render-rules.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules with the signatures above**

`toBoardPoint`: `x = (clientX - rect.left - fit.offsetX) / fit.scale`, the same for y, then round and clamp.

- [ ] **Step 4: Run the tests**

Run: the command from Step 2.
Expected: 6 tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(engine): add point batching, board geometry, and render rules"
```

### Task 5: BoardController and Renderer

**Files:**
- Create: `src/engine/board-controller.ts`, `src/engine/renderer.ts`, `src/hooks/useBoard.ts`
- Test: `src/engine/board-controller.test.ts`

**Interfaces:**
- Consumes: `BoardStore`, `History`, `PointBatcher`, `Fit`, `splitLayers`, `safeStyle`.
- Produces:
  - `interface BoardSnapshot { canUndo: boolean; canRedo: boolean; hasVisible: boolean; drawing: boolean }`
  - class `BoardController`:
    - `constructor(store?: BoardStore, history?: History, newId?: () => string)` (default `newId` is `crypto.randomUUID`)
    - `readonly store: BoardStore`
    - `beginStroke(tool: Tool, color: string, width: number): void` (ignored while drawing)
    - `addPoint(x: number, y: number): void` (board coordinates; into the batcher)
    - `flush(): void` (moves at most one batch from the batcher into the store; called once per animation frame)
    - `endStroke(): void` (drains the batcher, ends the stroke, records it in history)
    - `undo(): void`, `redo(): void`, `clear(): void` (ignored while drawing)
    - `subscribe(listener: () => void): () => void`
    - `getSnapshot(): BoardSnapshot` (same object until something changes)
  - `useBoard(controller: BoardController): BoardSnapshot` (one `useSyncExternalStore` call)
  - class `Renderer`:
    - `constructor(base: HTMLCanvasElement, live: HTMLCanvasElement, store: BoardStore)`
    - `resize(fit: Fit, dpr: number): void` (canvas CSS size = board size x `fit.scale`; backing size x `dpr`; transform so that drawing uses board px; full redraw)
    - `frame(): void` (full base redraw when `store.structureVersion` changed or the old base is no longer a prefix of the new base; otherwise draw only the new base strokes; always clear and redraw the live canvas)
  - `drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void` (round caps and joins; one point draws a dot; smoothing is the builder's choice, spec 16)

- [ ] **Step 1: Write the failing tests**

```ts
const ids = () => { let n = 0; return () => `s${++n}`; };

test('a full stroke ends in the store and in history', () => {
  const c = new BoardController(undefined, undefined, ids());
  c.beginStroke('b', '#111111', 8);
  c.addPoint(1, 1); c.addPoint(2, 2);
  c.flush();
  c.addPoint(3, 3);
  c.endStroke();
  expect(c.store.get('s1')).toMatchObject({ pts: [1, 1, 2, 2, 3, 3], done: true });
  expect(c.getSnapshot()).toMatchObject({ canUndo: true, hasVisible: true, drawing: false });
});

test('undo, redo, and clear are ignored while drawing', () => {
  const c = new BoardController(undefined, undefined, ids());
  c.beginStroke('b', '#111111', 8); c.addPoint(1, 1); c.endStroke();
  c.beginStroke('b', '#111111', 8); c.addPoint(5, 5);
  c.undo(); c.clear();
  expect(c.store.visibleIds()).toEqual(['s1', 's2']);
  c.endStroke();
  c.undo();
  expect(c.store.visibleIds()).toEqual(['s1']);
});

test('getSnapshot keeps its identity until a change', () => {
  const c = new BoardController(undefined, undefined, ids());
  const a = c.getSnapshot();
  expect(c.getSnapshot()).toBe(a);
  c.beginStroke('b', '#111111', 8);
  expect(c.getSnapshot()).not.toBe(a);
  expect(c.getSnapshot().drawing).toBe(true);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/engine/board-controller.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `BoardController`, `useBoard`, `Renderer`, and `drawStroke` with the interfaces above**

The snapshot cache key is `store.version`, `history.version`, and `drawing`. `Renderer` keeps the ids it last drew on the base canvas and compares them with the new `base` from `splitLayers`.

- [ ] **Step 4: Run all tests and the type check**

Run: `npm test && npx tsc -b`
Expected: all tests PASS; `tsc` exits 0.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(engine): add BoardController, useBoard, and two-canvas Renderer"
```

### Task 6: Tool settings and keyboard shortcuts

**Files:**
- Create: `src/state/tool-settings.ts`, `src/hooks/useShortcuts.ts`
- Test: `src/state/tool-settings.test.ts`, `src/hooks/useShortcuts.test.tsx`

**Interfaces:**
- Produces:
  - `PALETTE = ['#111111', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#868e96'] as const`
  - `interface ToolSettings { tool: Tool; color: string; width: number }`, `initialToolSettings = { tool: 'b', color: '#111111', width: 8 }`, `WIDTH_STEP = 2`
  - `type ToolAction = { type: 'tool'; tool: Tool } | { type: 'color'; color: string } | { type: 'width'; width: number } | { type: 'widthStep'; delta: number }`
  - `toolReducer(state: ToolSettings, action: ToolAction): ToolSettings` (width clamped to 1..64; a color outside `PALETTE` changes nothing; choosing a color also selects the brush)
  - `useShortcuts(handlers: { brush(): void; eraser(): void; widthDown(): void; widthUp(): void; undo(): void; redo(): void }): void` (listens on `window`; `b`, `e`, `[`, `]`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`; `preventDefault` on undo and redo; ignores events with `isComposing`, with `altKey`, or whose target is an `input`, `textarea`, `select`, or `contenteditable` element)

- [ ] **Step 1: Write the failing tests**

```ts
// tool-settings.test.ts
test('width is clamped and steps by 2', () => {
  let s = toolReducer(initialToolSettings, { type: 'width', width: 99 });
  expect(s.width).toBe(64);
  s = toolReducer({ ...s, width: 1 }, { type: 'widthStep', delta: -WIDTH_STEP });
  expect(s.width).toBe(1);
});
test('a palette color selects the brush; other colors are ignored', () => {
  const er = { ...initialToolSettings, tool: 'e' as const };
  expect(toolReducer(er, { type: 'color', color: '#e03131' })).toMatchObject({ tool: 'b', color: '#e03131' });
  expect(toolReducer(er, { type: 'color', color: '#123456' })).toBe(er);
});

// useShortcuts.test.tsx
function setup() {
  const h = { brush: vi.fn(), eraser: vi.fn(), widthDown: vi.fn(), widthUp: vi.fn(), undo: vi.fn(), redo: vi.fn() };
  renderHook(() => useShortcuts(h));
  return h;
}
test('keys map to handlers', () => {
  const h = setup();
  fireEvent.keyDown(window, { key: 'e' });
  fireEvent.keyDown(window, { key: ']' });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
  expect(h.eraser).toHaveBeenCalledTimes(1);
  expect(h.widthUp).toHaveBeenCalledTimes(1);
  expect(h.undo).toHaveBeenCalledTimes(1);
  expect(h.redo).toHaveBeenCalledTimes(1);
});
test('typing, composing, and Alt are ignored', () => {
  const h = setup();
  const input = document.createElement('input'); document.body.appendChild(input);
  fireEvent.keyDown(input, { key: 'b' });
  fireEvent.keyDown(window, { key: 'b', isComposing: true });
  fireEvent.keyDown(window, { key: 'b', altKey: true });
  expect(h.brush).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/state src/hooks`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `tool-settings.ts` and `useShortcuts` with the interfaces above**

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/state src/hooks`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat: add tool settings reducer and keyboard shortcuts"
```

### Task 7: Pointer input

**Files:**
- Create: `src/engine/stroke-input.ts`
- Test: `src/engine/stroke-input.test.ts`

**Interfaces:**
- Consumes: `BoardController` (`beginStroke`, `addPoint`, `endStroke`), `ToolSettings`, `Fit`, `toBoardPoint`.
- Produces: `attachStrokeInput(target: HTMLElement, controller: BoardController, getSettings: () => ToolSettings, getFit: () => Fit): () => void` (returns a detach function)
  - `pointerdown` with `button === 0` (mouse) or any pen or touch, and no active pointer: `setPointerCapture`, `beginStroke`, first point.
  - `pointermove` of the active pointer: every point from `getCoalescedEvents()` when the browser has it, else the event itself.
  - `pointerup`, `pointercancel`, or `lostpointercapture` of the active pointer: `endStroke` (these events add no point).
  - Events from any other pointer while one is active: ignored.

- [ ] **Step 1: Write the failing tests**

```ts
function pe(type: string, init: Partial<PointerEvent>) {
  return Object.assign(new Event(type), { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 0, clientY: 0, ...init });
}
function setup() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
  el.setPointerCapture = vi.fn();
  const c = new BoardController(undefined, undefined, () => 's1');
  attachStrokeInput(el, c, () => initialToolSettings, () => ({ scale: 1, offsetX: 0, offsetY: 0 }));
  return { el, c };
}
test('down, move, up makes one finished stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', { clientX: 1, clientY: 1 }));
  el.dispatchEvent(pe('pointermove', { clientX: 5, clientY: 5 }));
  el.dispatchEvent(pe('pointerup', {}));
  expect(c.store.get('s1')).toMatchObject({ done: true, pts: [1, 1, 5, 5] });
});
test('pointercancel ends the stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', {}));
  el.dispatchEvent(pe('pointercancel', {}));
  expect(c.getSnapshot().drawing).toBe(false);
  expect(c.store.get('s1')!.done).toBe(true);
});
test('a second pointer is ignored while one is active', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', { clientX: 1, clientY: 1 }));
  el.dispatchEvent(pe('pointermove', { pointerId: 2, clientX: 9, clientY: 9 }));
  el.dispatchEvent(pe('pointerup', { pointerId: 2 }));
  expect(c.getSnapshot().drawing).toBe(true);
  c.flush();
  expect(c.store.get('s1')!.pts).toEqual([1, 1]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/engine/stroke-input.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `attachStrokeInput` with the interface above**

The tests read `store` right after `pointerup` without an animation frame, so `endStroke` must drain the batcher (Task 5 already does this).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(engine): add pointer input with capture and single-pointer rule"
```

### Task 8: Tool panel and top bar

**Files:**
- Create: `src/components/TopBar.tsx`, `src/components/ToolPanel.tsx`, `src/components/ToolPicker.tsx`, `src/components/ColorSwatches.tsx`, `src/components/SizeSlider.tsx`, `src/components/HistoryButtons.tsx`, `src/components/ClearButton.tsx`
- Test: `src/components/ToolPanel.test.tsx`

**Interfaces:**
- Consumes: `ToolSettings`, `ToolAction`, `PALETTE` (Task 6); `BoardSnapshot` (Task 5).
- Produces:
  - `TopBar()`: the name `drawer`, a status badge `Local only`, and a disabled `Share` button with the title `Share comes in the next milestone`.
  - `ToolPanel(props: { settings: ToolSettings; dispatch: (a: ToolAction) => void; snapshot: BoardSnapshot; onUndo(): void; onRedo(): void; onClear(): void })`, composed of:
    - `ToolPicker`: buttons `Brush` and `Eraser` with `aria-pressed`.
    - `ColorSwatches`: 8 buttons, `aria-label` `Color #e03131` and so on, `aria-pressed` on the current color.
    - `SizeSlider`: `<input type="range" min=1 max=64>` labeled `Width`, with the value shown next to it.
    - `HistoryButtons`: `Undo` and `Redo`, disabled from `snapshot.canUndo` and `snapshot.canRedo`.
    - `ClearButton`: `Clear board` (disabled when `!snapshot.hasVisible`). A click shows, inside the panel, the text `Clear the whole board?` with `Clear` and `Cancel`. Only `Clear` calls `onClear`.

- [ ] **Step 1: Write the failing tests**

```tsx
const snap = { canUndo: false, canRedo: false, hasVisible: true, drawing: false };
function setup(over = {}) {
  const p = { settings: initialToolSettings, dispatch: vi.fn(), snapshot: snap, onUndo: vi.fn(), onRedo: vi.fn(), onClear: vi.fn(), ...over };
  render(<ToolPanel {...p} />);
  return p;
}
test('tool, color, and width dispatch actions', async () => {
  const p = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Eraser' }));
  await userEvent.click(screen.getByRole('button', { name: 'Color #e03131' }));
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '20' } });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'tool', tool: 'e' });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'color', color: '#e03131' });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'width', width: 20 });
});
test('undo and redo follow the snapshot', () => {
  setup({ snapshot: { ...snap, canUndo: true } });
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});
test('clear needs a confirmation inside the page', async () => {
  const p = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(p.onClear).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  expect(screen.getByText('Clear the whole board?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(p.onClear).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/components`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the components with the props and copy above**

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/components`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(ui): add top bar and tool panel"
```

### Task 9: Canvas stage, board page, and layout

**Files:**
- Create: `src/components/CanvasStage.tsx`, `src/pages/BoardPage.tsx`, `src/styles/app.css`
- Modify: `src/App.tsx` (render `BoardPage`), `src/main.tsx` (import `styles/app.css`), `src/App.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `CanvasStage(props: { controller: BoardController; settings: ToolSettings })`: a container with the base canvas and the live canvas stacked; a `ResizeObserver` on the container calls `fitBoard` and `renderer.resize(fit, devicePixelRatio)`; one `requestAnimationFrame` loop calls `controller.flush()` then `renderer.frame()`; `attachStrokeInput` on the live canvas; CSS `touch-action: none` on the canvases; everything is detached on unmount.
  - `BoardPage()`: one `BoardController` (created once with `useState(() => new BoardController())`), `useReducer(toolReducer, initialToolSettings)`, `useBoard`, `useShortcuts`, and the layout: `TopBar` (48 px high), `CanvasStage`, `ToolPanel` (240 px wide, on the right). Below 768 px the panel becomes a bar at the bottom.

- [ ] **Step 1: Extend `src/App.test.tsx` with a failing test**

```tsx
test('the board page shows the tools and a disabled Share button', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Brush' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  expect(screen.getByText('Local only')).toBeInTheDocument();
});
```

jsdom has no `ResizeObserver` and no canvas 2D context: in `src/test/setup.ts`, stub `ResizeObserver` with a no-op class and `HTMLCanvasElement.prototype.getContext` with a function that returns `null`, and make `CanvasStage` skip drawing when `getContext('2d')` returns `null`.

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL (the App does not render the board page yet).

- [ ] **Step 3: Implement `CanvasStage`, `BoardPage`, `app.css`, and wire `App` and `main`**

- [ ] **Step 4: Run everything**

Run: `npm test && npm run build && npm run lint`
Expected: all tests PASS; build and lint exit 0.

- [ ] **Step 5: Manual check in a browser (`npm run dev`, open the printed localhost URL)**

Pass when all of these hold:
- A stroke follows the mouse with no visible lag; the eraser paints white.
- Changing color or width affects the next stroke only.
- Undo and redo work by button and by `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`; `B`, `E`, `[`, `]` work.
- Clear asks for confirmation; Undo after Clear brings every stroke back.
- Resizing the window keeps the board centered and sharp, and strokes stay where they were drawn.
- At a width under 768 px the tools move to the bottom bar.
- The browser console shows no errors.

Visual gate per `drawer-be/AGENTS.md`: score it in one line (this is a new user-visible surface; expected 3-4/6, which means one screenshot check and at most one targeted fix).

- [ ] **Step 6: Commit (only if git is enabled)**

```bash
git add -A && git commit -m "feat(ui): add canvas stage and board page layout"
```

---

## Self-review notes

- Spec coverage for M1 (spec 14): canvas, brush, eraser, colors, width, undo, redo, clear, shortcuts, letterbox and `devicePixelRatio` (spec 9.4), the base and live layer rule (9.4), untrusted-data clamps (9.4), narrow-screen layout (10). Out of M1 on purpose: Share, routes, presence, cursors, owner token, `Connection`, `seq` ordering (M2-M4).
- Names are shared across tasks as defined in each Interfaces block: `BoardStore.setDeleted(ids, deleted)`, `History.clear()`, `BoardController.getSnapshot()`, `splitLayers`, `safeStyle`, `toBoardPoint`, `attachStrokeInput`.
