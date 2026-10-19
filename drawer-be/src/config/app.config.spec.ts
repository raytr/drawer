import { loadAppConfig } from './app.config';

describe('loadAppConfig', () => {
  it('uses the spec defaults', () => {
    expect(loadAppConfig({})).toEqual({
      port: 3000,
      host: '127.0.0.1',
      dataDir: 'data',
      helloTimeoutMs: 5000,
      snapshotDebounceMs: 2000,
      snapshotMaxDelayMs: 10000,
      abandonedStrokeMs: 30000,
      unjoinedRoomTtlMs: 600000,
      idleRoomTtlMs: 86400000,
      sweepIntervalMs: 600000,
    });
  });

  it('reads PORT and DATA_DIR', () => {
    expect(loadAppConfig({ PORT: '4100', DATA_DIR: '/tmp/x' })).toMatchObject({
      port: 4100,
      dataDir: '/tmp/x',
    });
  });
});
