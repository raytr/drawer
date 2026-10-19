import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

/** Setup shared by main.ts and the e2e tests: REST under /api, WebSocket with the ws adapter. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new WsAdapter(app));
}
