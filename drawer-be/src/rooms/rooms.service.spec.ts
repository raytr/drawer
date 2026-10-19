import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AppConfig } from '../config/app.config';
import { hashKey } from './ids';
import { RoomStore } from './room-store';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  let dataDir: string;
  let cfg: AppConfig;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawer-'));
    cfg = { dataDir } as AppConfig;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('create stores only the hash, and a restart sees the room', async () => {
    const a = new RoomsService(new RoomStore(cfg));
    await a.onModuleInit();
    const { roomId, ownerToken } = await a.create(1000);
    expect(a.meta(roomId)).toEqual({
      createdAt: 1000,
      firstJoinAt: null,
      lastActiveAt: 1000,
      ownerHash: hashKey(ownerToken),
    });
    const onDisk = fs.readFileSync(
      path.join(dataDir, 'rooms', roomId + '.json'),
      'utf8',
    );
    expect(onDisk).not.toContain(ownerToken);
    const b = new RoomsService(new RoomStore(cfg));
    await b.onModuleInit();
    expect(b.exists(roomId)).toBe(true);
    expect(b.exists('X'.repeat(22))).toBe(false);
  });

  it('markJoined sets firstJoinAt once; markIdle sets lastActiveAt', async () => {
    const s = new RoomsService(new RoomStore(cfg));
    await s.onModuleInit();
    const { roomId } = await s.create(1);
    await s.markJoined(roomId, 5);
    await s.markJoined(roomId, 9);
    await s.markIdle(roomId, 12);
    expect(s.meta(roomId)).toMatchObject({ firstJoinAt: 5, lastActiveAt: 12 });
    const again = new RoomsService(new RoomStore(cfg));
    await again.onModuleInit();
    expect(again.meta(roomId)).toMatchObject({
      firstJoinAt: 5,
      lastActiveAt: 12,
    });
  });

  it('delete removes the room from memory and disk', async () => {
    const s = new RoomsService(new RoomStore(cfg));
    await s.onModuleInit();
    const { roomId } = await s.create(1);
    await s.delete(roomId);
    expect(s.exists(roomId)).toBe(false);
    expect(s.all()).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'rooms', roomId + '.json'))).toBe(
      false,
    );
  });
});
