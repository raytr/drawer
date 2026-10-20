import type { AppConfig } from '../config/app.config';
import type { RoomMeta } from '../rooms/room-files';
import { SweeperService } from './sweeper.service';

const NOW = 86_400_001;

function meta(m: Partial<RoomMeta>): RoomMeta {
  return {
    createdAt: 0,
    firstJoinAt: null,
    lastActiveAt: 0,
    ownerHash: 'h',
    ...m,
  };
}

describe('SweeperService', () => {
  it('deletes unjoined rooms after 10 min and idle rooms after 24 h, never loaded rooms', async () => {
    const metas: Array<[string, RoomMeta]> = [
      ['new', meta({})],
      ['fresh', meta({ createdAt: NOW - 10_000, lastActiveAt: NOW - 10_000 })],
      ['idle', meta({ firstJoinAt: 1 })],
      ['recent', meta({ firstJoinAt: 1, lastActiveAt: NOW - 1_000 })],
      ['busy', meta({ firstJoinAt: 1 })],
      ['loading', meta({})],
    ];
    const deleted: string[] = [];
    const rooms = {
      all: () => metas,
      delete: async (id: string) => {
        deleted.push(id);
      },
    };
    const hub = { isLoaded: (id: string) => id === 'busy' || id === 'loading' };
    const s = new SweeperService(
      rooms as never,
      hub as never,
      {
        unjoinedRoomTtlMs: 600_000,
        idleRoomTtlMs: 86_400_000,
        sweepIntervalMs: 600_000,
      } as AppConfig,
    );
    expect(await s.sweep(NOW)).toEqual(['new', 'idle']);
    expect(deleted).toEqual(['new', 'idle']);
  });

  it('sweeps on the interval and stops on destroy', async () => {
    jest.useFakeTimers();
    try {
      const rooms = { all: jest.fn(() => []), delete: jest.fn() };
      const s = new SweeperService(
        rooms as never,
        { isLoaded: () => false } as never,
        {
          unjoinedRoomTtlMs: 600_000,
          idleRoomTtlMs: 86_400_000,
          sweepIntervalMs: 600_000,
        } as AppConfig,
      );
      s.onModuleInit();
      jest.advanceTimersByTime(600_000);
      expect(rooms.all).toHaveBeenCalledTimes(1);
      s.onModuleDestroy();
      jest.advanceTimersByTime(1_200_000);
      expect(rooms.all).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
