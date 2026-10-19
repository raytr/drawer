import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppConfig } from '../config/app.config';
import { RoomStore } from './room-store';

describe('RoomStore', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawer-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes and reads meta and strokes; lists metas; deletes', async () => {
    const store = new RoomStore({ dataDir } as AppConfig);
    const id = 'A'.repeat(22);
    const meta = {
      createdAt: 1,
      firstJoinAt: null,
      lastActiveAt: 1,
      ownerHash: 'h',
    };
    await store.writeMeta(id, meta);
    await store.writeStrokes(id, { v: 1, seq: 0, strokes: [] });
    expect(await store.readMeta(id)).toEqual(meta);
    expect(await store.readStrokes(id)).toEqual({ v: 1, seq: 0, strokes: [] });
    expect(await store.listMetas()).toEqual([{ id, meta }]);
    await store.deleteRoom(id);
    expect(await store.readMeta(id)).toBeNull();
    expect(await store.readStrokes(id)).toBeNull();
  });

  it('lists nothing and deletes quietly before the first write', async () => {
    const store = new RoomStore({ dataDir } as AppConfig);
    expect(await store.listMetas()).toEqual([]);
    await expect(store.deleteRoom('D'.repeat(22))).resolves.toBeUndefined();
  });

  it('leaves no temp files behind', async () => {
    const store = new RoomStore({ dataDir } as AppConfig);
    await store.writeStrokes('B'.repeat(22), { v: 1, seq: 3, strokes: [] });
    expect(fs.readdirSync(path.join(dataDir, 'rooms'))).toEqual([
      'B'.repeat(22) + '.strokes',
    ]);
  });

  it('a read waits for queued writes; the last write wins', async () => {
    const store = new RoomStore({ dataDir } as AppConfig);
    const id = 'C'.repeat(22);
    void store.writeStrokes(id, { v: 1, seq: 1, strokes: [] });
    void store.writeStrokes(id, { v: 1, seq: 2, strokes: [] });
    expect((await store.readStrokes(id))!.seq).toBe(2);
  });
});
