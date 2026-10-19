import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { appConfig, type AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = app.get<AppConfig>(appConfig.KEY);
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  await app.listen(cfg.port, cfg.host);
}
void bootstrap();
