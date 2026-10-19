import { registerAs, type ConfigType } from '@nestjs/config';

/** Every setting of the server, with the values from the design spec as defaults. */
export function loadAppConfig(env: Record<string, string | undefined>) {
  return {
    port: Number(env.PORT ?? 3000),
    host: '127.0.0.1',
    dataDir: env.DATA_DIR ?? 'data',
    helloTimeoutMs: 5000,
    snapshotDebounceMs: 2000,
    snapshotMaxDelayMs: 10000,
    abandonedStrokeMs: 30000,
    unjoinedRoomTtlMs: 600000,
    idleRoomTtlMs: 86400000,
    sweepIntervalMs: 600000,
  };
}

export const appConfig = registerAs('app', () => loadAppConfig(process.env));

export type AppConfig = ConfigType<typeof appConfig>;
