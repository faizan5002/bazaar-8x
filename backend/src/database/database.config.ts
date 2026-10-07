import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

/** Single source of truth for the Postgres connection; used by the API and by the seed script. */
export function typeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USERNAME', 'postgres'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get<string>('DB_DATABASE', 'marketplace'),
    ssl: { rejectUnauthorized: false },
    autoLoadEntities: true,
    synchronize: config.get<string>('NODE_ENV') !== 'production',
  };
}