import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
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
