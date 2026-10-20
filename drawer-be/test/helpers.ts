import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  appConfig,
  loadAppConfig,
  type AppConfig,
} from '../src/config/app.config';

export interface TestApp {
  app: INestApplication;
  port: number;
  dataDir: string;
}

/** Starts the whole app on a free port with its own temp data folder (or the given one). */
export async function startApp(
  overrides: Partial<AppConfig> = {},
): Promise<TestApp> {
  const dataDir =
    overrides.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'drawer-e2e-'));
  const cfg: AppConfig = { ...loadAppConfig({}), ...overrides, dataDir };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(appConfig.KEY)
    .useValue(cfg)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { app, port, dataDir };
}

export interface Message {
  event: string;
  data: any;
}

export interface TestClient {
  send(event: string, data: unknown): void;
  sendRaw(text: string): void;
  /** Resolves with the data of the first not yet taken message of this event that matches. */
  next(
    event: string,
    match?: (data: any) => boolean,
    timeoutMs?: number,
  ): Promise<any>;
  /** Fails if a matching message arrives within the time. */
  none(
    event: string,
    match?: (data: any) => boolean,
    ms?: number,
  ): Promise<void>;
  /** Every message of this event received so far, taken or not. */
  seen(event: string): any[];
  closed(): Promise<number>;
  close(): void;
}

export async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const all: Message[] = [];
  const untaken: Message[] = [];
  const waiters: Array<{
    event: string;
    match: (d: any) => boolean;
    resolve: (d: any) => void;
  }> = [];
  let closeCode: number | null = null;
  const closeWaiters: Array<(code: number) => void> = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as Message;
    all.push(msg);
    const i = waiters.findIndex(
      (w) => w.event === msg.event && w.match(msg.data),
    );
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg.data);
    else untaken.push(msg);
  });
  ws.on('close', (code) => {
    closeCode = code;
    for (const w of closeWaiters.splice(0)) w(code);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const any = () => true;
  return {
    send: (event, data) => ws.send(JSON.stringify({ event, data })),
    sendRaw: (text) => ws.send(text),
    next(event, match = any, timeoutMs = 2000) {
      const i = untaken.findIndex((m) => m.event === event && match(m.data));
      if (i >= 0) return Promise.resolve(untaken.splice(i, 1)[0].data);
      return new Promise((resolve, reject) => {
        const waiter = { event, match, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const j = waiters.indexOf(waiter);
          if (j < 0) return;
          waiters.splice(j, 1);
          reject(
            new Error(
              `no ${event} within ${timeoutMs} ms; got ${JSON.stringify(all)}`,
            ),
          );
        }, timeoutMs);
      });
    },
    async none(event, match = any, ms = 150) {
      await new Promise((r) => setTimeout(r, ms));
      const hit = all.find((m) => m.event === event && match(m.data));
      if (hit)
        throw new Error(`unexpected ${event}: ${JSON.stringify(hit.data)}`);
    },
    seen: (event) => all.filter((m) => m.event === event).map((m) => m.data),
    closed: () =>
      closeCode !== null
        ? Promise.resolve(closeCode)
        : new Promise((r) => closeWaiters.push(r)),
    close: () => ws.close(),
  };
}

/** Polls until the check passes or the time runs out. */
export async function waitFor(
  check: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
