import type { WebSocket } from 'ws';
import { loadAppConfig } from '../config/app.config';
import type { StrokesFile } from '../rooms/room-files';
import { BoardHub } from './board-hub';

const ROOM = 'R'.repeat(22);
const KEY = 'K'.repeat(22);
const S1 = 'S'.repeat(22);
const hello = { roomId: ROOM, userKey: KEY, name: 'Fox', color: '#1971c2' };

class FakeWs {
  readonly OPEN = 1;
  readyState = 1;
  sent: Array<{ event: string; data: any }> = [];
  closedWith: number | null = null;
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close(code = 1005) {
    this.closedWith = code;
    this.readyState = 3;
  }
}

interface StoreStub {
  readStrokes?: (id: string) => Promise<StrokesFile | null>;
  writeStrokes?: (id: string, file: StrokesFile) => Promise<void>;
}

function makeHub(store: StoreStub = {}) {
  const meta = {
    createdAt: 0,
    firstJoinAt: null,
    lastActiveAt: 0,
    ownerHash: 'h',
  };
  const rooms = {
    meta: (id: string) => (id === ROOM ? meta : undefined),
    markJoined: async () => {},
    markIdle: async () => {},
  };
  const cfg = {
    ...loadAppConfig({}),
    snapshotDebounceMs: 10,
    snapshotMaxDelayMs: 40,
    abandonedStrokeMs: 5000,
  };
  const fullStore = {
    readStrokes: async () => null,
    writeStrokes: async () => {},
    ...store,
  };
  return new BoardHub(rooms as never, fullStore as never, cfg);
}

const ws = () => new FakeWs() as FakeWs & WebSocket;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('BoardHub', () => {
  it('a hello during shutdown closes with 1012 and sends no not-found', async () => {
    const hub = makeHub();
    await hub.beforeApplicationShutdown();
    const s = ws();
    await hub.join(s, hello);
    expect(s.sent).toEqual([]);
    expect(s.closedWith).toBe(1012);
  });

  it('a load error closes with 1011 and sends no not-found', async () => {
    const hub = makeHub({
      readStrokes: () => Promise.reject(new Error('EIO')),
    });
    const s = ws();
    await hub.join(s, hello);
    expect(s.sent).toEqual([]);
    expect(s.closedWith).toBe(1011);
  });

  it('a failed unload write keeps the room in memory with its strokes', async () => {
    const hub = makeHub({
      writeStrokes: () => Promise.reject(new Error('ENOSPC')),
    });
    const a = ws();
    await hub.join(a, hello);
    hub.op(a, 'stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    await hub.leave(a);
    expect(hub.isLoaded(ROOM)).toBe(true);
    const b = ws();
    await hub.join(b, { ...hello, userKey: 'B'.repeat(22) });
    expect(b.sent[0]).toMatchObject({
      event: 'welcome',
      data: { seq: 1, strokes: [{ id: S1 }] },
    });
    await hub.beforeApplicationShutdown();
  });

  it('a failed snapshot write is retried', async () => {
    const writes: StrokesFile[] = [];
    let fail = true;
    const hub = makeHub({
      writeStrokes: async (_id, file) => {
        writes.push(file);
        if (fail) {
          fail = false;
          throw new Error('ENOSPC');
        }
      },
    });
    const a = ws();
    await hub.join(a, hello);
    hub.op(a, 'stroke.start', {
      strokeId: S1,
      tool: 'b',
      color: '#111111',
      width: 4,
    });
    await wait(150);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.at(-1)!.strokes.map((s) => s.id)).toEqual([S1]);
    await hub.beforeApplicationShutdown();
  });

  it('after a failed unload write, a retry writes the room and then unloads it', async () => {
    let calls = 0;
    const hub = makeHub({
      writeStrokes: async () => {
        calls++;
        if (calls === 1) throw new Error('ENOSPC');
      },
    });
    const a = ws();
    await hub.join(a, hello);
    await hub.leave(a);
    expect(hub.isLoaded(ROOM)).toBe(true);
    await wait(150);
    expect(calls).toBe(2);
    expect(hub.isLoaded(ROOM)).toBe(false);
  });
});
