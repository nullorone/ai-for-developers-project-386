import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { validateEnv } from './common/config/env.schema';
import { resolveLogLevels } from './common/config/logging';

async function bootstrap(): Promise<void> {
  // Конфигурация проверяется до создания приложения: некорректное окружение
  // должно ронять процесс сразу и с понятным сообщением.
  const env = validateEnv(process.env);

  const app = await NestFactory.create(AppModule, { logger: resolveLogLevels(env.LOG_LEVEL) });

  configureApp(app, env);

  await app.listen(env.PORT, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`Backend listening on http://0.0.0.0:${env.PORT}/${env.API_PREFIX}`);
  logger.log(`Health probe: http://0.0.0.0:${env.PORT}/${env.API_PREFIX}/health`);
}

void bootstrap();
