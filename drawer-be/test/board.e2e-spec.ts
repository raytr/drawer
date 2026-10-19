import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import {
  connect,
  startApp,
  waitFor,
  type TestApp,
  type TestClient,
} from './helpers';

const KEY_A = 'A'.repeat(22);
const KEY_B = 'B'.repeat(22);
const KEY_C = 'C'.repeat(22);
const S1 = 'S'.repeat(21) + '1';
const S2 = 'S'.repeat(21) + '2';
const CONFIG = {
  snapshotDebounceMs: 50,
  snapshotMaxDelayMs: 200,
  abandonedStrokeMs: 100,
  helloTimeoutMs: 300,
};

describe('board gateway (e2e)', () => {
  let t: TestApp;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    t = await startApp(CONFIG);
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await t.app.close();
  });

  async function createRoom(): Promise<{ roomId: string; ownerToken: string }> {
    const res = await request(t.app.getHttpServer())
      .post('/api/rooms')
      .expect(201);
    return res.body;
  }

  async function open(): Promise<TestClient> {
    const c = await connect(t.port);
    clients.push(c);
    return c;
  }

  async function join(roomId: string, userKey: string, ownerToken?: string) {
    const c = await open();
    c.send('hello', {
      roomId,
      userKey,
      ownerToken,
      name: 'Fox',
      color: '#1971c2',
    });
    const welcome = await c.next('welcome');
    return { c, welcome };
  }

  function draw(c: TestClient, strokeId: string, pts = [10, 20, 30, 40]) {
    c.send('stroke.start', { strokeId, tool: 'b', color: '#e03131', width: 8 });
    c.send('stroke.points', { strokeId, n: 0, pts });
    c.send('stroke.end', { strokeId });
  }

  function strokesFile(roomId: string) {
    const file = path.join(t.dataDir, 'rooms', roomId + '.strokes');
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : null;
  }

  it('the creator is the owner; others are not', async () => {
    const { roomId, ownerToken } = await createRoom();
    expect((await join(roomId, KEY_A, ownerToken)).welcome.you.isOwner).toBe(
      true,
    );
    expect((await join(roomId, KEY_B)).welcome.you.isOwner).toBe(false);
    expect(
      (await join(roomId, KEY_C, 'x'.repeat(43))).welcome.you.isOwner,
    ).toBe(false);
  });

  it('two clients draw together; late joiner gets the full board', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    const b = await join(roomId, KEY_B);
    expect(a.welcome).toMatchObject({ seq: 0, strokes: [] });
    expect(a.welcome.you.memberId).toMatch(/^[A-Za-z0-9_-]{8}$/);
    draw(a.c, S1);
    expect(await b.c.next('op', (d) => d.kind === 'stroke.start')).toEqual({
      seq: 1,
      by: a.welcome.you.memberId,
      kind: 'stroke.start',
      strokeId: S1,
      tool: 'b',
      color: '#e03131',
      width: 8,
    });
    expect(
      await b.c.next('op', (d) => d.kind === 'stroke.points'),
    ).toMatchObject({ seq: 2, n: 0, pts: [10, 20, 30, 40] });
    expect(await b.c.next('op', (d) => d.kind === 'stroke.end')).toMatchObject({
      seq: 3,
      strokeId: S1,
    });
    expect(
      await a.c.next('op', (d) => d.kind === 'stroke.start'),
    ).toMatchObject({ seq: 1 });
    expect(await a.c.next('op', (d) => d.kind === 'stroke.end')).toMatchObject({
      seq: 3,
    });
    await a.c.none('op', (d) => d.kind === 'stroke.points');
    const c = await join(roomId, KEY_C);
    expect(c.welcome.seq).toBe(3);
    expect(c.welcome.strokes).toEqual([
      {
        id: S1,
        seq: 1,
        tool: 'b',
        color: '#e03131',
        width: 8,
        pts: [10, 20, 30, 40],
        batches: 1,
        done: true,
        deleted: false,
        mine: false,
      },
    ]);
  });

  it('interleaved strokes get one seq order for everyone', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    const b = await join(roomId, KEY_B);
    const c = await join(roomId, KEY_C);
    a.c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    b.c.send('stroke.start', {
      strokeId: S2,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    const order = async (x: TestClient) => {
      const ops = [await x.next('op'), await x.next('op')];
      return ops.map((o) => [o.seq, o.strokeId]).sort();
    };
    const [oa, ob, oc] = await Promise.all([
      order(a.c),
      order(b.c),
      order(c.c),
    ]);
    expect(oa.map((o) => o[0])).toEqual([1, 2]);
    expect(ob).toEqual(oa);
    expect(oc).toEqual(oa);
  });

  it("undo of another user's stroke gets not-yours", async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    const b = await join(roomId, KEY_B);
    draw(a.c, S1);
    await b.c.next('op', (d) => d.kind === 'stroke.end');
    b.c.send('stroke.undo', { strokeId: S1 });
    expect(await b.c.next('error')).toEqual({ code: 'not-yours', ref: S1 });
    await a.c.none('op', (d) => d.kind === 'stroke.undo');
  });

  it('hello for an unknown room gets not-found and a close', async () => {
    const c = await open();
    c.send('hello', {
      roomId: 'Z'.repeat(22),
      userKey: KEY_A,
      name: 'Fox',
      color: '#1971c2',
    });
    expect(await c.next('error')).toEqual({ code: 'not-found' });
    await c.closed();
  });

  it('garbage does not break the socket', async () => {
    const { roomId } = await createRoom();
    const c = await open();
    c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    expect(await c.next('error')).toEqual({ code: 'not-joined' });
    c.send('hello', {
      roomId,
      userKey: 'short',
      name: 'Fox',
      color: '#1971c2',
    });
    expect(await c.next('error')).toEqual({ code: 'bad-op' });
    c.send('hello', { roomId, userKey: KEY_A, name: 'Fox', color: '#1971c2' });
    await c.next('welcome');
    c.send('hello', { roomId, userKey: KEY_A, name: 'Fox', color: '#1971c2' });
    expect(await c.next('error')).toEqual({ code: 'bad-op' });
    c.sendRaw('not json');
    c.sendRaw('null');
    c.send('nope', {});
    c.send('stroke.start', { strokeId: 1 });
    expect(await c.next('error')).toEqual({ code: 'bad-op' });
    c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    expect(await c.next('op')).toMatchObject({
      seq: 1,
      kind: 'stroke.start',
      strokeId: S1,
    });
  });

  it('a deeply nested hello gets bad-op and the server keeps serving', async () => {
    const { roomId } = await createRoom();
    // Built as text: JSON.stringify itself overflows on this depth (about 54 KB, under 64 KiB).
    const name = '{"a":'.repeat(9000) + '"x"' + '}'.repeat(9000);
    const c = await open();
    c.sendRaw(
      `{"event":"hello","data":{"roomId":"${roomId}","userKey":"${KEY_A}","name":${name},"color":"#1971c2"}}`,
    );
    expect(await c.next('error')).toEqual({ code: 'bad-op' });
    const b = await join(roomId, KEY_B);
    expect(b.welcome.seq).toBe(0);
  });

  it('the last leave writes a compacted snapshot and the room reloads', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    draw(a.c, S1);
    draw(a.c, S2);
    a.c.send('stroke.undo', { strokeId: S2 });
    await a.c.next('op', (d) => d.kind === 'stroke.undo');
    a.c.close();
    await waitFor(() => strokesFile(roomId)?.strokes.length === 1);
    expect(strokesFile(roomId).strokes[0]).toMatchObject({
      id: S1,
      done: true,
    });
    const b = await join(roomId, KEY_A);
    expect(
      b.welcome.strokes.map((s: { id: string; mine: boolean }) => [
        s.id,
        s.mine,
      ]),
    ).toEqual([[S1, true]]);
    expect(b.welcome.seq).toBe(7);
  });

  it('a debounced snapshot is written while people draw', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    draw(a.c, S1);
    await waitFor(() => strokesFile(roomId)?.strokes.length === 1);
    expect(strokesFile(roomId).seq).toBe(3);
  });

  it('two hellos at once load the room once', async () => {
    const { roomId } = await createRoom();
    const first = await join(roomId, KEY_A);
    draw(first.c, S1);
    await first.c.next('op', (d) => d.kind === 'stroke.end');
    first.c.close();
    await waitFor(() => strokesFile(roomId)?.strokes[0]?.done === true);
    const a = await open();
    const b = await open();
    a.send('hello', { roomId, userKey: KEY_A, name: 'Fox', color: '#1971c2' });
    b.send('hello', { roomId, userKey: KEY_B, name: 'Owl', color: '#e03131' });
    const [wa, wb] = await Promise.all([a.next('welcome'), b.next('welcome')]);
    expect(wa.strokes).toHaveLength(1);
    expect(wb.strokes).toHaveLength(1);
    a.send('stroke.start', {
      strokeId: S2,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    expect(await b.next('op')).toMatchObject({
      kind: 'stroke.start',
      strokeId: S2,
    });
    // The sender gets its echo only when both sockets are in the same room object.
    expect(await a.next('op')).toMatchObject({
      kind: 'stroke.start',
      strokeId: S2,
    });
  });

  it('a rejoin right after the last leave sees every stroke', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    draw(a.c, S1, [1, 1, 2, 2, 3, 3]);
    await a.c.next('op', (d) => d.kind === 'stroke.end');
    a.c.close();
    const b = await join(roomId, KEY_B);
    expect(b.welcome.strokes).toMatchObject([
      { id: S1, pts: [1, 1, 2, 2, 3, 3], done: true },
    ]);
  });

  it('a socket that never sends hello is closed', async () => {
    const c = await open();
    await c.closed();
  });

  it('strokes survive a server restart', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    a.c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    a.c.send('stroke.points', { strokeId: S1, n: 0, pts: [5, 5] });
    await a.c.next('op', (d) => d.kind === 'stroke.start');
    await new Promise((r) => setTimeout(r, 20));
    await t.app.close();
    t = await startApp({ ...CONFIG, dataDir: t.dataDir });
    const b = await join(roomId, KEY_A);
    expect(b.welcome.strokes).toMatchObject([
      { id: S1, pts: [5, 5], batches: 1, done: false, mine: true },
    ]);
    b.c.send('stroke.points', { strokeId: S1, n: 1, pts: [6, 6] });
    b.c.send('stroke.end', { strokeId: S1 });
    expect(await b.c.next('op', (d) => d.kind === 'stroke.end')).toMatchObject({
      seq: 4,
    });
  });

  it('an abandoned unfinished stroke is ended by the server', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    const b = await join(roomId, KEY_B);
    a.c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    await b.c.next('op', (d) => d.kind === 'stroke.start');
    a.c.close();
    expect(await b.c.next('op', (d) => d.kind === 'stroke.end', 1000)).toEqual({
      seq: 2,
      by: null,
      kind: 'stroke.end',
      strokeId: S1,
    });
  });

  it('a returning author keeps the unfinished stroke open', async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, KEY_A);
    const b = await join(roomId, KEY_B);
    a.c.send('stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    await b.c.next('op', (d) => d.kind === 'stroke.start');
    a.c.close();
    await join(roomId, KEY_A);
    await b.c.none('op', (d) => d.kind === 'stroke.end', 250);
  });
});
