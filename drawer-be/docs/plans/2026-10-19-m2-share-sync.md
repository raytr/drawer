# M2 Share and Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click Share, get a link, and draw together live in two browser tabs: a NestJS backend in `drawer-be` (rooms REST, WebSocket gateway, server-ordered op log, snapshot files) and the client side in `drawer-fe` (Share flow, `/r/<roomId>`, connection with reconnect).

**Architecture:** Part A builds `drawer-be`: `RoomsModule` (ids, `RoomStore` files, `RoomsService`, `POST /api/rooms`) and `BoardModule` (DTO validation, a pure `BoardRoom` rule engine, `BoardHub` that owns loaded rooms and sockets, `BoardGateway` on `/ws`, `SweeperService`). Part B extends the M1 engine: the store orders strokes by server `seq`, a `Connection` speaks the protocol and reconnects, and `BoardController` sends local ops and reconciles on every `welcome` by state, not by replaying a queue.

**Tech Stack:** NestJS 12.1 (`@nestjs/websockets`, `@nestjs/platform-ws`, `@nestjs/config`), `class-validator` 0.15 + `class-transformer` 0.5, Jest 30 + ts-jest, `ws` 8.22 as the test client; React 19.3 + Vite 8.3 + Vitest 5 in `drawer-fe`.

**Spec:** `drawer-be/docs/design/2026-10-17-drawer-design.md` (sections 4, 5, 6, 7, 8.1-8.4, 8.6, 9.1-9.6, 10, 13, 14). M1 plan for context: `drawer-be/docs/plans/2026-10-17-m1-local-board.md`.

## Global Constraints

- Branch `feat/m2-share-sync` in the repo root `/Users/ray/personal/play_ground/drawer`. One conventional commit per task, no AI attribution trailers, no push (the owner pushes).
- M2 scope (spec 14): rooms, gateway, protocol, snapshots, Share, two tabs draw together. Not in M2: presence and cursors (M3); owner token checks, `board.clear`, `board.restore` (M4); quotas, rate limits, size cap, heartbeat, Origin check, `/api/health` (M5). The Clear button is hidden while in a room until M4.
- Protocol (spec 6): WebSocket `/ws` on the same port as REST; every message is JSON `{ "event": "<name>", "data": { ... } }`; max incoming message 64 KiB (`maxPayload: 65536`); first message must be `hello` within 5 s. Every accepted board op gets the next room `seq`. Every accepted op goes to every socket in the room including the sender, except `stroke.points`, which goes to the others only.
- Validation limits (spec 6.5): `roomId` and `userKey` 22 chars base64url; `ownerToken` 43 chars base64url; `name` 1-24 chars; `color` `^#[0-9a-f]{6}$`; `tool` `b` or `e`; `width` integer 1-64; `pts` even-length integer array, at most 128 numbers per batch, `0 <= x < 1920`, `0 <= y < 1080`; at most 5,000 points per stroke.
- Error codes used in M2: `not-found`, `not-yours`, `bad-op`, `not-joined`. After `not-found` the server sends the error and closes the socket.
- Files (spec 7.2): `data/rooms/<roomId>.json` `{ createdAt, firstJoinAt, lastActiveAt, ownerHash }`; `data/rooms/<roomId>.strokes` `{ v: 1, seq, strokes: [{ id, seq, author, tool, color, width, pts, batches, done, deleted }] }`; temp file then `rename`; snapshot 2 s after the last change, at most 10 s after the first unsaved change; on unload write at once and drop deleted strokes.
- Timings (spec 8): abandoned strokes end 30 s after the author's last socket closes; sweeper every 10 min deletes rooms never joined after 10 min and rooms with no sockets idle for 24 h.
- `drawer-be` rules (`backbone.yml`): NestJS feature modules under `src/<feature>/`; files `<name>.<type>.ts`; config only through `@nestjs/config` (one typed config, no `process.env` in feature code); backend returns error codes, never user-facing text. The protected glob `**/*token*` blocks file names containing "token": keep owner-token code in `ids.ts`.
- Server listens on `127.0.0.1` only. Runtime dependencies stay within NestJS packages, `class-validator`, `class-transformer`, `reflect-metadata`, `rxjs`.
- `drawer-fe`: no new runtime dependencies (routing is a 20-line module, not a router library); strokes still never enter React state.
- Writing rules: no emoji; no em or en dashes in code, comments, or copy; UI copy in English.

## Review Focus

1. Two users start strokes at the same instant: both screens must show the same z-order (server seq). Tests: Task 6 "interleaved strokes get one seq order for everyone", Task 9 "ordered() puts seq strokes first, by seq".
2. The network drops mid-stroke and comes back: the stroke completes with no duplicated or missing points. Tests: Task 5 "a repeated batch number is ignored", Task 11 "welcome resends only the points the server lacks".
3. The backend restarts while people draw: strokes survive (shutdown writes snapshots) and clients resend what the server lacks. Test: Task 6 "strokes survive a server restart".
4. Two tabs open the link at the same moment while the room is on disk only, or someone rejoins right after the last person left: one room in memory, no stale snapshot. Tests: Task 2 "a read waits for queued writes", Task 6 "two hellos at once load the room once", Task 6 "a rejoin right after the last leave sees every stroke".
5. Malformed or hostile messages (not JSON, unknown event, wrong types, oversized batch): ignored or `bad-op`, the server keeps running and the socket stays usable. Tests: Task 4 DTO cases, Task 6 "garbage does not break the socket".

---

## Part A: drawer-be

### Task 1: Scaffold the NestJS app with typed config

**Files:**
- Create in `drawer-be/` from the NestJS 12 template (generate with `npx @nestjs/cli@12.0.8 new drawer-be --directory <scratchpad>/nest-app --skip-git --skip-install --package-manager npm --strict`, then copy only): `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `jest.config.ts`, `oxlint.json`, `.prettierrc`, `test/jest-e2e.json`, `src/main.ts`, `src/app.module.ts`. Do not copy the hello-world controller, service, or their tests.
- Create: `src/config/app.config.ts`
- Modify: `drawer-be/.gitignore` (add below the kit block: `node_modules/`, `dist/`, `coverage/`, `data/`)
- Test: `src/config/app.config.spec.ts`

**Interfaces:**
- Produces:
  - `appConfig = registerAs('app', () => loadAppConfig(process.env))` and `type AppConfig = ConfigType<typeof appConfig>`; inject with `@Inject(appConfig.KEY) cfg: AppConfig`.
  - `loadAppConfig(env: Record<string, string | undefined>): { port: number; host: string; dataDir: string; helloTimeoutMs: number; snapshotDebounceMs: number; snapshotMaxDelayMs: number; abandonedStrokeMs: number; unjoinedRoomTtlMs: number; idleRoomTtlMs: number; sweepIntervalMs: number }`. Defaults: `port` 3000 (env `PORT`), `host` `127.0.0.1`, `dataDir` `data` (env `DATA_DIR`), 5000, 2000, 10000, 30000, 600000, 86400000, 600000.
  - `main.ts`: `app.setGlobalPrefix('api')`, `app.useWebSocketAdapter(new WsAdapter(app))`, `app.enableShutdownHooks()`, `listen(cfg.port, cfg.host)`.
  - Scripts: `npm test` (unit, `src/**/*.spec.ts`), `npm run test:e2e` (`test/*.e2e-spec.ts`), `npm run build`, `npm run lint`.

- [ ] **Step 1: Generate the template in the scratchpad and copy the listed files; add `@nestjs/websockets@12.1.3 @nestjs/platform-ws@12.1.3 @nestjs/config@12.0.1 class-validator@0.15.1 class-transformer@0.5.1` and dev `ws@8.22.0 @types/ws@8.18.2`; run `npm install`**

Expected: `npm run build` exits 0.

- [ ] **Step 2: Write the failing test**

```ts
import { loadAppConfig } from './app.config';

it('uses the spec defaults', () => {
  expect(loadAppConfig({})).toEqual({
    port: 3000, host: '127.0.0.1', dataDir: 'data', helloTimeoutMs: 5000, snapshotDebounceMs: 2000,
    snapshotMaxDelayMs: 10000, abandonedStrokeMs: 30000, unjoinedRoomTtlMs: 600000,
    idleRoomTtlMs: 86400000, sweepIntervalMs: 600000,
  });
});

it('reads PORT and DATA_DIR', () => {
  expect(loadAppConfig({ PORT: '4100', DATA_DIR: '/tmp/x' })).toMatchObject({ port: 4100, dataDir: '/tmp/x' });
});
```

- [ ] **Step 3: Run to see it fail**

Run (in `drawer-be`): `npm test -- src/config`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `app.config.ts` and wire `ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })` in `AppModule` and the `main.ts` lines above**

- [ ] **Step 5: Run tests, build, lint**

Run: `npm test && npm run build && npm run lint`
Expected: 2 tests pass; build and lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add drawer-be && git commit -m "chore: scaffold drawer-be NestJS app with typed config"
```

### Task 2: Ids and RoomStore

**Files:**
- Create: `src/rooms/ids.ts`, `src/rooms/room-store.ts`, `src/rooms/room-files.ts`
- Test: `src/rooms/ids.spec.ts`, `src/rooms/room-store.spec.ts`

**Interfaces:**
- Produces in `ids.ts`: `newRoomId(): string` (16 random bytes, base64url, 22 chars), `newOwnerKey(): string` (32 bytes, 43 chars), `hashKey(value: string): string` (SHA-256 hex), `isRoomId(v: unknown): v is string`, `isUserKey(v: unknown): v is string` (both `^[A-Za-z0-9_-]{22}$`), `sameHash(a: string, b: string): boolean` (constant-time).
- Produces in `room-files.ts`: `interface RoomMeta { createdAt: number; firstJoinAt: number | null; lastActiveAt: number; ownerHash: string }`, `interface StoredStroke { id: string; seq: number; author: string; tool: 'b' | 'e'; color: string; width: number; pts: number[]; batches: number; done: boolean; deleted: boolean }`, `interface StrokesFile { v: 1; seq: number; strokes: StoredStroke[] }`.
- Produces in `room-store.ts`, class `RoomStore` (`@Injectable`, dir = `<cfg.dataDir>/rooms`, created on first write): `writeMeta(id, meta): Promise<void>`, `readMeta(id): Promise<RoomMeta | null>`, `listMetas(): Promise<Array<{ id: string; meta: RoomMeta }>>`, `writeStrokes(id, file): Promise<void>`, `readStrokes(id): Promise<StrokesFile | null>`, `deleteRoom(id): Promise<void>` (both files; missing files are fine). Every write: a temp file with a unique name in the same dir, then `rename`. Writes and deletes of one room id run one after another (a promise chain per id), and reads of that id wait for the chain, so the last call wins on disk and a read never sees an older file than a write that was already called.

- [ ] **Step 1: Write the failing tests**

```ts
// ids.spec.ts
it('makes 22 and 43 char base64url ids', () => {
  expect(newRoomId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(newOwnerKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newRoomId()).not.toBe(newRoomId());
});
it('hashKey is sha256 hex and sameHash compares', () => {
  expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sameHash(hashKey('a'), hashKey('a'))).toBe(true);
  expect(sameHash(hashKey('a'), hashKey('b'))).toBe(false);
});

// room-store.spec.ts (dataDir = fs.mkdtempSync(os.tmpdir() + '/drawer-'))
it('writes and reads meta and strokes; lists metas; deletes', async () => {
  const store = new RoomStore({ dataDir } as AppConfig);
  const meta = { createdAt: 1, firstJoinAt: null, lastActiveAt: 1, ownerHash: 'h' };
  await store.writeMeta('A'.repeat(22), meta);
  await store.writeStrokes('A'.repeat(22), { v: 1, seq: 0, strokes: [] });
  expect(await store.readMeta('A'.repeat(22))).toEqual(meta);
  expect(await store.listMetas()).toEqual([{ id: 'A'.repeat(22), meta }]);
  await store.deleteRoom('A'.repeat(22));
  expect(await store.readMeta('A'.repeat(22))).toBeNull();
  expect(await store.readStrokes('A'.repeat(22))).toBeNull();
});
it('leaves no temp files behind', async () => {
  const store = new RoomStore({ dataDir } as AppConfig);
  await store.writeStrokes('B'.repeat(22), { v: 1, seq: 3, strokes: [] });
  expect(fs.readdirSync(path.join(dataDir, 'rooms'))).toEqual(['B'.repeat(22) + '.strokes']);
});
it('a read waits for queued writes; the last write wins', async () => {
  const store = new RoomStore({ dataDir } as AppConfig);
  void store.writeStrokes('C'.repeat(22), { v: 1, seq: 1, strokes: [] });
  void store.writeStrokes('C'.repeat(22), { v: 1, seq: 2, strokes: [] });
  expect((await store.readStrokes('C'.repeat(22)))!.seq).toBe(2);
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/rooms`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three files with the interfaces above (`node:crypto`, `node:fs/promises`)**

- [ ] **Step 4: Run**: `npm test -- src/rooms`. Expected: 5 tests PASS.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(rooms): add ids and file-based RoomStore"`

### Task 3: RoomsService and POST /api/rooms

**Files:**
- Create: `src/rooms/rooms.service.ts`, `src/rooms/rooms.controller.ts`, `src/rooms/rooms.module.ts`; Modify: `src/app.module.ts`
- Test: `src/rooms/rooms.service.spec.ts`, `test/rooms.e2e-spec.ts`, `test/helpers.ts`

**Interfaces:**
- Consumes: `RoomStore`, ids, `RoomMeta`.
- Produces, `RoomsService` (exported by `RoomsModule`): `onModuleInit()` loads all metas into a `Map`; `create(now = Date.now()): Promise<{ roomId: string; ownerToken: string }>` (writes meta with `ownerHash = hashKey(ownerToken)`; never stores the plain key); `exists(id): boolean`; `meta(id): RoomMeta | undefined`; `markJoined(id, now): Promise<void>` (sets `firstJoinAt` once); `markIdle(id, now): Promise<void>` (sets `lastActiveAt`); `delete(id): Promise<void>` (removes it from the map and calls `RoomStore.deleteRoom`); `all(): Array<[string, RoomMeta]>`.
- Produces, `RoomsController`: `POST /api/rooms` -> `201 { roomId, ownerToken }`.
- Produces, `test/helpers.ts`: `startApp(overrides?: Partial<AppConfig>): Promise<{ app: INestApplication; port: number; dataDir: string }>` (temp `dataDir`, `app.listen(0, '127.0.0.1')`, overrides `appConfig.KEY`).

- [ ] **Step 1: Write the failing tests**

```ts
// rooms.service.spec.ts
it('create stores only the hash, and a restart sees the room', async () => {
  const cfg = { dataDir } as AppConfig;
  const a = new RoomsService(new RoomStore(cfg));
  await a.onModuleInit();
  const { roomId, ownerToken } = await a.create(1000);
  expect(a.meta(roomId)).toEqual({ createdAt: 1000, firstJoinAt: null, lastActiveAt: 1000, ownerHash: hashKey(ownerToken) });
  expect(fs.readFileSync(path.join(dataDir, 'rooms', roomId + '.json'), 'utf8')).not.toContain(ownerToken);
  const b = new RoomsService(new RoomStore(cfg));
  await b.onModuleInit();
  expect(b.exists(roomId)).toBe(true);
});
it('markJoined sets firstJoinAt once', async () => {
  const s = new RoomsService(new RoomStore({ dataDir } as AppConfig)); await s.onModuleInit();
  const { roomId } = await s.create(1);
  await s.markJoined(roomId, 5); await s.markJoined(roomId, 9);
  expect(s.meta(roomId)!.firstJoinAt).toBe(5);
});

// test/rooms.e2e-spec.ts
it('POST /api/rooms returns 201 with a room id and an owner token', async () => {
  const { app } = await startApp();
  const res = await request(app.getHttpServer()).post('/api/rooms').expect(201);
  expect(res.body.roomId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(res.body.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await app.close();
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/rooms && npm run test:e2e -- rooms`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement service, controller, module, `startApp`**

- [ ] **Step 4: Run**: same command. Expected: all PASS.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(rooms): add RoomsService and POST /api/rooms"`

### Task 4: Message DTOs and validation

**Files:**
- Create: `src/board/messages.ts`
- Test: `src/board/messages.spec.ts`

**Interfaces:**
- Produces: DTO classes with `class-validator` decorators: `HelloDto { roomId; userKey; ownerToken?; name; color }`, `StrokeStartDto { strokeId; tool; color; width }`, `StrokePointsDto { strokeId; n; pts }`, `StrokeRefDto { strokeId }` (for `stroke.end`, `stroke.undo`, `stroke.redo`). `strokeId` uses the same 22-char base64url rule as `userKey`.
- Produces: `parseMessage<T extends object>(cls: new () => T, data: unknown): T | null` (`plainToInstance` + `validateSync` with `whitelist: true`, `forbidNonWhitelisted: true`; `null` on any error or when `data` is not a plain object).
- `pts` rule (custom validator): array, even length, at most 128 numbers, all integers, x in `0..1919`, y in `0..1079`. `n`: integer >= 0. `width`: integer 1-64.

- [ ] **Step 1: Write the failing tests**

```ts
const id = 'A'.repeat(22);
it.each([
  [StrokePointsDto, { strokeId: id, n: 0, pts: [0, 0, 1919, 1079] }, true],
  [StrokePointsDto, { strokeId: id, n: 0, pts: [1, 2, 3] }, false],          // odd length
  [StrokePointsDto, { strokeId: id, n: 0, pts: [1920, 0] }, false],         // x out of range
  [StrokePointsDto, { strokeId: id, n: 0, pts: new Array(130).fill(1) }, false],
  [StrokePointsDto, { strokeId: id, n: -1, pts: [] }, false],
  [StrokeStartDto, { strokeId: id, tool: 'b', color: '#e03131', width: 8 }, true],
  [StrokeStartDto, { strokeId: id, tool: 'x', color: '#e03131', width: 8 }, false],
  [StrokeStartDto, { strokeId: id, tool: 'b', color: 'red', width: 8 }, false],
  [StrokeStartDto, { strokeId: id, tool: 'b', color: '#e03131', width: 65 }, false],
  [StrokeStartDto, { strokeId: id, tool: 'b', color: '#e03131', width: 8, extra: 1 }, false],
  [HelloDto, { roomId: id, userKey: id, name: 'Fox', color: '#1971c2' }, true],
  [HelloDto, { roomId: id, userKey: id, name: '', color: '#1971c2' }, false],
  [HelloDto, { roomId: id, userKey: id, name: 'x'.repeat(25), color: '#1971c2' }, false],
  [StrokeRefDto, 'not an object', false],
])('%p %j -> %p', (cls, data, ok) => {
  expect(parseMessage(cls as new () => object, data) !== null).toBe(ok);
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/board/messages`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `messages.ts`**

- [ ] **Step 4: Run**: Expected: 14 cases PASS.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(board): add message DTOs and validation"`

### Task 5: BoardRoom rule engine

**Files:**
- Create: `src/board/board-room.ts`, `src/board/protocol.ts`
- Test: `src/board/board-room.spec.ts`

**Interfaces:**
- Consumes: `StoredStroke`, `StrokesFile`, the DTOs.
- Produces in `protocol.ts`: `type OpKind = 'stroke.start' | 'stroke.points' | 'stroke.end' | 'stroke.undo' | 'stroke.redo'`; `type OpEvent = { seq: number; by: string | null; kind: OpKind; strokeId: string; tool?: 'b' | 'e'; color?: string; width?: number; n?: number; pts?: number[] }`; `type WelcomeStroke = Omit<StoredStroke, 'author'> & { mine: boolean }`; `type ErrorCode = 'not-found' | 'not-yours' | 'bad-op' | 'not-joined'`.
- Produces in `board-room.ts`, class `BoardRoom` (no Nest, no I/O):
  - `constructor(file?: StrokesFile)`; `readonly seq: number`; `readonly dirty: boolean` plus `markClean(): void`
  - `apply(author: string, kind: OpKind, data: StrokeStartDto | StrokePointsDto | StrokeRefDto): ApplyResult` where `ApplyResult = { kind: 'op'; op: Omit<OpEvent, 'by'>; echo: boolean } | { kind: 'ignore' } | { kind: 'error'; code: ErrorCode; ref?: string }`. `echo` is false only for `stroke.points`.
  - Rules: `stroke.start` with a known `strokeId` -> ignore. Points, end, undo, redo on an unknown stroke -> ignore. Any op on another author's stroke -> `error not-yours` with `ref`. Points: done -> ignore; `n < batches` -> ignore; `n > batches` -> `error bad-op`; else append (cap 5,000 points, extra numbers dropped) and `batches++`. End, undo, redo already in that state -> ignore. Every accepted op takes `++seq`.
  - `welcomeFor(author: string): WelcomeStroke[]` (seq order, `mine = stroke.author === author`)
  - `endAllUnfinished(author?: string): Array<Omit<OpEvent, 'by'>>` (marks done and returns one `stroke.end` op per stroke; all authors when `author` is omitted)
  - `toFile(compact: boolean): StrokesFile` (`compact` drops deleted strokes)

- [ ] **Step 1: Write the failing tests**

```ts
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const S1 = 'S'.repeat(21) + '1', S2 = 'S'.repeat(21) + '2';
const start = (r: BoardRoom, who: string, id: string) => r.apply(who, 'stroke.start', { strokeId: id, tool: 'b', color: '#111111', width: 8 });

it('every accepted op takes the next seq; points are not echoed', () => {
  const r = new BoardRoom();
  expect(start(r, A, S1)).toMatchObject({ kind: 'op', echo: true, op: { seq: 1, kind: 'stroke.start' } });
  expect(r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] })).toMatchObject({ kind: 'op', echo: false, op: { seq: 2 } });
  expect(r.apply(A, 'stroke.end', { strokeId: S1 })).toMatchObject({ op: { seq: 3 } });
});
it('a repeated batch number is ignored; a gap is bad-op', () => {
  const r = new BoardRoom(); start(r, A, S1);
  r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] });
  expect(r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] })).toEqual({ kind: 'ignore' });
  expect(r.apply(A, 'stroke.points', { strokeId: S1, n: 2, pts: [3, 4] })).toEqual({ kind: 'error', code: 'bad-op', ref: S1 });
  expect(r.welcomeFor(A)[0]).toMatchObject({ pts: [1, 2], batches: 1 });
});
it('only the author can add points, end, undo, or redo', () => {
  const r = new BoardRoom(); start(r, A, S1);
  expect(r.apply(B, 'stroke.undo', { strokeId: S1 })).toEqual({ kind: 'error', code: 'not-yours', ref: S1 });
  expect(r.apply(B, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] })).toMatchObject({ code: 'not-yours' });
});
it('a duplicate start and repeated undo are ignored', () => {
  const r = new BoardRoom(); start(r, A, S1);
  expect(start(r, A, S1)).toEqual({ kind: 'ignore' });
  r.apply(A, 'stroke.undo', { strokeId: S1 });
  expect(r.apply(A, 'stroke.undo', { strokeId: S1 })).toEqual({ kind: 'ignore' });
});
it('welcomeFor marks mine; toFile(true) drops deleted strokes; a file round-trips', () => {
  const r = new BoardRoom(); start(r, A, S1); start(r, B, S2); r.apply(B, 'stroke.undo', { strokeId: S2 });
  expect(r.welcomeFor(A).map((s) => [s.id, s.mine])).toEqual([[S1, true], [S2, false]]);
  const file = r.toFile(true);
  expect(file.strokes.map((s) => s.id)).toEqual([S1]);
  expect(new BoardRoom(file).seq).toBe(r.seq);
});
it('endAllUnfinished ends only that author when given', () => {
  const r = new BoardRoom(); start(r, A, S1); start(r, B, S2);
  expect(r.endAllUnfinished(A).map((o) => o.strokeId)).toEqual([S1]);
  expect(r.welcomeFor(A).map((s) => s.done)).toEqual([true, false]);
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/board/board-room`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `protocol.ts` and `BoardRoom`**

- [ ] **Step 4: Run**: Expected: 6 tests PASS.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(board): add BoardRoom op rules"`

### Task 6: BoardHub and BoardGateway

**Files:**
- Create: `src/board/board-hub.ts`, `src/board/board.gateway.ts`, `src/board/board.module.ts`; Modify: `src/app.module.ts`
- Test: `test/board.e2e-spec.ts`; Modify: `test/helpers.ts` (add `connect`)

**Interfaces:**
- Consumes: `RoomsService`, `RoomStore`, `BoardRoom`, DTOs, `parseMessage`, `hashKey`, `AppConfig`.
- Produces, `BoardHub` (`@Injectable`, implements `OnApplicationShutdown`):
  - `join(socket: WebSocket, data: unknown): Promise<void>`: invalid DTO -> `error bad-op`; second `hello` on a socket -> `error bad-op`; unknown room -> `error not-found` then `socket.close()`; else load the room (from `readStrokes` or empty), `markJoined`, give the socket `memberId` (8 base64url chars) and `author = hashKey(userKey)`, cancel that author's abandoned timer, and send `welcome { seq, you: { memberId, isOwner }, strokes: room.welcomeFor(author) }` with `isOwner = ownerToken !== undefined && sameHash(hashKey(ownerToken), meta.ownerHash)`. (`full` and `members` arrive in M3/M5.) Concurrent hellos for a room that is still loading share one load promise (`Map<roomId, Promise<BoardRoom>>`); a socket that closed during the load is not added.
  - `op(socket: WebSocket, kind: OpKind, data: unknown): void`: not joined -> `error not-joined`; invalid DTO -> `error bad-op`; then `room.apply`; on `op` send `{ event: 'op', data: { ...op, by: memberId } }` to every socket of the room (the sender too unless `echo` is false); on `error` send it to the sender; schedule a snapshot.
  - `leave(socket: WebSocket): Promise<void>`: remove; if the author has no other socket in the room, start the abandoned timer (`abandonedStrokeMs`) that broadcasts `endAllUnfinished(author)` ops with `by: null`; if the room has no sockets, `endAllUnfinished()`, clear the room's timers, call `writeStrokes(toFile(true))`, remove the room from memory at once (the `RoomStore` queue makes the next load read this write), `markIdle(now)`.
  - Snapshot scheduling: write `toFile(false)` `snapshotDebounceMs` after the last change, but no later than `snapshotMaxDelayMs` after the first unsaved change.
  - `isLoaded(id: string): boolean`; `onApplicationShutdown()` writes every loaded room (`toFile(false)`), clears timers, closes sockets with code 1001.
  - `send(socket, event, data)` checks `readyState === OPEN`.
- Produces, `BoardGateway`: `@WebSocketGateway({ path: '/ws', maxPayload: 65536 })`, `handleConnection(socket)` starts a `helloTimeoutMs` timer that closes the socket if it never joined; `@SubscribeMessage('hello')` and one handler per `OpKind` delegate to the hub; `handleDisconnect(socket)` calls `leave`.
- Produces, `test/helpers.ts`: `connect(port: number): Promise<TestClient>` with `send(event: string, data: unknown): void`, `sendRaw(text: string): void`, `next(event: string, match?: (data: any) => boolean, timeoutMs = 2000): Promise<any>`, `closed(): Promise<number>`, `close(): void`.

- [ ] **Step 1: Write the failing e2e tests (`startApp({ snapshotDebounceMs: 50, snapshotMaxDelayMs: 200, abandonedStrokeMs: 100, helloTimeoutMs: 300 })`)**

```ts
it('the creator is the owner; others are not', async () => { /* A hellos with the ownerToken from POST -> welcome you.isOwner true;
  B hellos without it -> false; C with a wrong 43-char token -> false */ });
it('two clients draw together; late joiner gets the full board', async () => { /* A and B hello; A start+points+end;
  B receives op stroke.start (seq 1), op stroke.points (n 0), op stroke.end; A receives the start and end echoes but not points;
  C joins later and its welcome has the stroke with pts, batches 1, done true, mine false */ });
it('interleaved strokes get one seq order for everyone', async () => { /* A start S1, B start S2 back to back;
  collect the op events on A, B, and a third client C: the seq -> strokeId mapping is identical on all three */ });
it('undo of another user\'s stroke gets not-yours', async () => { /* B sends stroke.undo for A's stroke -> error { code: 'not-yours', ref } */ });
it('hello for an unknown room gets not-found and a close', async () => { /* error not-found, then closed() resolves */ });
it('garbage does not break the socket', async () => { /* sendRaw('not json'), send('nope', {}), send('stroke.start', { strokeId: 1 })
  -> error bad-op for the last one; then a valid stroke.start still gets its echo */ });
it('the last leave writes a compacted snapshot and the room reloads', async () => { /* A draws S1, draws S2 and undoes it, closes;
  .strokes file has only S1; a new client's welcome has S1 */ });
it('two hellos at once load the room once', async () => { /* room on disk only (draw, last leave); A and B send hello without
  awaiting; after both welcomes, A starts S2 and B receives that op */ });
it('a rejoin right after the last leave sees every stroke', async () => { /* A draws S1 and closes; B hellos at once, without waiting;
  B's welcome has S1 with all its points */ });
it('a socket that never sends hello is closed', async () => { /* connect, send nothing -> closed() resolves within ~300 ms */ });
it('strokes survive a server restart', async () => { /* draw, await app.close(), startApp on the same dataDir, hello -> welcome has the stroke */ });
it('an abandoned unfinished stroke is ended by the server', async () => { /* A starts S1 and disconnects; B receives op stroke.end with by null after ~100 ms */ });
```

Write each body with `connect`, `send`, and `next` exactly as the comment describes.

- [ ] **Step 2: Run to see them fail**: `npm run test:e2e -- board`. Expected: FAIL (no gateway: the WebSocket connection is refused or gets no `welcome`).

- [ ] **Step 3: Implement `BoardHub`, `BoardGateway`, `BoardModule`; register in `AppModule`**

- [ ] **Step 4: Run all tests, build, lint**: `npm test && npm run test:e2e && npm run build && npm run lint`. Expected: all PASS; exits 0.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(board): add WebSocket gateway and room hub"`

### Task 7: Sweeper

**Files:**
- Create: `src/board/sweeper.service.ts`; Modify: `src/board/board.module.ts`
- Test: `src/board/sweeper.service.spec.ts`

**Interfaces:**
- Consumes: `RoomsService.all()`, `RoomsService.delete`, `RoomStore.deleteRoom`, `BoardHub.isLoaded`, `AppConfig`.
- Produces, `SweeperService`: `sweep(now: number): Promise<string[]>` (returns deleted room ids); an interval of `sweepIntervalMs` started in `onModuleInit` and cleared in `onModuleDestroy`. Delete when `firstJoinAt === null && now - createdAt > unjoinedRoomTtlMs`, or when `!isLoaded(id) && firstJoinAt !== null && now - lastActiveAt > idleRoomTtlMs`.

- [ ] **Step 1: Write the failing test**

```ts
it('deletes unjoined rooms after 10 min and idle rooms after 24 h, never loaded rooms', async () => {
  const metas: Array<[string, RoomMeta]> = [
    ['new', { createdAt: 0, firstJoinAt: null, lastActiveAt: 0, ownerHash: 'h' }],
    ['fresh', { createdAt: 0, firstJoinAt: null, lastActiveAt: 0, ownerHash: 'h' }],
    ['idle', { createdAt: 0, firstJoinAt: 1, lastActiveAt: 0, ownerHash: 'h' }],
    ['busy', { createdAt: 0, firstJoinAt: 1, lastActiveAt: 0, ownerHash: 'h' }],
  ];
  metas[1][1].createdAt = 590_000;
  const deleted: string[] = [];
  const rooms = { all: () => metas, delete: async (id: string) => { deleted.push(id); } };
  const hub = { isLoaded: (id: string) => id === 'busy' };
  const s = new SweeperService(rooms as never, hub as never, { unjoinedRoomTtlMs: 600_000, idleRoomTtlMs: 86_400_000, sweepIntervalMs: 600_000 } as AppConfig);
  expect(await s.sweep(86_400_001)).toEqual(['new', 'idle']);
});
```

`RoomsService.delete` must also call `RoomStore.deleteRoom` (Task 3 owns that).

- [ ] **Step 2: Run to see it fail**: `npm test -- src/board/sweeper`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `SweeperService`**

- [ ] **Step 4: Run**: `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**: `git add drawer-be && git commit -m "feat(board): add room sweeper"`

## Part B: drawer-fe

### Task 8: Protocol types, identity, and the rooms API

**Files:**
- Create: `src/engine/protocol.ts`, `src/engine/identity.ts`, `src/api/rooms.ts`
- Test: `src/engine/identity.test.ts`, `src/api/rooms.test.ts`

**Interfaces:**
- Produces in `protocol.ts`: the client copy of the server shapes: `OpKind`, `OpEvent`, `WelcomeStroke`, `WelcomeData = { seq: number; you: { memberId: string; isOwner: boolean }; strokes: WelcomeStroke[] }`, `ErrorData = { code: string; ref?: string }`, `HelloData = { roomId: string; userKey: string; ownerToken?: string; name: string; color: string }`, `ServerMessage = { event: 'welcome'; data: WelcomeData } | { event: 'op'; data: OpEvent } | { event: 'error'; data: ErrorData }`.
- Produces in `identity.ts`: `getIdentity(local: Storage = localStorage, session: Storage = sessionStorage): { userKey: string; name: string; color: string }` (`userKey` in `sessionStorage` `drawer.userKey`, made by `newStrokeId()`; `{ name, color }` in `localStorage` `drawer.identity`, name from `['Fox', 'Owl', 'Cat', 'Bear', 'Otter', 'Lynx', 'Crane', 'Seal']`, color from `PALETTE`), `saveOwnerToken(roomId: string, token: string, local: Storage = localStorage): void`, `loadOwnerToken(roomId: string, local: Storage = localStorage): string | null` (key `drawer.owner.<roomId>`).
- Produces in `api/rooms.ts`: `createRoom(fetchImpl: typeof fetch = fetch): Promise<{ roomId: string; ownerToken: string }>` (`POST /api/rooms`; throws `Error('create-room-failed')` unless status 201).

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps userKey per tab and name/color per browser', () => {
  const a = getIdentity(localStorage, sessionStorage);
  expect(a.userKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(getIdentity(localStorage, sessionStorage)).toEqual(a);
  sessionStorage.clear();
  const b = getIdentity(localStorage, sessionStorage);
  expect(b.userKey).not.toBe(a.userKey);
  expect([b.name, b.color]).toEqual([a.name, a.color]);
});
it('stores the owner token per room', () => {
  saveOwnerToken('R'.repeat(22), 't'.repeat(43));
  expect(loadOwnerToken('R'.repeat(22))).toBe('t'.repeat(43));
  expect(loadOwnerToken('X'.repeat(22))).toBeNull();
});
it('createRoom posts and returns the ids; non-201 throws', async () => {
  const ok = vi.fn(async () => new Response(JSON.stringify({ roomId: 'r', ownerToken: 't' }), { status: 201 }));
  expect(await createRoom(ok as typeof fetch)).toEqual({ roomId: 'r', ownerToken: 't' });
  expect(ok).toHaveBeenCalledWith('/api/rooms', { method: 'POST' });
  const bad = vi.fn(async () => new Response('', { status: 503 }));
  await expect(createRoom(bad as typeof fetch)).rejects.toThrow('create-room-failed');
});
```

- [ ] **Step 2: Run to see them fail**: (in `drawer-fe`) `npm test -- src/engine/identity src/api`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules**

- [ ] **Step 4: Run**: Expected: 3 tests PASS.

- [ ] **Step 5: Commit**: `git add drawer-fe && git commit -m "feat: add protocol types, identity, and rooms API client"`

### Task 9: Seq-ordered store, remote ops, and history rebuild

**Files:**
- Modify: `src/engine/board-store.ts`, `src/engine/history.ts`
- Test: `src/engine/board-store.test.ts`, `src/engine/history.test.ts` (add cases)

**Interfaces:**
- Consumes: `OpEvent`, `WelcomeStroke`.
- Produces on `BoardStore`:
  - `ordered()`: strokes with a seq first, by seq; then pending strokes by `localOrder`. Keep `order` sorted when a stroke is added or gets its seq, not on each call: the renderer calls `ordered()` every frame, and its prefix check already redraws the base layer when a stroke moves.
  - `applyOp(op: OpEvent): void`: `stroke.start` for a known id sets its `seq` when it is null; for an unknown id adds a remote stroke (`mine: false`, `done: false`, `pts: []`); `stroke.points` appends `op.pts` (same 5,000 cap; ignores done or unknown); `stroke.end` ends; `stroke.undo` and `stroke.redo` set `deleted` through `setDeleted`.
  - `loadWelcome(strokes: readonly WelcomeStroke[]): void`: drops every non-mine stroke not in the list; adds or replaces remote strokes from the list; for a mine stroke that exists locally only sets `seq` (local state wins, because only this tab changes its own strokes and the local copy can hold points the server lacks); adds mine strokes that exist only on the server; keeps local strokes the server does not have. Bumps `structureVersion` once.
  - `adoptAllAsLocal(): void`: drops deleted strokes; every remaining stroke becomes `mine: true`, `seq: null`, `done: true`.
- Produces on `History`: `rebuild(strokeIds: readonly string[]): void` (undo stack = these stroke entries in order; redo empty); `onApply: ((entry: HistoryEntry, undo: boolean) => void) | null` (called after `undo()` or `redo()` applies an entry).

- [ ] **Step 1: Write the failing tests**

```ts
const op = (o: Partial<OpEvent>): OpEvent => ({ seq: 1, by: 'm', kind: 'stroke.start', strokeId: 'x', tool: 'b', color: '#111111', width: 8, ...o });
it('ordered() puts seq strokes first, by seq', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'mine', tool: 'b', color: '#111111', width: 8 });
  s.applyOp(op({ seq: 7, strokeId: 'late' }));
  s.applyOp(op({ seq: 3, strokeId: 'early' }));
  expect(s.ordered().map((x) => x.id)).toEqual(['early', 'late', 'mine']);
  s.applyOp(op({ seq: 5, strokeId: 'mine' }));
  expect(s.ordered().map((x) => x.id)).toEqual(['early', 'mine', 'late']);
});
it('remote points, end, undo', () => {
  const s = new BoardStore();
  s.applyOp(op({ strokeId: 'r' }));
  s.applyOp(op({ seq: 2, kind: 'stroke.points', strokeId: 'r', n: 0, pts: [1, 2] }));
  s.applyOp(op({ seq: 3, kind: 'stroke.end', strokeId: 'r' }));
  s.applyOp(op({ seq: 4, kind: 'stroke.undo', strokeId: 'r' }));
  expect(s.get('r')).toMatchObject({ mine: false, pts: [1, 2], done: true, deleted: true });
});
it('loadWelcome keeps local mine state, replaces remote strokes, keeps unsent local strokes', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'm1', tool: 'b', color: '#111111', width: 8 }); s.appendPoints('m1', [5, 5]);
  s.startStroke({ id: 'm2', tool: 'b', color: '#111111', width: 8 });
  s.applyOp(op({ seq: 1, strokeId: 'gone' }));
  s.loadWelcome([
    { id: 'm1', seq: 2, tool: 'b', color: '#111111', width: 8, pts: [], batches: 0, done: false, deleted: false, mine: true },
    { id: 'r1', seq: 3, tool: 'b', color: '#e03131', width: 4, pts: [9, 9], batches: 1, done: true, deleted: false, mine: false },
  ]);
  expect(s.ordered().map((x) => [x.id, x.seq])).toEqual([['m1', 2], ['r1', 3], ['m2', null]]);
  expect(s.get('m1')!.pts).toEqual([5, 5]);
  expect(s.get('gone')).toBeUndefined();
});
it('adoptAllAsLocal turns visible strokes into pending own strokes', () => {
  const s = new BoardStore();
  s.applyOp(op({ seq: 1, strokeId: 'r' })); s.applyOp(op({ seq: 2, strokeId: 'd' })); s.applyOp(op({ seq: 3, kind: 'stroke.undo', strokeId: 'd' }));
  s.adoptAllAsLocal();
  expect(s.ordered().map((x) => [x.id, x.seq, x.mine, x.done])).toEqual([['r', null, true, true]]);
});
// history.test.ts
it('rebuild sets the undo stack; onApply reports undo and redo', () => {
  const store = new BoardStore(); const h = new History(store);
  store.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  const seen: Array<[string, boolean]> = [];
  h.onApply = (e, undo) => seen.push([e.kind === 'stroke' ? e.id : 'clear', undo]);
  h.rebuild(['a']);
  expect(h.canRedo).toBe(false);
  h.undo(); h.redo();
  expect(seen).toEqual([['a', true], ['a', false]]);
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/engine/board-store src/engine/history`. Expected: the new cases FAIL (methods missing).

- [ ] **Step 3: Implement the methods above**

- [ ] **Step 4: Run the whole suite**: `npm test`. Expected: all PASS (M1 tests unchanged).

- [ ] **Step 5: Commit**: `git add drawer-fe && git commit -m "feat(engine): order strokes by seq and apply remote ops"`

### Task 10: Connection

**Files:**
- Create: `src/engine/connection.ts`, `src/test/fake-socket.ts`
- Test: `src/engine/connection.test.ts`

**Interfaces:**
- Consumes: `HelloData`, `ServerMessage`.
- Produces:
  - `type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'expired'`
  - `interface SocketLike { readyState: number; send(text: string): void; close(): void; onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; onclose: (() => void) | null }`
  - class `Connection`: `constructor(opts: { url: string; hello: HelloData; createSocket?: (url: string) => SocketLike; random?: () => number })`; assignable callbacks `onWelcome(data)`, `onOp(op)`, `onError(data)`, `onStatus(status)`; `start(): void`; `stop(): void`; `send(event: string, data: object): boolean` (sends `{ event, data }` only when live and open; else returns false); `readonly status: ConnectionStatus`.
  - Behavior: open -> send `hello`; `welcome` -> status `live` and reset attempts first, then `onWelcome` (so the controller can send from inside it); `op` -> `onOp`; `error` with code `not-found` -> `expired`, no reconnect; other errors -> `onError`; close while not stopped and not expired -> `reconnecting`, retry after `min(30000, 1000 * 2 ** attempt) * (0.75 + 0.5 * random())` ms (attempt starts at 0).
  - `fake-socket.ts`: `FakeSocket implements SocketLike` with `sent: unknown[]` (parsed JSON), `open()`, `receive(event, data)`, `drop()` (fires `onclose`), and a static `instances` list.

- [ ] **Step 1: Write the failing tests (use `vi.useFakeTimers()` and `random: () => 0.5`)**

```ts
it('sends hello on open and goes live on welcome', () => {
  const c = makeConnection();
  c.start(); FakeSocket.last().open();
  expect(FakeSocket.last().sent).toEqual([{ event: 'hello', data: hello }]);
  FakeSocket.last().receive('welcome', { seq: 0, you: { memberId: 'm', isOwner: false }, strokes: [] });
  expect(c.status).toBe('live');
});
it('reconnects with backoff 1 s, then 2 s', () => {
  const c = makeConnection(); c.start(); FakeSocket.last().open();
  FakeSocket.last().drop();
  expect(c.status).toBe('reconnecting');
  vi.advanceTimersByTime(999); expect(FakeSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(2);
  FakeSocket.last().drop(); vi.advanceTimersByTime(2000); expect(FakeSocket.instances).toHaveLength(3);
});
it('not-found stops reconnecting', () => {
  const c = makeConnection(); c.start(); FakeSocket.last().open();
  FakeSocket.last().receive('error', { code: 'not-found' }); FakeSocket.last().drop();
  vi.advanceTimersByTime(60_000);
  expect(c.status).toBe('expired'); expect(FakeSocket.instances).toHaveLength(1);
});
it('send works only while live', () => {
  const c = makeConnection(); c.start(); FakeSocket.last().open();
  expect(c.send('stroke.end', { strokeId: 'x' })).toBe(false);
  FakeSocket.last().receive('welcome', { seq: 0, you: { memberId: 'm', isOwner: false }, strokes: [] });
  expect(c.send('stroke.end', { strokeId: 'x' })).toBe(true);
});
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/engine/connection`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `Connection` and `FakeSocket`**

- [ ] **Step 4: Run**: Expected: 4 tests PASS.

- [ ] **Step 5: Commit**: `git add drawer-fe && git commit -m "feat(engine): add Connection with hello, backoff, and expiry"`

### Task 11: BoardController in a room

**Files:**
- Modify: `src/engine/board-controller.ts`
- Test: `src/engine/board-controller.test.ts` (add a `describe('in a room')` block)

**Interfaces:**
- Consumes: `BoardStore.applyOp`, `loadWelcome`, `History.rebuild`, `onApply`, `WelcomeData`, `OpEvent`.
- Produces on `BoardController`:
  - `interface BoardLink { send(event: string, data: object): boolean }`
  - `link(link: BoardLink | null): void` (attach or detach the room link)
  - `readonly inRoom: boolean`
  - `flush(now = performance.now()): void` keeps the M1 behavior (at most one batch from the batcher into the store per call) and, when in a room and at least 50 ms passed since the last points send, sends the active stroke's unsent points as `stroke.points` batches of at most 64 points with consecutive `n`.
  - `beginStroke` in a room also sends `stroke.start { strokeId, tool, color, width }`; `endStroke` sends the unsent points (no 50 ms wait), then `stroke.end`.
  - `undo()` and `redo()` in a room send `stroke.undo` / `stroke.redo` for stroke entries (through `History.onApply`); `clear()` does nothing in a room (M4).
  - Send progress per own stroke: `Map<strokeId, { sent: number; n: number }>` (numbers of `pts` already sent, next batch number). A send counts only when `link.send` returns true, so ops made while offline are simply not counted.
  - `handleWelcome(data: WelcomeData): void`: `store.loadWelcome(data.strokes)`; on the first welcome after `link()` only, `history.rebuild(ids of own visible strokes in ordered() order)` (later welcomes keep the undo and redo stacks); then resend by state, own strokes in `ordered()` order: set progress from the server copy (`pts.length`, `batches`), or `{ sent: 0, n: 0 }` plus `stroke.start` when the server lacks the stroke; send every unsent point; `stroke.end` if done locally and not on the server; `stroke.undo` or `stroke.redo` when `deleted` differs from the server copy (a stroke the server lacks counts as not deleted there).
  - `handleOp(op: OpEvent): void` -> `store.applyOp(op)`.

- [ ] **Step 1: Write the failing tests (a recording `BoardLink`; `now` passed explicitly)**

```ts
it('sends start, points at most every 50 ms in batches of at most 64, then end', () => { /* begin -> stroke.start; add 70 points;
  flush(0) moves 64 points and sends stroke.points n 0 with them; flush(20) moves the other 6 and sends nothing; add 3 points;
  flush(60) sends n 1 with 9 points; add 1 point; endStroke sends n 2 with 1 point, then stroke.end */ });
it('undo in a room sends stroke.undo; clear does nothing', () => { /* draw S, undo -> link saw stroke.undo { strokeId: S }; clear() -> store unchanged */ });
it('welcome resends only the points the server lacks', () => { /* live: begin S, 3 points, flush(0) (n 0), 3 points, flush(60) (n 1);
  link.send now returns false; 3 points, endStroke; welcome has S with the 3 points of batch 0, batches 1, done false;
  link sees stroke.points n 1 with the 6 later points, then stroke.end */ });
it('welcome replays strokes drawn before sharing', () => { /* two local strokes, the second undone; link(); handleWelcome(empty board);
  link sees start, points, end for the first; start, points, end, stroke.undo for the second; canUndo true, canRedo false */ });
it('a later welcome keeps the undo and redo stacks', () => { /* in a room draw S1, S2; undo S2; handleWelcome with S1 and S2 (deleted)
  as on the server -> canRedo still true and nothing is resent */ });
it('remote ops reach the store', () => { /* handleOp(start), handleOp(points) -> store has the remote stroke */ });
```

Write each body exactly as its comment describes; assert on the recorded `[event, data]` list.

- [ ] **Step 2: Run to see them fail**: `npm test -- src/engine/board-controller`. Expected: the new cases FAIL.

- [ ] **Step 3: Implement the changes above (keep every M1 test passing)**

- [ ] **Step 4: Run the whole suite**: `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**: `git add drawer-fe && git commit -m "feat(engine): send ops and reconcile by state in a room"`

### Task 12: Route, Share flow, and room UI

**Files:**
- Create: `src/app/route.ts`, `src/hooks/useRoute.ts`, `src/hooks/useRoomConnection.ts`, `src/components/ShareDialog.tsx`, `src/pages/ExpiredPage.tsx`
- Modify: `src/App.tsx`, `src/pages/BoardPage.tsx`, `src/components/TopBar.tsx`, `src/components/ToolPanel.tsx`, `vite.config.ts`, `src/styles/app.css`
- Test: `src/app/route.test.ts`, `src/pages/BoardPage.test.tsx`

**Interfaces:**
- Produces:
  - `type Route = { kind: 'local' } | { kind: 'room'; roomId: string }`; `parseRoute(pathname: string): Route` (`/r/<22 base64url chars>` -> room; anything else -> local); `goTo(path: string, replace = true): void` (`history.replaceState` or `pushState`, then dispatches `window` event `drawer:navigate`).
  - `useRoute(): Route` (listens to `popstate` and `drawer:navigate`).
  - `useRoomConnection(controller: BoardController, roomId: string | null): ConnectionStatus | 'local'` (creates a `Connection` with `url = (https ? 'wss' : 'ws') + '://' + location.host + '/ws'` and `hello` from `getIdentity()` plus `loadOwnerToken(roomId)`; wires `onWelcome -> controller.handleWelcome`, `onOp -> controller.handleOp`, `onStatus` -> state; `controller.link({ send })` while it exists; stops and unlinks on cleanup or room change).
  - `TopBar(props: { status: ConnectionStatus | 'local' | 'creating'; onShare(): void })`: badge text `Local only`, `Creating room`, `Connecting`, `Live`, `Offline, retrying`, `Room expired`; the Share button is enabled except while `creating`.
  - `ShareDialog(props: { url: string; onClose(): void })`: the link in a read-only input, a `Copy link` button (`navigator.clipboard.writeText`; on failure select the input text), the lines `Anyone with the link can draw` and `Deleted 24 hours after the last visitor`, and `Close`.
  - `ExpiredPage(props: { onNewBoard(): void })`: heading `This board has expired`, button `Start a new board from this drawing`.
  - `BoardPage`: makes a new controller whenever the route's room changes, except for the switch from `/` to `/r/<id>` made by its own Share, which keeps the board; Share when local -> `creating` -> `createRoom()` -> `saveOwnerToken` -> `goTo('/r/' + roomId)` -> dialog open; on failure back to local with the inline message `Could not create a room. Try again.`; Share when in a room opens the dialog. Expired status shows `ExpiredPage` over the board; its button calls `controller.store.adoptAllAsLocal()` and then the local Share flow. `ToolPanel` gets `canClear` (false in a room) and hides `ClearButton` when false.
  - `vite.config.ts` `server.proxy`: `'/api': 'http://127.0.0.1:3000'`, `'/ws': { target: 'ws://127.0.0.1:3000', ws: true }`.

- [ ] **Step 1: Write the failing tests**

```ts
// route.test.ts
it('parses room and local routes', () => {
  expect(parseRoute('/')).toEqual({ kind: 'local' });
  expect(parseRoute('/r/' + 'A'.repeat(22))).toEqual({ kind: 'room', roomId: 'A'.repeat(22) });
  expect(parseRoute('/r/short')).toEqual({ kind: 'local' });
});
// BoardPage.test.tsx (mock ../api/rooms createRoom; stub WebSocket with FakeSocket via vi.stubGlobal)
it('Share creates a room, moves to /r/<id>, and shows the link', async () => { /* click Share -> createRoom called once;
  location.pathname is /r/<roomId>; dialog shows input value `${location.origin}/r/<roomId>`; localStorage has drawer.owner.<roomId> */ });
it('a failed create keeps the local board and shows the message', async () => { /* createRoom rejects -> text 'Could not create a room. Try again.';
  pathname stays '/'; badge 'Local only' */ });
it('the Clear button is hidden in a room', async () => { /* after Share: no button named 'Clear board' */ });
```

- [ ] **Step 2: Run to see them fail**: `npm test -- src/app src/pages`. Expected: FAIL.

- [ ] **Step 3: Implement the files above**

- [ ] **Step 4: Run tests, build, lint**: `npm test && npm run build && npm run lint`. Expected: all PASS; exits 0.

- [ ] **Step 5: Commit**: `git add drawer-fe && git commit -m "feat(ui): add Share flow, room route, and connection status"`

### Task 13: Two-tab check against the real backend

**Files:** none new (fixes go into the files of the task that owns them, each with a failing test first).

- [ ] **Step 1: Start both apps**: `cd drawer-be && npm run start:dev` (port 3000) and `cd drawer-fe && npm run dev` (port 5173).

- [ ] **Step 2: Check in two browser tabs (Playwright or by hand). Pass when all hold:**
  - Tab 1 draws, clicks Share: the URL becomes `/r/<id>`, the dialog shows the link, the badge says `Live`.
  - Tab 2 opens the link: it sees tab 1's strokes; strokes drawn in either tab appear in the other while they are drawn.
  - Undo in tab 2 removes only tab 2's stroke in both tabs.
  - Reloading tab 2 keeps the board, and Undo still removes tab 2's earlier strokes.
  - Stopping the backend shows `Offline, retrying`; drawing continues; restarting it brings both tabs back to the same board.
  - Opening `/r/AAAAAAAAAAAAAAAAAAAAAA` shows `This board has expired`.
  - The browser console has no errors.

- [ ] **Step 3: Visual gate per `drawer-be/AGENTS.md`**: score it in one line; expected 3-4/6 (new dialog and badge states): one screenshot, at most one targeted fix.

- [ ] **Step 4: Commit any fixes**: `git commit -m "fix: ..."` per fix.

---

## Self-review notes

- Spec coverage for M2: 6.1 transport (path, envelope, 64 KiB, 5 s hello), 6.2-6.4 (M2 events and codes), 6.5 limits (4), 7.2 files (2, 6), 8.1 create (3, quotas in M5), 8.2 join (6), 8.3 ordering, repeats, abandoned strokes (5, 6), 8.4 sweeper (7), 8.6 shutdown (6), 9.2 Share (12), 9.3 drawing and 50 ms batches (11), 9.4 seq order (9), 9.5 undo in a room and rebuild after reload (9, 11), 9.6 reconnect (10, 11), 10 status states and Share dialog (12).
- Deferred on purpose: presence, cursors, `members` (M3); owner checks, Clear and restore in rooms (M4); quotas, `room-busy`, `server-busy`, `room-full`, rate limits, heartbeat, Origin check, health (M5).
- Spec readings: spec 9.6 says the `welcome` snapshot replaces local copies of strokes that have a seq; for the tab's own strokes the local copy can hold points the server lacks, so `loadWelcome` keeps them and takes only `seq` (other users' strokes are replaced). Spec 9.1 names an outbox in `Connection`; the plan reconciles by state on each `welcome` instead (progress counters plus the server copy), which resends the same ops the spec lists in 9.6 without a queue that can grow while offline.
- Small deferrals: the offline toast and the people count on the `Live` badge (M3, with presence); `isOwner` is computed now but the client uses it from M4.
- Shared names: server `OpEvent` and `WelcomeStroke` (5) match the client copies in `protocol.ts` (8); `BoardStore.applyOp`, `loadWelcome`, `adoptAllAsLocal`; `History.rebuild`, `onApply`; `BoardController.link`, `handleWelcome`, `handleOp`; `Connection.send` returns `boolean` and `BoardLink.send` matches it.
