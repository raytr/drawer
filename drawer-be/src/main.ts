import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { appConfig, type AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = app.get<AppConfig>(appConfig.KEY);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(cfg.port, cfg.host);
}
void bootstrap();
