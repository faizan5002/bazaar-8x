import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed with NODE_ENV=production.');
  }
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'warn', 'error'] });
  try {
    await app.get(SeedService).run();
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  Logger.error(err instanceof Error ? err.stack : String(err), undefined, 'Seed');
  process.exit(1);
});
